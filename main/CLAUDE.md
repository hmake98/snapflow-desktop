# `main/` — Electron main process

Loads automatically when Claude reads a file under `main/`. Covers `main.ts` (lifecycle, 113 IPC handlers, tray menu — renamed from `background.ts`), `preload.ts`, `services/`, `utils/`, `helpers/`.

Full channel list and service inventory are in the imported files below — read them when you need the exact channel/file, not this summary.

@docs/ipc-map.md
@docs/services.md

## IPC handler pattern

Every handler in `main.ts` follows this exact shape:

```ts
ipcMain.handle("namespace:action", async (_, { param1, param2 }) => {
  try {
    const result = await someService.method(param1, param2);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
```

- **Namespace prefix required** — 21 existing namespaces, see `docs/ipc-map.md`. Don't invent a new one without checking an existing one is actually wrong for the job.
- **Return shape is always `{ success, data?, error? }`.** Renderer callers rely on this — never return raw values.
- **Wrap the entire handler body in try/catch.** No exception leaks across the IPC boundary.
- **Business logic lives in services**, not the handler — the handler is a thin adapter.
- **Expose via `preload.ts`** with a typed method on `window.api`. Renderer types auto-derive from `preload.ts`.
- **Naming:** IPC channels `namespace:kebab-case-action`; service methods camelCase; files kebab-case for multi-word (`create-window.ts`).

## Adding a new IPC handler

1. Pick the namespace (see `docs/ipc-map.md`) or confirm none fits before adding one.
2. Add the service method in `services/<area>.ts` — pure business logic, no IPC concerns.
3. Add the handler in `main.ts` (pattern above).
4. Expose in `preload.ts`: `yourAction: (param) => ipcRenderer.invoke("namespace:action", { param })`.
5. Call from renderer via `window.api.yourAction(param)`, check `result.success`.
6. `npm run type-check` — renderer types auto-derive from `preload.ts`.

## Service rules

- Each service is a class exported as a singleton: `export const fooService = new FooService();`.
- No side effects on import — no `ipcMain.on`, no log spam, no I/O at module load.
- All Supabase queries go through services. `main.ts` itself never makes raw Supabase calls.
- `getSupabase()` for user-scoped queries; `getSupabaseAdmin()` for service-role operations (invite admin API, etc.) — both in `utils/supabase.ts`.
- Always filter user-facing queries by `workspace_id`, even though RLS also enforces it (defense in depth — see `supabase/CLAUDE.md`).

## Performance

- Don't spam IPC calls — batch requests when possible.
- Permission checks are cached 60s in `captureService`; `capture:check-permission` force-clears the cache first regardless (see Capture below).
- Debounce sync operations (`sync.ts`) — prevent concurrent syncs racing each other.

## Why `app/` is `__dirname` in production

Nextron bundles `main.ts` into `app/main.js` (per `package.json` `"main": "app/main.js"`). At runtime `__dirname === "<install>/app"`, not `main/`. Resource paths must resolve relative to `app/`, e.g. `path.join(__dirname, "../resources/icon.png")`. This is the single most common source of "file not found" bugs here. Restart Electron (not just the renderer) to pick up main-process changes.

## Capture invariants

- macOS screen-recording permission requires an Electron restart after grant. `captureService.checkScreenRecordingPermission()` is the source of truth; cache cleared on app activation, and `capture:check-permission` always calls `clearPermissionCache()` first.
- On permission denied, show a dialog linking to System Settings — don't fail silently.
- Debug: confirm permission state via `capture:check-permission`, then excerpt the relevant log lines (last error stack + ~20 lines context, never a whole log file).

## Auth + session

- Login methods actually wired today: email/password and GitHub OAuth (`authService.githubSignIn()`). **No Google sign-in code path exists** despite CSP allowlisting `lh3.googleusercontent.com` and leftover Google-OAuth deep-link handling in `main.ts` — nothing in the app triggers it; treat as dead until re-verified. Magic link exists only as an invite-acceptance fallback (`workspace.ts`), not general login.
- `authService.getSession()` is **async** — always `await`.
- Auto-refresh before expiry; expiry monitor runs every minute; renderer listens for `session-expired` IPC.
- Session tokens stored via `safeStorage`, in `utils/session.ts`.

### Two separate GitHub OAuth integrations — don't conflate them

Different GitHub OAuth Apps, different credentials, different code paths:

|                   | **Login** ("Sign in with GitHub")                                      | **Sync connector** (push snaps as GitHub issues)                                                                                 |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Auth provider (via Supabase Auth)                                      | Per-workspace connector, like Zoho                                                                                               |
| Code              | `services/auth.ts` `githubSignIn()`                                    | `services/github.ts`, `services/connectors.ts`                                                                                   |
| Credentials       | Supabase Dashboard → Auth → Providers → GitHub                         | `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, seeded into the OS keychain via `npm run seed-secrets` (see `utils/secure-config.ts`) |
| Callback URL      | `https://<project-ref>.supabase.co/auth/v1/callback`                   | `http://localhost:3000/auth/github/callback`                                                                                     |
| App-side redirect | `snapflow://auth/callback` deep link → `main.ts` `handleOAuthCallback` | Same deep-link scheme for token exchange                                                                                         |
| Token stored      | Supabase session                                                       | Per-workspace `connectors` table row                                                                                             |

If GitHub login stops working, check the Supabase Dashboard, not the keychain-seeded credentials — those are for the sync connector only. Neither is ever read from a plaintext file, in dev or prod.

## Invite / join flow

1. Sender: `workspace-member:invite` → `workspace.ts` `inviteByEmail` → Supabase Admin API or OTP fallback → upsert into `pending_invites`. See ADR-0004 (repo root `docs/adr/`) for why this table exists instead of user metadata.
2. Every OAuth callback goes through `handleOAuthCallback` in `main.ts`, routing in this priority order: (1) pending invite by email → `/join-workspace`; (2) existing tenant owner → `/home`; (3) existing workspace member → `/home`; (4) new user → `/onboarding`.
3. `workspace:join` marks `accepted_at`, returns `{ alreadyOnboarded, nextPendingInvite }` so the renderer chains to the next invite.
4. Multi-invite is supported. Never rely on Supabase user metadata for invite state — it's overwritable, not a log.

## AI provider config

- Provider routing in `services/ai.ts`. `Provider = "groq" | "openai" | "gemini" | "anthropic"`.
- User-entered API keys live in `ai.ts`'s own electron-store (`snapflow-ai-settings`) via `setApiKey`/`getMaskedKey`/`clearApiKey` — **plaintext electron-store, not `safeStorage`-encrypted.** Don't confuse this with `utils/secure-config.ts` (`secureConfig`), which only holds the app's own bundled bootstrap secrets (Supabase/GitHub/Zoho client credentials), never per-user data. Never log either kind of key.
- IPC surface: `ai:*` (see `docs/ipc-map.md`).

## Auto-updates

`electron-updater` (`services/updater.ts`) is the current mechanism — not `update-electron-app`, despite older docs claiming otherwise. See ADR-0006 for the history of that drift.

# Architecture

Stack and process boundaries. Stable.

## Stack

- **Framework:** Nextron (Next.js + Electron). Main entry: `app/background.js` (bundled from `main/background.ts`).
- **Language:** TypeScript.
- **UI:** Next.js (renderer process), Tailwind CSS, Radix UI primitives, Framer Motion, Konva (annotation canvas).
- **State:** Zustand store at `renderer/store/useStore.ts`.
- **Database / Auth / Storage:** Supabase. Client in `main/utils/supabase.ts` (`getSupabase`, `getSupabaseAdmin`).
- **Local persistence:** `electron-store` for issues (`snapflow-issues.json`); plain JSON for app settings.
- **AI provider SDKs:** `@anthropic-ai/sdk`, `openai` (Anthropic, OpenAI, Groq, Gemini routed through `main/services/ai.ts`).
- **Recording:** `ffmpeg-static` + `fluent-ffmpeg`, `desktopCapturer`, `getUserMedia` via hidden BrowserWindow.
- **Logging:** `electron-log` (`~/Library/Logs/SnapFlow/`, `%APPDATA%/SnapFlow/logs/`).
- **Updates:** `electron-updater` (formerly `update-electron-app`; see `main/services/updater.ts`).

## Process boundaries

Two processes. **Cross only via IPC.** Never import `main/` from `renderer/` or vice versa.

```
main/                  Electron main process
  background.ts        Lifecycle, all 99 IPC handlers, tray menu
  preload.ts           IPC bridge → exposes window.api to renderer
  services/            Business logic (one file per domain)
  utils/               Supabase clients, session, storage, tray icons
  helpers/             Small main-process utilities

renderer/              Next.js app running in renderer process
  pages/               Next.js pages (home, auth, onboarding, recording overlays...)
  components/          Shared UI
  hooks/               useNetworkStatus, useSyncQueue
  store/               Zustand
  types/               Shared TypeScript types

resources/             Tray icons + blank.html (required for hidden recording window)
supabase/              SQL migrations + email templates
app/                   Nextron build output. NEVER EDIT.
```

## Build pipeline

- `npm run dev` — Nextron dev server (Next.js + Electron with hot reload).
- `npm run build` — Next.js build only (CI validation, no installers).
- `npm run build:pack` — full build with installers via electron-builder.
- `npm run lint` / `format` / `type-check` — standard quality gates.

Pre-commit checks run via Husky + lint-staged.

## Why `app/` is `__dirname` in production

Nextron bundles `main/background.ts` into `app/background.js`. At runtime `__dirname === "<install>/app"`, not `main/`. Resource paths must be resolved relative to `app/`, e.g. `path.join(__dirname, "../resources/blank.html")`.

This is the single most common source of "file not found" bugs in main-process code. Restart Electron (not just renderer) to pick up main-process changes.

## Capture / recording invariants

- `desktopCapturer.getSources()` returns empty thumbnails (0×0) from the main process on macOS. Use `captureFrameViaRenderer()` (hidden BrowserWindow + `getUserMedia`) instead.
- Hidden windows must `loadFile("blank.html")`. Never `loadURL("data:...")` — `data:` URLs lack `navigator.mediaDevices` (not a secure context in Chromium).
- macOS screen-recording permission requires an Electron restart after grant. `captureService.checkScreenRecordingPermission()` is the source of truth; cache cleared on app activation.

## Auth + session

- Supabase Auth (Google OAuth, email/password, magic link).
- `authService.getSession()` is **async** — always `await`.
- Auto-refresh before expiry; expiry monitor runs every minute; renderer listens for `session-expired` IPC.
- Session tokens stored via `safeStorage` in `main/utils/session.ts`.

## Multi-tenant model

`Users → Tenants → Workspaces → Snaps`. Roles: `owner | admin | member` (simplified 2026-05). Every snap and issue is scoped to a `workspace_id`. Backend (RLS) enforces this; never trust the client.

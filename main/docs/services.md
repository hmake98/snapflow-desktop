# Service inventory — `main/services/`

One line per service. Line counts as of last index update. **Use this to pick a target before reading.** Do not `grep -r main/services/`.

| Service file | Lines | Class / singleton | Responsibility |
| ------------------------ | ----- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `ai.ts` | 599 | `AiService` / `aiService` | In-app AI provider routing (Anthropic, OpenAI, Groq, Gemini). API-key storage, active-provider selection, snap-description and bug-report generation. |
| `auth.ts` | 458 | `AuthService` / `authService` | Supabase Auth: email/password + GitHub OAuth login, session lifecycle. `getSession` is async. Session expiry monitor. No Google sign-in wired up despite CSP/deep-link leftovers — verify before relying on it. |
| `capture.ts` | 591 | `CaptureService` extends `EventEmitter` | Screenshots (full screen, all screens, specific screen, active window, selected region). macOS permission handling. |
| `clipboard.ts` | 132 | `ClipboardService` / `clipboardService` | Paste-as-bug snap creation from clipboard images. |
| `connectors.ts` | 1106 | `ConnectorService` / `connectorService` | CRUD for GitHub + Zoho connector configs per workspace. Token storage. |
| `debug-collector/` (dir) | — | — | Session capture for bug reports: timeline, snapshots, screenshots. See `collector:*` IPC channels. |
| `github.ts` | 253 | `GitHubService` / `githubService` | GitHub OAuth flow, repo/user fetch, token exchange. |
| `issues.ts` | 305 | `SnapService` / `snapService` + legacy `IssueService` / `issueService` | Snap (formerly Issue) CRUD via `electron-store` (store name `snapflow-snaps`, file `snapflow-snaps.json`). |
| `onboarding.ts` | 146 | `OnboardingService` / `onboardingService` | Persistent onboarding progress (`onboarding_progress` table). Steps 1, 3, 4. |
| `settings.ts` | 76 | (named exports) | App-level settings (default capture screen, home view mode, sort, type filter, auto-sync). |
| `sync.ts` | 1064 | `SyncService` / `syncService` | Cloud sync: snap upload/download, sync history, workspace-aware. Debounced; respects offline queue. |
| `tenant.ts` | 291 | `TenantService` / `tenantService` | Tenant (organization) CRUD. `getTenantByOwner`. |
| `updater.ts` | 544 | `UpdaterService` / `updaterService` | Auto-update via `electron-updater`. Manual check, download, install. |
| `workspace.ts` | 704 | `WorkspaceService` / `workspaceService` | Workspaces + members + invites + `pending_invites`. `inviteByEmail` (admin API + OTP fallback). |
| `zoho.ts` | 521 | `ZohoService` / `zohoService` | Zoho Projects OAuth, portals, projects, task sync. |

## Picking the right service

| If your task touches...                           | Open...                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Taking a screenshot of anything                   | `capture.ts`                                                                       |
| Saving / loading snaps locally                    | `issues.ts`                                                                        |
| Pushing snaps to cloud                            | `sync.ts`                                                                          |
| Pushing to GitHub or Zoho                         | `connectors.ts` (config), `github.ts` / `zoho.ts` (API), `sync.ts` (orchestration) |
| Login / signup / session                          | `auth.ts`                                                                          |
| Org / workspace creation                          | `tenant.ts` + `workspace.ts`                                                       |
| Sending or accepting an invite                    | `workspace.ts` (`pending_invites` table)                                           |
| Onboarding step state                             | `onboarding.ts`                                                                    |
| AI provider config or snap-description generation | `ai.ts`                                                                            |
| Bug-report session capture (collector)            | `debug-collector/`                                                                 |
| Auto-update behavior                              | `updater.ts`                                                                       |

## Files exceeding 1000 lines

`connectors.ts`, `sync.ts`. If you read one whole, you have spent ~14k tokens — confirm you actually need that before doing so. Most tasks need a method or two; read by line range.

## `main/utils/` and `main/helpers/`

Not services (no IPC-facing business logic), but load-bearing infrastructure other services depend on:

| File                       | Responsibility                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/supabase.ts`        | `getSupabase()` / `getSupabaseAdmin()`. electron-store as Supabase's custom storage adapter.                                                                                                                                          |
| `utils/session.ts`         | Main-process session manager: reads existing session on startup, no network unless the token's expired.                                                                                                                               |
| `utils/storage.ts`         | `StorageManager` — filesystem reads/writes for snap metadata and files.                                                                                                                                                               |
| `utils/secure-config.ts`   | `safeStorage`-encrypted storage for the app's own bundled bootstrap secrets (Supabase/GitHub/Zoho client credentials) — not per-user data. See `main/CLAUDE.md` § AI provider config for how this differs from user-entered API keys. |
| `utils/id-generator.ts`    | Generates snap/issue IDs (date-based, not UUID).                                                                                                                                                                                      |
| `helpers/create-window.ts` | `BrowserWindow` factory (overlays, pickers) — re-exported via `helpers/index.ts`.                                                                                                                                                     |

There is no `tray-icon-manager.ts` — tray menu logic lives inline in `main/main.ts` (`updateTrayMenu()`).

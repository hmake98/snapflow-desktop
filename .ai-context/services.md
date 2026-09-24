# Service inventory — `main/services/`

One line per service. Line counts as of last index update. **Use this to pick a target before reading.** Do not `grep -r main/services/`.

| Service file | Lines | Class / singleton | Responsibility |
| ------------------------ | ----- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `ai.ts` | 569 | `AiService` / `aiService` | In-app AI provider routing (Anthropic, OpenAI, Groq, Gemini). API-key storage, active-provider selection, snap-description and bug-report generation. |
| `auth.ts` | 476 | `AuthService` / `authService` | Supabase Auth: Google OAuth, email/password, magic link, session lifecycle. `getSession` is async. Session expiry monitor. |
| `capture.ts` | 596 | `CaptureService` extends `EventEmitter` | Screenshots (full screen, all screens, specific screen, active window, selected region). macOS permission handling. |
| `clipboard.ts` | 132 | `ClipboardService` / `clipboardService` | Paste-as-bug snap creation from clipboard images. |
| `connectors.ts` | 1124 | `ConnectorService` / `connectorService` | CRUD for GitHub + Zoho connector configs per workspace. Token storage. |
| `debug-collector/` (dir) | — | — | Session capture for bug reports: timeline, snapshots, screenshots. See `collector:*` IPC channels. |
| `github.ts` | 249 | `GitHubService` / `githubService` | GitHub OAuth flow, repo/user fetch, token exchange. |
| `issues.ts` | 293 | `SnapService` / `snapService` + legacy `IssueService` / `issueService` | Snap (formerly Issue) CRUD via `electron-store` (`snapflow-issues.json`). |
| `onboarding.ts` | 155 | `OnboardingService` / `onboardingService` | Persistent onboarding progress (`onboarding_progress` table). Steps 1, 3, 4. |
| `settings.ts` | 76 | (named exports) | App-level settings (default capture screen, home view mode, sort, type filter, auto-sync). |
| `sync.ts` | 1078 | `SyncService` / `syncService` | Cloud sync: snap upload/download, sync history, workspace-aware. Debounced; respects offline queue. |
| `tenant.ts` | 297 | `TenantService` / `tenantService` | Tenant (organization) CRUD. `getTenantByOwner`. |
| `updater.ts` | 551 | `UpdaterService` / `updaterService` | Auto-update via `electron-updater`. Manual check, download, install. |
| `workspace.ts` | 722 | `WorkspaceService` / `workspaceService` | Workspaces + members + invites + `pending_invites`. `inviteByEmail` (admin API + OTP fallback). |
| `zoho.ts` | 554 | `ZohoService` / `zohoService` | Zoho Projects OAuth, portals, projects, task sync. |

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

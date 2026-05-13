# Glossary

Domain vocabulary. Use these terms precisely — confusion here causes wrong-file edits.

| Term                          | Meaning                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------ |
| **Tenant**                    | An organization. Owned by one user. Contains workspaces. Table: `tenants`.                                                                   |
| **Workspace**                 | A project space inside a tenant. Snaps and connectors are scoped here. Table: `workspaces`.                                                  |
| **Workspace member**          | A user attached to a workspace with a role. Table: `workspace_members`.                                                                      |
| **Role**                      | `owner                                                                                                                                       | admin     | member`. Simplified from the earlier 6-role model (2026-05). |
| **Snap**                      | A capture: screenshot or recording. The canonical term in the current code. Table: `snaps`. Local store: `snapflow-issues.json`.             |
| **Issue**                     | Legacy term for Snap. Still appears in IPC channels (`issue:list`, `issue:update`) and the legacy `IssueService` class. Same data as a Snap. |
| **Session** (debug-collector) | A recorded debugging session: timeline of events, snapshots, screenshots. Distinct from "auth session."                                      |
| **Session** (auth)            | Supabase Auth session. `authService.getSession()` is async.                                                                                  |
| **Connector**                 | A configured integration: GitHub or Zoho. Per workspace. Table: `connectors`.                                                                |
| **Sync**                      | Push/pull of snaps to Supabase Storage + sync to GitHub Issues / Zoho Projects. Debounced. Offline-aware via Zustand `syncQueue`.            |
| **Onboarding step**           | 1 = tenant, 3 = workspace, 4 = connectors. Step 2 was removed (it was the invite step). Persisted in `onboarding_progress`.                  |
| **Pending invite**            | Row in `pending_invites` representing an invitation that has not yet been accepted. Supports multiple simultaneous invites per email.        |
| **Active workspace**          | The currently selected workspace in the renderer. Stored in Zustand (`activeWorkspace`). Most renderer queries scope to it.                  |
| **Capture**                   | Verb: taking a screenshot. Noun: the resulting image.                                                                                        |
| **Recording**                 | A screen recording (mp4 via ffmpeg). State machine: `idle                                                                                    | selecting | recording`.                                                  |
| **Source**                    | A recording source — a specific window or screen the user picked to record. Default source can be persisted.                                 |
| **Collector**                 | The debug-collector subsystem (`main/services/debug-collector/`). Captures session timelines for bug reports.                                |
| **Overlay**                   | A frameless BrowserWindow used for area selection, recording HUD, or session HUD. See `main/services/overlay.ts`.                            |

## Common confusions

- **Snap vs Issue.** Same thing. Migration is mid-flight: schema and most renderer code uses `Snap`; IPC channel names still use `issue:`. Do not "fix" the IPC channel names without coordinating — renderer code is bound to them.
- **Session (auth) vs Session (collector).** Two unrelated subsystems sharing a word. Auth: `main/services/auth.ts`. Collector: `main/services/debug-collector/` + `session:*` IPC channels.
- **Source vs Screen.** A "screen" is a physical display from `screen.getAllDisplays()`. A "source" is what `desktopCapturer.getSources()` returns — can be a screen **or** a window.
- **Tenant vs Workspace.** A tenant is an org; a workspace is a project inside the org. A user with multiple workspaces under one tenant is normal. A user with workspaces under multiple tenants is the multi-org case.

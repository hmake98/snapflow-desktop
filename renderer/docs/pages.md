# Renderer page inventory — `renderer/pages/`

| Page                   | Purpose                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `_app.tsx`             | Global providers, network status hook, Toaster.                                           |
| `500.tsx`              | Error boundary.                                                                           |
| `auth.tsx`             | Login / signup (email/password, GitHub OAuth). No Google/magic-link login UI exists here. |
| `home.tsx`             | Main dashboard. Snap list with view modes, sort, filters. Uses `useSyncQueue`.            |
| `onboarding.tsx`       | Multi-step onboarding (steps 1 = tenant, 3 = workspace, 4 = connectors). Step 2 removed.  |
| `join-workspace.tsx`   | Invite acceptance. Multi-invite chaining via `nextPendingInvite`.                         |
| `settings.tsx`         | Tabs: account, connectors, sync, general, AI providers.                                   |
| `area-capture.tsx`     | Area-screenshot capture overlay, including the drag-rectangle selection UI.               |
| `annotate.tsx`         | Snap annotation editor (Konva).                                                           |
| `annotate-session.tsx` | Annotation for debug-collector sessions.                                                  |
| `window-capture.tsx`   | Window-screenshot capture orchestration.                                                  |
| `session-hud.tsx`      | Debug-collector session HUD.                                                              |

## Key components (`renderer/components/`)

| Component                        | Purpose                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `layout/AppShell.tsx`            | Page chrome. Also owns the offline/back-online and sync-queue-drained toasts (`useStore().isOnline`). There is no separate `OfflineBanner` component — it was folded into the toast system here. |
| `ui/WorkspaceSwitcher.tsx`       | Groups workspaces by tenant for multi-org users.                                                                                                                                                 |
| `settings/WorkspacesSection.tsx` | Workspace + org name editing, with live UI update on save.                                                                                                                                       |

## Picking the right page

- "Where is the snap list rendered?" → `home.tsx`.
- "Where does an OAuth user land after callback?" → `_app.tsx` (provider) → routing decided in `main/main.ts` `handleOAuthCallback` (renamed from `handleAuthCallback`).
- "Where is the area-selection rectangle drawn?" → `area-capture.tsx`.
- "Where does AI provider config live?" → `settings.tsx` (AI providers tab).

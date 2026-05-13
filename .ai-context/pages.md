# Renderer page inventory — `renderer/pages/`

| Page                          | Purpose                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `_app.tsx`                    | Global providers, network status hook, Toaster.                                          |
| `500.tsx`                     | Error boundary.                                                                          |
| `auth.tsx`                    | Login / signup (Google OAuth, email/password, magic link).                               |
| `home.tsx`                    | Main dashboard. Snap list with view modes, sort, filters. Uses `useSyncQueue`.           |
| `onboarding.tsx`              | Multi-step onboarding (steps 1 = tenant, 3 = workspace, 4 = connectors). Step 2 removed. |
| `join-workspace.tsx`          | Invite acceptance. Multi-invite chaining via `nextPendingInvite`.                        |
| `settings.tsx`                | Tabs: account, connectors, sync, general, AI providers.                                  |
| `area-capture.tsx`            | Area-screenshot capture overlay (full process).                                          |
| `area-selector.tsx`           | Area-selector overlay (drag-rectangle UI).                                               |
| `annotate.tsx`                | Snap annotation editor (Konva).                                                          |
| `annotate-recording.tsx`      | Annotation for screen recordings.                                                        |
| `annotate-session.tsx`        | Annotation for debug-collector sessions.                                                 |
| `window-capture.tsx`          | Window-screenshot capture orchestration.                                                 |
| `window-picker.tsx`           | Window selector UI (for recording or capture target).                                    |
| `recording-area-selector.tsx` | Area-selector overlay specific to recording start.                                       |
| `recording-control.tsx`       | Recording HUD (start/stop/pause controls).                                               |
| `recording-overlay.tsx`       | Recording-time on-screen overlay.                                                        |
| `session-hud.tsx`             | Debug-collector session HUD.                                                             |

## Picking the right page

- "Where is the snap list rendered?" → `home.tsx`.
- "Where does an OAuth user land after callback?" → `_app.tsx` (provider) → routing decided in `main/background.ts` `handleAuthCallback`.
- "Where is the area-selection rectangle drawn?" → `area-selector.tsx` (screenshot path) or `recording-area-selector.tsx` (recording path) — two separate overlays.
- "Where is the recording timer / stop button?" → `recording-control.tsx` (HUD) or system tray (see `main/background.ts` tray menu).
- "Where does AI provider config live?" → `settings.tsx` (AI providers tab).

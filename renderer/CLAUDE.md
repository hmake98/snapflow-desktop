# `renderer/` — Next.js app (Electron renderer process)

Loads automatically when Claude reads a file under `renderer/`. Next.js pages in `pages/`, shared UI in `components/`, Zustand store in `store/useStore.ts`, hooks in `hooks/`.

Full page and component inventory in the imported file below.

@docs/pages.md

## Rules

- Use `window.api.*` for any main-process call (defined in `main/preload.ts`). **Never import from `main/`** — cross only via IPC.
- Zustand (`store/useStore.ts`) for app state, not component-local state for anything shared across pages.
- Naming: pages kebab-case matching the route (`join-workspace.tsx`).
- Adding a page: create `pages/<name>.tsx` (route = filename); if it needs a custom window (overlay, picker), that window is opened from `main/main.ts` via `BrowserWindow` and loaded by file path (Nextron routes are static-exported) — that part of the change lives in `main/`, not here.

## Offline sync queue

- `hooks/useNetworkStatus.ts` mirrors `navigator.onLine` into Zustand (`isOnline`). Mounted once in `_app.tsx`.
- `hooks/useSyncQueue.ts` owns the actual queue — its own effect watches `isOnline` and drains `syncQueue` when it flips true. Mounted once, in `home.tsx`. **The queue does not drain while the user is on a page that hasn't mounted this hook.**
- The offline-aware wrappers it exposes (`syncIssue`, `syncToCloud`, `syncIssueToZoho`) queue the operation and return `false` instead of calling the API directly when offline.
- `components/layout/AppShell.tsx` shows the offline/back-online/queue-drained toasts off the same `isOnline` state. There is no separate `OfflineBanner` component — don't go looking for one.

## Auth UI

`auth.tsx` offers email/password and GitHub OAuth only. No Google sign-in, no magic-link login UI here — see `main/CLAUDE.md` § Auth + session for why (main-process auth service has no code path for either).

## Invite acceptance

`join-workspace.tsx` handles invite acceptance and multi-invite chaining via `nextPendingInvite`. The routing decision that lands a user here happens in `main/main.ts` `handleOAuthCallback`, not in this file — see `main/CLAUDE.md` § Invite / join flow for the priority order.

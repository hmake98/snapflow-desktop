# Codex Instructions for SnapFlow Desktop

This document contains guidelines for Codex when working on this Electron + Next.js desktop application.

## Project Overview

**SnapFlow Desktop** is a screenshot capture and screen recording tool with team collaboration, multi-tenant workspaces, and sync to GitHub and Zoho Projects.

- **Stack**: Electron + Next.js + TypeScript + Tailwind CSS (Nextron framework)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **State Management**: Zustand
- **Auth**: Supabase Auth (Google OAuth + Email/Password + Magic Link)
- **Build Tool**: Electron Builder

## Architecture Patterns

### Main Process (`main/background.ts`)

- Handles all Electron lifecycle and IPC communication
- Uses service classes for business logic separation
- IPC handlers use consistent pattern:
  ```typescript
  ipcMain.handle("namespace:action", async (_, args) => {
    try {
      const result = await service.method(args);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: errorMessage };
    }
  });
  ```

### Renderer (`renderer/pages/`)

- Next.js app running in Electron renderer process
- Zustand store in `renderer/store/useStore.ts`
- Components in `renderer/components/`
- Use `window.api.*` for IPC calls (defined in `main/preload.ts`)

### Services (`main/services/`)

- Modular service classes for database, auth, capture, etc.
- All Supabase queries go through services, not in `background.ts`
- Services should NOT have side effects (no IPC sends, no log spam)
- Use `getSupabase()` for user-scoped queries, `getSupabaseAdmin()` for service-role operations

## Key Design Decisions

### 1. Multi-Tenant Workspace Architecture

- Hierarchy: Users → Tenants (organizations) → Workspaces → Snaps
- Roles: `owner | admin | pm | qa | dev | client`
- All snap/issue data is scoped to `workspace_id`
- `WorkspaceSwitcher` component groups workspaces by tenant for multi-org users
- `getUserWorkspaces()` joins with tenant table to include `tenantName`

### 2. Invite & Join Flow

- Invites are sent via Supabase Admin API (`auth.admin.inviteUserByEmail`) or OTP fallback
- Every invite is recorded in the `pending_invites` table (email + workspace_id + role)
- On OAuth callback, app queries `pending_invites` by email — supports multiple simultaneous invites processed one at a time in creation order
- After joining, the invite row is marked `accepted_at` and the next unaccepted invite (if any) is returned for immediate navigation
- `workspace:join` IPC handler returns `{ alreadyOnboarded, nextPendingInvite }` to drive routing
- **Never** rely solely on Supabase user metadata for invite state — it only stores one value and gets overwritten

### 3. OAuth Callback Navigation Priority

In `handleAuthCallback` (background.ts), navigation is decided in this order:

1. **Pending invite** — query `pending_invites` by email, first unaccepted invite → `/join-workspace`
2. **Existing tenant owner** — `tenantService.getTenantByOwner()` → `/home`
3. **Existing workspace member** — `workspace_members` query → `/home`
4. **New user** — `/onboarding`

### 4. Onboarding Flow

- Persistent `onboarding_progress` table tracks current step per user
- User can pause/resume from same step even after logout
- Steps: 1 = tenant, 3 = workspace, 4 = connectors (step 2 invite was removed)
- `mode=member` onboarding: invited users skip tenant/workspace creation, go straight to connectors (step 4)
- After joining a workspace via invite, `setActiveWorkspace(workspace.id)` is called before navigating to onboarding so the correct workspace is active

### 5. Screen Recording Permission (macOS)

- On macOS, Electron needs to be restarted after user grants permission
- Permission cache is cleared on app activation and before capture
- `captureService.checkScreenRecordingPermission()` is the source of truth
- On permission denied, shows dialog with link to System Settings

### 6. Auto-Updates

- Uses `update-electron-app` package (not electron-updater)
- One-line initialization: `updateElectronApp()` in production
- Automatic background checking, downloading, and restart prompts
- No custom UI needed — handled by Electron natively

### 7. Session Management

- Uses Supabase session tokens (stored in secure store)
- `authService.getSession()` is **async** — always `await` it
- Auto-refresh tokens before expiry
- Session expiry monitor runs every minute
- Listen to `session-expired` IPC event to redirect to login

### 8. Offline Support

- `useNetworkStatus` hook monitors `navigator.onLine` and syncs to Zustand store
- `useSyncQueue` hook wraps sync operations — queues them when offline, processes on reconnect
- `OfflineBanner` component shows amber (offline) or green (draining queue) status
- Sync queue is stored in Zustand: `syncQueue`, `addToSyncQueue`, `removeFromSyncQueue`

## Common Tasks

### Adding a New IPC Handler

```typescript
// In main/background.ts
ipcMain.handle("feature:do-something", async (_, { param }) => {
  try {
    const result = await someService.doSomething(param);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// In main/preload.ts — expose to renderer
doSomething: (param: Type) => ipcRenderer.invoke('feature:do-something', { param }),

// In renderer component
const result = await window.api.doSomething(param);
```

### Adding a Database Query

- Add method to service class in `main/services/`
- Use `getSupabase()` for authenticated user queries
- Use `getSupabaseAdmin()` for service-role operations (invite management, admin tasks)
- Always include `workspace_id` filter for user-facing queries
- Return `{ success, data, error }` from IPC handler

### Handling macOS Permissions

```typescript
// Always clear cache before checking
captureService.clearPermissionCache();
const hasPermission = await captureService.checkScreenRecordingPermission();

// If not granted, use requestScreenRecordingPermission()
if (!hasPermission && process.platform === "darwin") {
  await requestScreenRecordingPermission(mode, screenId);
}
```

## Database Schema (Key Tables)

```
tenants              — organizations, owned by one user
workspaces           — project spaces within a tenant
workspace_members    — user ↔ workspace with role
pending_invites      — email + workspace_id + role, accepted_at nullable (multi-invite tracking)
onboarding_progress  — current_step + is_complete per user
snaps                — captures (screenshots/recordings) scoped to workspace
connectors           — GitHub/Zoho connector configs per workspace
sync_history         — audit log of cloud sync operations
```

Migration files are in `supabase/migrations/`. Apply with `supabase db push` or via Supabase Dashboard SQL Editor.

## File Structure Key

```
main/
  background.ts           # Electron main process, all IPC handlers
  preload.ts              # IPC bridge (window.api)
  services/               # Business logic
    auth.ts               # Supabase auth (getSession is async)
    capture.ts            # Screenshot + recording
    connectors.ts         # Connector CRUD
    github.ts             # GitHub OAuth & API
    issues.ts             # Snap/issue CRUD
    onboarding.ts         # Onboarding progress
    recorder.ts           # Screen recording
    sync.ts               # Cloud sync
    tenant.ts             # Tenant management
    workspace.ts          # Workspace + invite + pending_invites
    zoho.ts               # Zoho OAuth & Projects API
  utils/
    supabase.ts           # getSupabase() + getSupabaseAdmin()
    session.ts            # Local session management
    storage.ts            # File system storage
    tray-icon-manager.ts  # Tray icon state

renderer/
  pages/                  # Next.js pages
    _app.tsx              # Global providers + useNetworkStatus
    home.tsx              # Dashboard — uses useSyncQueue for offline support
    auth.tsx              # Login/signup
    onboarding.tsx        # Multi-step onboarding (steps 1, 3, 4 — step 2 removed)
    join-workspace.tsx    # Invite acceptance + multi-invite chaining
    settings.tsx          # Settings (account, connectors, sync, general)
  components/
    ui/
      WorkspaceSwitcher.tsx  # Groups workspaces by tenant for multi-org users
      OfflineBanner.tsx      # Offline/syncing status banner
    settings/
      WorkspacesSection.tsx  # Workspace + org name editing (live UI update on save)
  hooks/
    useNetworkStatus.ts   # navigator.onLine → Zustand isOnline
    useSyncQueue.ts       # Offline-aware sync wrapper
  store/
    useStore.ts           # Zustand — user, workspace, snaps, isOnline, syncQueue
  types/
    index.ts              # WorkspaceWithRole includes tenantName

supabase/
  migrations/             # SQL migration files (apply in order)
  templates/              # Branded email templates (confirmation, invite, magic_link, recovery)
  config.toml             # Supabase CLI config (project_id, redirect URLs, template paths)

resources/
  blank.html              # Required for hidden recording window (data: URLs lack mediaDevices)
```

## Debugging Tips

### Check Logs

```bash
# macOS: ~/Library/Logs/SnapFlow/
# Windows: %APPDATA%/SnapFlow/logs/
# Linux: ~/.config/SnapFlow/logs/
```

### Dev Mode

```bash
npm run dev          # Starts Next.js dev server + Electron
```

### Build

```bash
npm run build        # Next.js build only (CI validation)
npm run build:pack   # Full production build with installers
```

## Performance Considerations

- **Don't** spam IPC calls — batch requests when possible
- **Cache** permission checks (60-second cache in captureService)
- **Debounce** sync operations (prevent concurrent syncs)
- `desktopCapturer.getSources()` returns empty thumbnails from main process on macOS — use hidden BrowserWindow + `getUserMedia` via `captureFrameViaRenderer()` instead
- All hidden windows must use `loadFile(blank.html)`, never `loadURL('data:...')` — data URLs are not secure contexts and lack `navigator.mediaDevices`

## Security Notes

- Always validate `workspace_id` on backend (RLS policies enforce this)
- Never log sensitive data (tokens, passwords)
- Use `safeStorage` / `getSupabaseAdmin()` for service-role operations
- Never trust client-side auth checks — verify server-side
- Don't hardcode URLs — use environment variables
- Don't commit `.env` with real secrets
- `pending_invites` RLS: users can only read/update rows matching their own email

## Recent Changes

### 2026-03-31

- Fixed multi-tenant invite/join edge cases:
  - Created `pending_invites` table to track multiple simultaneous invites per user
  - `inviteByEmail` now upserts into `pending_invites` (both admin API and OTP paths)
  - OAuth callback queries `pending_invites` by email instead of user metadata
  - `workspace:join` marks invite accepted and returns `nextPendingInvite` for chaining
  - `join-workspace.tsx` sets active workspace after join + chains to next pending invite
- Fixed TypeScript linting issues (Set spread, syncStatus type, async getSession)
- Fixed Prettier formatting in supabase/templates

### 2026-03-07

- Removed custom updater service, integrated `update-electron-app`
- Fixed macOS permission flow with retry logic

### 2026-03-04

- Implemented persistent onboarding progress tracking
- Added workspace-aware sync service
- Created multi-tenant onboarding flow
- Changed "issues" → "snaps" in database and code
- Implemented offline support with sync queue
- Added branded Supabase email templates
- Removed invite-team step from onboarding flow

## Before Committing

1. `npm run format` — fix Prettier formatting
2. `npm run lint` — check ESLint
3. `npm run type-check` — verify TypeScript
4. `npm run build` — ensure build succeeds
5. No console errors in dev tools
6. Verify no secrets in code/logs

## Git Workflow

- Create feature branches from `main`
- Squash commits before PR (clean history)
- Use conventional commit messages: `feat:`, `fix:`, `refactor:`, `chore:`, etc.
- Never force-push to main
- Test locally before pushing

---

**Last Updated**: 2026-03-31
**Maintained By**: Team

# Claude Code Instructions for SnapFlow Desktop

This document contains guidelines for Claude Code when working on this Electron + Next.js desktop application.

## Project Overview

**SnapFlow Desktop** is a screenshot capture and annotation tool with synchronization to GitHub and Zoho.

- **Stack**: Electron + Next.js + TypeScript + Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **State Management**: Zustand
- **Auth**: Supabase Auth (Google OAuth + Email/Password)
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
- Zustand stores in `renderer/stores/`
- Components in `renderer/components/`
- Use `window.api.*` for IPC calls (defined in preload.ts)

### Services (`main/services/`)

- Modular service classes for database, auth, capture, etc.
- All Supabase queries go through services, not in background.ts
- Services should NOT have side effects (no IPC sends, no log spam)

## Key Design Decisions

### 1. Workspace-First Architecture

- All data (snaps, issues) scoped to workspaces, not users
- Users → Tenants → Workspaces → Snaps
- Single workspace per tenant in MVP (can extend later)

### 2. Screen Recording Permission (macOS)

- On macOS, Electron needs to be restarted after user grants permission
- Permission cache is cleared on app activation and before capture
- `captureService.checkScreenRecordingPermission()` is the source of truth
- On permission denied, shows dialog with link to System Settings

### 3. Auto-Updates (Simple)

- Uses `update-electron-app` package (not electron-updater)
- One-line initialization: `updateElectronApp()` in production
- Automatic background checking, downloading, and restart prompts
- No custom UI needed - handled by Electron natively

### 4. Session Management

- Uses Supabase session tokens (stored in secure store)
- Auto-refresh tokens before expiry
- Session expiry monitor runs every minute
- Listen to `session-expired` IPC event to redirect to login

### 5. Onboarding Flow

- Persistent `onboarding_progress` table tracks current step
- User can pause/resume from same step even after logout
- Must complete: tenant + workspace (connectors optional)
- Step navigation via `setOnboardingStep()` API

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

// In preload.ts - expose to renderer
doSomething: (param: Type) => ipcInvoke('feature:do-something', { param }),

// In renderer component
const result = await window.api.doSomething(param);
```

### Adding a Database Query

- Add method to service class in `main/services/`
- Use `getSupabase()` to get authenticated client
- Always include `workspace_id` filter for security
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

## File Structure Key

```
main/
  background.ts           # Electron main process
  preload.ts              # IPC bridge to renderer
  services/               # Business logic (auth, db, capture, etc.)
  utils/                  # Helpers (storage, session, etc.)
  helpers/                # Window creation

renderer/
  pages/                  # Next.js pages
  components/             # React components
  stores/                 # Zustand stores
  types/                  # TypeScript types

.env                      # Secrets (Supabase URL, OAuth keys, etc.)
electron-builder.yml     # Build config
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
npm run dev          # Starts dev server + Electron in dev mode
```

### Build

```bash
npm run build        # Next.js build
npm run electron:dev # Dev build
npm run electron:build # Production build
```

## Performance Considerations

- **Don't** spam IPC calls - batch requests when possible
- **Don't** put large operations in main process - use worker if needed
- **Cache** permission checks (60-second cache in captureService)
- **Debounce** sync operations (prevent concurrent syncs)
- **Lazy load** large components in renderer

## Security Notes

- ✅ Always validate workspace_id on backend
- ✅ Never log sensitive data (tokens, passwords)
- ✅ Use safeStorage for secrets (macOS Keychain, Windows DPAPI)
- ✅ Never trust client-side auth checks - verify server-side
- ❌ Don't hardcode URLs - use environment variables
- ❌ Don't commit .env with real secrets

## Recent Changes (Track These)

### 2026-03-07

- ✅ Removed custom updater service
- ✅ Integrated `update-electron-app` for simpler updates
- ✅ Removed UpdateBanner from header
- ✅ Fixed macOS permission flow with retry logic
- ✅ Removed app-bootstrap.json from build (uses .env fallback)

### 2026-03-04

- ✅ Implemented persistent onboarding progress tracking
- ✅ Added workspace-aware sync service
- ✅ Created multi-tenant onboarding flow
- ✅ Changed "issues" → "snaps" in database and code

## Before Committing

1. Run tests: `npm test` (if tests exist)
2. Build check: `npm run build`
3. No console errors in dev tools
4. Verify no secrets in code/logs
5. Update MEMORY.md if major architectural change

## When Asking for Help

Provide:

- What you're trying to accomplish
- Relevant error messages
- Which file you're working in
- The specific line numbers if possible

## Git Workflow

- Create feature branches from `main`
- Squash commits before PR (clean history)
- Use conventional commit messages: `feat:`, `fix:`, `refactor:`, etc.
- Never force-push to main
- Test locally before pushing

---

**Last Updated**: 2026-03-07
**Maintained By**: Team

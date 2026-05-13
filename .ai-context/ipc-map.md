# IPC map — `main/background.ts`

99 IPC channels across 21 namespaces. **Use this instead of reading `background.ts` (4,959 lines).** Once you find the channel by name, `grep -n "namespace:action" main/background.ts` lands you on the exact handler.

## Conventions

- All channels follow `namespace:action` (kebab-case action).
- All handlers return `{ success: boolean, data?: T, error?: string }`.
- Renderer calls via `window.api.<method>` (defined in `main/preload.ts`).

## Channels by namespace

### `ai:*` — AI provider config (`main/services/ai.ts`)

- `ai:clear-key`
- `ai:get-active-provider`
- `ai:get-all-status`
- `ai:get-key`
- `ai:is-configured`
- `ai:set-active-provider`
- `ai:set-key`

### `app:*` — Window lifecycle (`main/background.ts` directly)

- `app:hide-window`
- `app:quit`
- `app:show-window`

### `capture:*` — Screenshots (`main/services/capture.ts`)

- `capture:active-window`
- `capture:all-screens`
- `capture:cancel-window-select`
- `capture:check-permission`
- `capture:clear-default-screen`
- `capture:full-screen`
- `capture:get-default-screen`
- `capture:get-displays`
- `capture:get-pending`
- `capture:get-windows`
- `capture:save`
- `capture:select-window`
- `capture:selected-region`
- `capture:specific-screen`

### `clipboard:*` — Paste as bug (`main/services/clipboard.ts`)

- `clipboard:paste-bug`

### `collector:*` — Debug-session collector (`main/services/debug-collector/`)

- `collector:capture-screenshot`
- `collector:capture-snapshot`
- `collector:get-session`
- `collector:get-timeline`
- `collector:start-session`
- `collector:stop-session`

### `connector:*` — GitHub + Zoho connector config (`main/services/connectors.ts`, `github.ts`, `zoho.ts`)

- `connector:delete`
- `connector:get-github-repos`
- `connector:get-github-token`
- `connector:get-github-user`
- `connector:get-zoho-portals`
- `connector:get-zoho-token`
- `connector:github-signin`
- `connector:list`
- `connector:update`
- `connector:zoho-signin`

### `debug:*` — Internal diagnostics (`main/background.ts`)

- `debug:test-capture`

### `file:*` — Filesystem reads (`main/utils/storage.ts`)

- `file:read-image`

### `home-prefs:*` — Home page UI prefs (`main/services/settings.ts`)

- `home-prefs:get`

### `issue:*` — Snap/issue CRUD (`main/services/issues.ts`)

- `issue:delete`
- `issue:list`
- `issue:update`

### `onboarding:*` — Onboarding progress (`main/services/onboarding.ts`)

- `onboarding:complete`
- `onboarding:get-status`
- `onboarding:set-step`

### `recording:*` — Screen recording (`main/services/recorder.ts`, `window-picker.ts`, `capture.ts`)

- `recording:area-selected`
- `recording:cancel`
- `recording:clear-default-source`
- `recording:get-default-source`
- `recording:get-pending`
- `recording:get-sources`
- `recording:get-sources-with-default`
- `recording:set-default-source`
- `recording:start`
- `recording:stop`

### `session:*` — Debug-collector session control (`main/services/debug-collector/`)

- `session:get-pending`
- `session:is-initialized`
- `session:stop`
- `session:take-screenshot`

### `settings:*` — Auto-sync toggle (`main/services/settings.ts`)

- `settings:get-auto-sync`

### `sync:*` — Cloud sync (`main/services/sync.ts`)

- `sync:from-cloud`
- `sync:full`
- `sync:get-history`
- `sync:issue`
- `sync:to-cloud`

### `tenant:*` — Tenants (`main/services/tenant.ts`)

- `tenant:create`
- `tenant:get`

### `update:*` — Auto-update (`main/services/updater.ts`)

- `update:check`
- `update:check-manual`
- `update:download`
- `update:get-info`
- `update:install`

### `user:*` — Auth (`main/services/auth.ts`)

- `user:create`
- `user:get`
- `user:get-session-expiry`
- `user:github-signin`
- `user:google-signin`
- `user:login`
- `user:logout`
- `user:remove-avatar`

### `util:*` — Misc

- `util:open-external`
- `util:show-notification`

### `window:*` — BrowserWindow controls

- `window:close`
- `window:is-maximized`
- `window:maximize`
- `window:minimize`

### `workspace:*` and `workspace-member:*` — Workspaces and members (`main/services/workspace.ts`)

- `workspace-member:list`
- `workspace:delete`
- `workspace:get-active`
- `workspace:get-info`
- `workspace:get-user-workspaces`
- `workspace:join`
- `workspace:list`
- `workspace:set-active`

## Finding a handler quickly

```bash
grep -n 'ipcMain.handle("namespace:action"' main/background.ts
```

Returns the exact line. Then `Read` a small range around it.

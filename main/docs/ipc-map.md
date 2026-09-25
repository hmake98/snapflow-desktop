# IPC map — `main/main.ts`

113 IPC channels across 21 namespaces (renamed from `background.ts`; verify this count against `grep -c 'ipcMain\.handle(' main/main.ts` if it's been a while — it drifts as features land). **Use this instead of reading `main.ts`.** Once you find the channel by name, `grep -n "namespace:action" main/main.ts` lands you on the exact handler.

## Conventions

- All channels follow `namespace:action` (kebab-case action).
- All handlers return `{ success: boolean, data?: T, error?: string }`.
- Renderer calls via `window.api.<method>` (defined in `main/preload.ts`).

## Channels by namespace

### `ai:*` — AI provider config (`main/services/ai.ts`)

- `ai:clear-key`
- `ai:generate-description`
- `ai:generate-description-from-snap`
- `ai:generate-screenshot-description`
- `ai:get-active-provider`
- `ai:get-all-status`
- `ai:get-key`
- `ai:is-configured`
- `ai:set-active-provider`
- `ai:set-key`

### `app:*` — Window lifecycle + external links (`main/main.ts` directly)

- `app:hide-window`
- `app:open-external-url`
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
- `capture:screenshot`
- `capture:select-window`
- `capture:selected-region`
- `capture:set-default-screen`
- `capture:specific-screen`

### `clipboard:*` — Paste as bug (`main/services/clipboard.ts`)

- `clipboard:copy-bug-data`
- `clipboard:paste-bug`

### `collector:*` — Debug-session collector (`main/services/debug-collector/`)

- `collector:capture-screenshot`
- `collector:capture-snapshot`
- `collector:get-session`
- `collector:get-timeline`
- `collector:start-session`
- `collector:stop-session`

### `connector:*` — GitHub + Zoho connector config (`main/services/connectors.ts`, `github.ts`, `zoho.ts`)

- `connector:add`
- `connector:delete`
- `connector:get-github-repos`
- `connector:get-github-token`
- `connector:get-github-user`
- `connector:get-zoho-portals`
- `connector:get-zoho-projects`
- `connector:get-zoho-token`
- `connector:github-signin`
- `connector:list`
- `connector:update`
- `connector:validate-github`
- `connector:validate-zoho`
- `connector:zoho-signin`

### `debug:*` — Internal diagnostics (`main/main.ts`)

- `debug:test-capture`

### `file:*` — Filesystem reads (`main/utils/storage.ts`)

- `file:read-image`

### `home-prefs:*` — Home page UI prefs (`main/services/settings.ts`)

- `home-prefs:get`
- `home-prefs:set`

### `issue:*` — Snap/issue CRUD (`main/services/issues.ts`)

- `issue:create`
- `issue:delete`
- `issue:list`
- `issue:update`

### `onboarding:*` — Onboarding progress (`main/services/onboarding.ts`)

- `onboarding:complete`
- `onboarding:get-status`
- `onboarding:set-step`

### `session:*` — Debug-collector session control (`main/services/debug-collector/`)

- `session:get-pending`
- `session:is-initialized`
- `session:save-snap`
- `session:stop`
- `session:take-screenshot`

### `settings:*` — Auto-sync toggle (`main/services/settings.ts`)

- `settings:get-auto-sync`
- `settings:set-auto-sync`

### `sync:*` — Cloud sync (`main/services/sync.ts`)

- `sync:from-cloud`
- `sync:full`
- `sync:get-history`
- `sync:issue`
- `sync:issue-zoho`
- `sync:to-cloud`

### `tenant:*` — Tenants (`main/services/tenant.ts`)

- `tenant:create`
- `tenant:get`
- `tenant:update`

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
- `user:is-session-expiring-soon`
- `user:login`
- `user:logout`
- `user:remove-avatar`
- `user:update`
- `user:upload-avatar`

No `user:google-signin` channel exists — Google login isn't wired into the app despite CSP/deep-link leftovers; see `main/CLAUDE.md` § Auth + session.

### `util:*` — Misc

- `util:open-external`

(`util:show-notification` was removed — native notifications were replaced by an in-app `CustomEvent` toast that never goes through IPC. See `preload.ts` `showNotification`.)

### `window:*` — BrowserWindow controls

- `window:close`
- `window:is-maximized`
- `window:maximize`
- `window:minimize`

### `workspace:*` — Workspaces (`main/services/workspace.ts`)

- `workspace:create`
- `workspace:delete`
- `workspace:get-active`
- `workspace:get-info`
- `workspace:get-user-workspaces`
- `workspace:join`
- `workspace:list`
- `workspace:set-active`
- `workspace:update`

### `workspace-member:*` — Workspace members + invites (`main/services/workspace.ts`)

- `workspace-member:invite`
- `workspace-member:list`
- `workspace-member:list-with-users`
- `workspace-member:remove`
- `workspace-member:update-role`

## Finding a handler quickly

```bash
grep -n 'ipcMain.handle("namespace:action"' main/main.ts
```

Returns the exact line for single-line handler declarations. Some handlers wrap the channel name onto its own line — if the direct grep misses, drop the trailing `"` and search just the channel name instead:

```bash
grep -n '"namespace:action"' main/main.ts
```

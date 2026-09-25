# SnapFlow Desktop

Screenshot/session capture tool with multi-tenant workspaces, syncing captured work out to GitHub Issues and Zoho Projects.

This is the single glossary for the repo — domain vocabulary and the codebase vocabulary needed to avoid wrong-file edits both live here. Decisions that shaped this vocabulary are recorded in `docs/adr/`.

Hierarchy: `Users → Tenants → Workspaces → Snaps`. Every Snap and Connector is scoped to a `workspace_id`; backend RLS enforces it, but application code (`main/services/*.ts`) filters defensively too — never trust the client. See `supabase/CLAUDE.md` for the tables.

## Language

### Identity & Access

**Tenant**:
An organization, owned by exactly one User. Top of the hierarchy — holds one or more Workspaces.
_Avoid_: Organization, Account

**Workspace**:
A project space within a Tenant. All Snaps and Connectors are scoped to a Workspace, not a Tenant directly.
_Avoid_: Project, Team

**Workspace Member**:
A User attached to a Workspace with a Role. Table: `workspace_members`.
_Avoid_: User (when the Workspace-scoped relationship, not the account, is what's meant)

**Role**:
A Workspace-scoped permission level for a member: `owner` (created it, full control), `admin` (manage settings/members), or `member` (create/view/capture Snaps only). Legacy roles (`pm`, `qa`, `dev`, `client`) were collapsed into `member` — see ADR-0003.
_Avoid_: pm, qa, dev, client (legacy — do not reintroduce)

**Pending Invite**:
A record of an outstanding invitation — email + Workspace + Role — not yet accepted. Multiple Pending Invites can exist at once for the same email, tracked and chained one at a time on accept. Table: `pending_invites`. See ADR-0004.
_Avoid_: Invitation, bare "Invite" as a noun (reserve "invite" for the act of sending one)

**Active Workspace**:
The Workspace currently selected in the renderer. Stored in Zustand (`activeWorkspace`); most renderer queries scope to it.

**Onboarding Step**:
Where a new User is in setup, persisted in `onboarding_progress`. Steps: 1 = tenant, 3 = workspace, 4 = connectors. Step 2 (invite) was removed — see ADR-0005.

### Capture & Sync

**Snap**:
A single captured unit of work belonging to a Workspace, typed as `screenshot` or `session`. Table: `snaps`. Local electron-store: `snapflow-snaps.json`.
_Avoid_: Issue (legacy alias kept for backwards compatibility only — still appears in IPC channel names like `issue:list`/`issue:update` and the legacy `IssueService` class; don't "fix" those without coordinating, renderer code is bound to them)

**Session** (capture):
A Snap (`type: "session"`) that captures a sequence of screenshots plus timeline events over a span of time, rather than a single screenshot. Snaps created before this type distinction existed are recognized by the presence of `sessionData` instead.
_Avoid_: Recording (the screen-recording feature was removed (2026-09); a Session is a screenshot sequence, not a video)

**Session** (auth):
A Supabase Auth session. `authService.getSession()` is async. Unrelated to Session (capture) above — same word, two subsystems (`main/services/auth.ts` vs. `main/services/debug-collector/` + `session:*` IPC channels).

**Capture**:
Verb: taking a screenshot. Noun: the resulting image.

**Collector**:
The debug-collector subsystem (`main/services/debug-collector/`). Captures session timelines — events, snapshots, screenshots — for bug reports. See `collector:*` IPC channels.

**Overlay**:
A frameless `BrowserWindow` used for area selection or the session HUD.

**Connector**:
A per-Workspace configured link to an external tracker (GitHub or Zoho Projects) that Snaps can be synced to. Table: `connectors`.
_Avoid_: Integration

**Sync**:
The act of pushing a Snap to an external tracker via a Connector, recorded in Sync History (`sync_history` table). Debounced; offline-aware via the Zustand `syncQueue`.
_Avoid_: Push, Export

## Common confusions

- **Snap vs Issue.** Same thing. Schema and most renderer code use `Snap`; IPC channel names still use `issue:`.
- **Session (auth) vs Session (capture/collector).** Two unrelated subsystems sharing a word.
- **Source vs Screen.** A "screen" is a physical display from `screen.getAllDisplays()`. A "source" is what `desktopCapturer.getSources()` returns — can be a screen **or** a window.
- **Tenant vs Workspace.** A tenant is an org; a workspace is a project inside the org. A user with multiple workspaces under one tenant is normal. A user with workspaces under multiple tenants is the multi-org case.

# `supabase/` — migrations, RLS, email templates

Loads automatically when Claude reads a file under `supabase/`. Migration files in `migrations/` are date-prefixed and applied in lexical order.

## Adding a migration

1. Create `migrations/<YYYYMMDD>_<HHMMSS>_<description>.sql`.
2. Write idempotent SQL (`IF NOT EXISTS`, `DROP ... IF EXISTS`).
3. Update RLS policies in the same file if the table is user-facing.
4. Apply locally: `supabase db push`, or paste into the Supabase Dashboard SQL editor.
5. If a service reads/writes the new column or table, update it in `main/services/*.ts` — see `main/CLAUDE.md`.

## Schema

Verified against the migrations, not hand-maintained prose. Re-check against `migrations/*.sql` after adding one — this table drifts otherwise.

| Table                 | Scoped by              | Purpose                                                                                                                                                         |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`             | — (top of hierarchy)   | Organization. `owner_id → auth.users`.                                                                                                                          |
| `workspaces`          | `tenant_id`            | Project space inside a tenant.                                                                                                                                  |
| `workspace_members`   | `workspace_id`         | User ↔ workspace with `role` (`owner \| admin \| member`; legacy `pm/qa/dev/client` coerced to `member`, see ADR-0003 in repo-root `docs/adr/`).                |
| `user_profiles`       | `id` = `auth.users.id` | Mirrors `name`/`email` from `auth.users` so anon-key clients can resolve a user without the service-role key (`auth.admin.getUserById` needs it; this doesn't). |
| `pending_invites`     | `workspace_id`         | Outstanding invite: `email` + `workspace_id` + `role`, `accepted_at` nullable. `UNIQUE(email, workspace_id)`. See ADR-0004.                                     |
| `onboarding_progress` | `user_id` (unique)     | `current_step` + `is_complete`. Steps: 1 = tenant, 3 = workspace, 4 = connectors (step 2 removed, see ADR-0005).                                                |
| `snaps`               | `workspace_id`         | Captures. `type` (`screenshot \| session`), `sync_status`, `synced_to` (JSONB), `tags`.                                                                         |
| `connectors`          | `workspace_id`         | GitHub/Zoho connector config. `type`, `config` (JSONB), `enabled`, soft-delete via `deleted_at`.                                                                |
| `sync_history`        | `workspace_id`         | Audit log of push/pull/full sync jobs: `sync_type`, `status`, counts, `errors`.                                                                                 |

All workspace-scoped tables cascade-delete on their parent (`ON DELETE CASCADE`) and are RLS-enabled. RLS is the enforcement boundary — application code (`main/services/*.ts`) must still filter by `workspace_id` defensively; see `main/CLAUDE.md`.

`pending_invites` RLS: a user can only read/update rows matching their own email (`pending_invite_read_own` policy).

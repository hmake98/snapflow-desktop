# 0003 — Collapse the six-role model to owner/admin/member

## Status

Accepted (2026-05)

## Context

The original `user_role` enum had six values: `owner`, `admin`, `pm`, `qa`, `dev`, `client`. In practice every non-owner, non-admin role had identical permissions in the app — there was no code path that branched on `pm` vs `qa` vs `dev` vs `client`. The distinction existed only in the enum and in role-label UI, not in actual authorization logic.

## Decision

Collapse to three roles:

- `owner` — workspace creator, full control
- `admin` — manages workspace, invites/removes members
- `member` — creates & views snaps (covers what `pm`/`qa`/`dev`/`client` used to mean)

Migration is two-part because Postgres can't add an enum value and use it in the same transaction:

1. `20260502000001_simplify_roles.sql` — adds `'member'` to the `user_role` enum.
2. `20260502000002_simplify_roles_data.sql` — coerces existing `workspace_members.role` and `pending_invites.role` rows from the legacy four values to `'member'`, in a separate transaction.

## Consequences

- Simpler permission checks throughout the app — three tiers instead of six with no behavioral difference between four of them.
- `pm`/`qa`/`dev`/`client` are legacy values that may still exist in old backups or external references. Never reintroduce them as meaningful role names — see `CONTEXT.md`.
- Any pre-2026-05 row with a legacy role value is coerced to `member` by the migration; there's no way to recover which of the four legacy roles a given `member` row used to be.

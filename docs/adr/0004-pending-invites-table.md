# 0004 — Track invites via a `pending_invites` table, not user metadata

## Status

Accepted (2026-03-31)

## Context

Invites were originally tracked by writing invite details into the invited user's Supabase Auth user metadata. That approach only stores one value per user — sending a second invite while the first was unaccepted silently overwrote it, and there was no record of an invite once the metadata was overwritten or the user object changed.

## Decision

Introduce a `pending_invites` table (`email`, `workspace_id`, `role`, `invited_by`, `accepted_at` nullable, `UNIQUE(email, workspace_id)`). `inviteByEmail` (`workspace.ts`) upserts into it via both the Admin API and OTP-fallback paths. The OAuth callback (`handleOAuthCallback` in `main.ts`) queries `pending_invites` by email instead of reading user metadata, and routes to `/join-workspace` for the first unaccepted invite it finds.

`workspace:join` marks the accepted row's `accepted_at` and returns `{ alreadyOnboarded, nextPendingInvite }` so the renderer can chain straight to the next pending invite instead of requiring a fresh sign-in per invite.

## Consequences

- Multiple simultaneous invites per email are now supported and processed one at a time in creation order.
- Never rely on Supabase user metadata for invite state — it's a single overwritable value, not a log. `pending_invites` is the only source of truth.
- RLS on `pending_invites` restricts each user to rows matching their own email (`pending_invite_read_own` policy).

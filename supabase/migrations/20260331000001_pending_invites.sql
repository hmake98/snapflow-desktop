-- pending_invites table
-- Tracks workspace invitations by email so multiple simultaneous invites
-- can be stored and processed in order, replacing single-value user metadata.

CREATE TABLE IF NOT EXISTS pending_invites (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role          user_role   NOT NULL DEFAULT 'dev',
  invited_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  UNIQUE (email, workspace_id)
);

ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read invites sent to their own email
CREATE POLICY "pending_invite_read_own"
  ON pending_invites FOR SELECT
  USING (email = (auth.jwt() ->> 'email'));

-- Authenticated users can mark their own invites as accepted
CREATE POLICY "pending_invite_accept_own"
  ON pending_invites FOR UPDATE
  USING (email = (auth.jwt() ->> 'email'));

-- Service-role (admin client) inserts are unrestricted — no INSERT policy needed
-- because the service role bypasses RLS entirely.

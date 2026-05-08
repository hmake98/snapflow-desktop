-- Migration (part 2 of 2): coerce legacy roles and update defaults.
--
-- Replaces the legacy six-role model (owner, admin, pm, qa, dev, client) with
-- three clear levels:
--   owner  – workspace creator, full control
--   admin  – manages workspace, invites/removes members
--   member – creates & views snaps (covers old: pm, qa, dev, client)
--
-- The 'member' value is added to the user_role enum in part 1
-- (20260502000001_simplify_roles.sql).

BEGIN;

-- 1. Coerce legacy roles to 'member'
UPDATE workspace_members
SET role = 'member'
WHERE role IN ('pm', 'qa', 'dev', 'client');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_invites' AND column_name = 'role'
  ) THEN
    UPDATE pending_invites
    SET role = 'member'
    WHERE role IN ('pm', 'qa', 'dev', 'client');
  END IF;
END;
$$;

-- 2. Update defaults to 'member' (was 'dev')
ALTER TABLE workspace_members
  ALTER COLUMN role SET DEFAULT 'member';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_invites' AND column_name = 'role'
  ) THEN
    EXECUTE 'ALTER TABLE pending_invites ALTER COLUMN role SET DEFAULT ''member''';
  END IF;
END;
$$;

COMMIT;

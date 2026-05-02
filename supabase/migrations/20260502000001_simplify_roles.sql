-- Migration: Simplify workspace_members roles to owner | admin | member
--
-- The old six-role model (owner, admin, pm, qa, dev, client) is replaced with
-- three clear levels:
--   owner  – workspace creator, full control
--   admin  – manages workspace, invites/removes members
--   member – creates & views snaps (covers old: pm, qa, dev, client)
--
-- Apply with:  supabase db push   OR paste into Supabase Dashboard SQL Editor

BEGIN;

-- 1. Coerce all legacy roles to 'member' before touching the constraint
UPDATE workspace_members
SET role = 'member'
WHERE role IN ('pm', 'qa', 'dev', 'client');

-- 2. Drop the old CHECK constraint (name may differ per project — drop by
--    searching pg_constraint if the explicit name doesn't exist)
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'workspace_members'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%pm%';   -- targets the old enum list

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE workspace_members DROP CONSTRAINT %I', v_constraint);
  END IF;
END;
$$;

-- 3. Add the new, tighter CHECK constraint
ALTER TABLE workspace_members
  ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));

-- 4. (Optional) Update pending_invites if it also stores a role column
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

COMMIT;

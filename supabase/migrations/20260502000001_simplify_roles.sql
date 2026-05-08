-- Migration (part 1 of 2): add 'member' to the user_role enum.
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction that uses the
-- new value, so this migration only adds the enum value. Part 2
-- (20260502000002_simplify_roles_data.sql) coerces legacy values and updates
-- defaults in a separate transaction.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'member';

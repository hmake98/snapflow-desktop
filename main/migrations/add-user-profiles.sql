-- ============================================================================
-- USER PROFILES TABLE
-- Mirrors name + email from auth.users so workspace members can be resolved
-- with the anon key (auth.admin.getUserById requires the service-role key).
-- ============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS — any authenticated user can read profiles of people in their workspace
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Owner can always read/update their own row
CREATE POLICY "user_profiles_self_all" ON user_profiles
  FOR ALL USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Any authenticated user can read all profiles
-- (workspace_member visibility is enforced at the workspace_members level)
CREATE POLICY "user_profiles_authenticated_read" ON user_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- 3. Function + trigger: upsert profile row whenever a user signs up or updates metadata
CREATE OR REPLACE FUNCTION public.handle_user_profile_upsert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, name, email, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), ''),
    COALESCE(NEW.email, ''),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), user_profiles.name),
    email = COALESCE(NEW.email, user_profiles.email),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger on INSERT (new sign-up)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_profile_upsert();

-- Trigger on UPDATE (name/email change)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_profile_upsert();

-- 4. Back-fill existing users
INSERT INTO public.user_profiles (id, name, email, updated_at)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1), '') AS name,
  COALESCE(email, '') AS email,
  NOW()
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  updated_at = NOW();

-- 5. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

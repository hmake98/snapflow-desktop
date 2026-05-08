-- Add avatar_url to user_profiles. Avatar files themselves live in the
-- shared "snapflow-public-bucket" under the "avatars/${userId}/" prefix,
-- so no separate storage bucket is required.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ============================================================================
-- SnapFlow — Initial Schema Migration
-- Covers: full multi-tenant schema + user profiles table
-- ============================================================================

-- ============================================================================
-- DROP UNUSED TABLES (legacy cleanup)
-- ============================================================================
DROP TABLE IF EXISTS gmail_sync_log CASCADE;
DROP TABLE IF EXISTS latest_gmail_syncs CASCADE;

-- ============================================================================
-- DROP EXISTING TABLES (clean slate, before types)
-- ============================================================================
DROP TABLE IF EXISTS sync_history CASCADE;
DROP TABLE IF EXISTS connectors CASCADE;
DROP TABLE IF EXISTS snaps CASCADE;
DROP TABLE IF EXISTS issues CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS onboarding_progress CASCADE;

-- ============================================================================
-- DROP AND RECREATE ENUM TYPES
-- ============================================================================
DROP TYPE IF EXISTS connector_type CASCADE;
DROP TYPE IF EXISTS snap_type CASCADE;
DROP TYPE IF EXISTS issue_type CASCADE;
DROP TYPE IF EXISTS sync_status CASCADE;
DROP TYPE IF EXISTS sync_type CASCADE;
DROP TYPE IF EXISTS sync_job_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

CREATE TYPE connector_type  AS ENUM ('github', 'zoho');
CREATE TYPE snap_type       AS ENUM ('screenshot', 'recording');
CREATE TYPE sync_status     AS ENUM ('local', 'synced', 'syncing', 'failed');
CREATE TYPE sync_type       AS ENUM ('push', 'pull', 'full');
CREATE TYPE sync_job_status AS ENUM ('in_progress', 'completed', 'failed');
CREATE TYPE user_role       AS ENUM ('owner', 'admin', 'pm', 'qa', 'dev', 'client');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Tenants: Companies / Organisations
CREATE TABLE tenants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  slug        TEXT        NOT NULL UNIQUE,
  description TEXT,
  logo_url    TEXT,
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Workspaces: Projects within a tenant
CREATE TABLE workspaces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  description TEXT,
  created_by  UUID        NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

-- Workspace Members: Users with roles in a workspace
CREATE TABLE workspace_members (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'dev',
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- Connectors: GitHub & Zoho Projects integrations (workspace-scoped)
CREATE TABLE connectors (
  id           TEXT    PRIMARY KEY,
  workspace_id UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by   UUID    NOT NULL REFERENCES auth.users(id),
  name         TEXT    NOT NULL,
  type         connector_type NOT NULL,
  enabled      BOOLEAN DEFAULT true,
  config       JSONB   NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

-- Snaps: Screenshots and recordings (workspace-scoped)
CREATE TABLE snaps (
  id                  TEXT         PRIMARY KEY,
  workspace_id        UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by          UUID         NOT NULL REFERENCES auth.users(id),
  title               TEXT         NOT NULL,
  description         TEXT,
  type                snap_type    NOT NULL,
  timestamp           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  file_path           TEXT,
  thumbnail_path      TEXT,
  cloud_file_url      TEXT,
  cloud_thumbnail_url TEXT,
  sync_status         sync_status  DEFAULT 'local',
  synced_to           JSONB        DEFAULT '[]',
  tags                TEXT[]       DEFAULT '{}',
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- Sync History: Track all sync operations (workspace-scoped)
CREATE TABLE sync_history (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID           NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  initiated_by UUID           NOT NULL REFERENCES auth.users(id),
  sync_type    sync_type      NOT NULL,
  status       sync_job_status DEFAULT 'in_progress',
  synced_count INTEGER        DEFAULT 0,
  failed_count INTEGER        DEFAULT 0,
  total_count  INTEGER        DEFAULT 0,
  errors       TEXT[]         DEFAULT '{}',
  started_at   TIMESTAMPTZ    DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT valid_counts CHECK (synced_count >= 0 AND failed_count >= 0 AND total_count >= 0)
);

-- Onboarding Progress: Track user's current onboarding step
CREATE TABLE onboarding_progress (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID    NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 1,
  is_complete  BOOLEAN DEFAULT false,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- User Profiles: Mirrors name + email from auth.users for anon-key lookups
-- (auth.admin.getUserById requires the service-role key; this avoids that)
CREATE TABLE user_profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL DEFAULT '',
  email      TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE snaps                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles        ENABLE ROW LEVEL SECURITY;

-- ── Tenants ────────────────────────────────────────────────────────────────────

CREATE POLICY "tenant_owner_all" ON tenants
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "tenant_admin_all" ON tenants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      INNER JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE w.tenant_id = tenants.id
        AND wm.user_id  = auth.uid()
        AND wm.role     = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces w
      INNER JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE w.tenant_id = tenants.id
        AND wm.user_id  = auth.uid()
        AND wm.role     = 'admin'
    )
  );

CREATE POLICY "tenant_member_read" ON tenants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      INNER JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE w.tenant_id = tenants.id AND wm.user_id = auth.uid()
    )
  );

-- ── Workspaces ─────────────────────────────────────────────────────────────────

CREATE POLICY "workspace_creator_all" ON workspaces
  FOR ALL USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "workspace_admin_all" ON workspaces
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id
        AND user_id = auth.uid()
        AND role    = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id
        AND user_id = auth.uid()
        AND role    = 'admin'
    )
  );

CREATE POLICY "workspace_member_read" ON workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_public_read" ON workspaces
  FOR SELECT USING (true);

-- ── Workspace Members ──────────────────────────────────────────────────────────

CREATE POLICY "workspace_member_self_read" ON workspace_members
  FOR SELECT USING (user_id = auth.uid());

-- Insert / update / delete handled by the service-role key (RLS bypass via app IPC)
CREATE POLICY "workspace_member_admin_insert" ON workspace_members
  FOR INSERT WITH CHECK (true);

CREATE POLICY "workspace_member_admin_update" ON workspace_members
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "workspace_member_admin_delete" ON workspace_members
  FOR DELETE USING (true);

-- ── Snaps ──────────────────────────────────────────────────────────────────────

CREATE POLICY "snap_creator_all" ON snaps
  FOR ALL USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "snap_workspace_member_read" ON snaps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = snaps.workspace_id AND user_id = auth.uid()
    )
  );

-- ── Connectors ─────────────────────────────────────────────────────────────────

CREATE POLICY "connector_creator_all" ON connectors
  FOR ALL USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "connector_workspace_member_read" ON connectors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = connectors.workspace_id AND user_id = auth.uid()
    )
  );

-- ── Sync History ───────────────────────────────────────────────────────────────

CREATE POLICY "sync_history_creator_all" ON sync_history
  FOR ALL USING (initiated_by = auth.uid())
  WITH CHECK (initiated_by = auth.uid());

CREATE POLICY "sync_history_workspace_member_read" ON sync_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = sync_history.workspace_id AND user_id = auth.uid()
    )
  );

-- ── Onboarding Progress ────────────────────────────────────────────────────────

CREATE POLICY "onboarding_progress_user_all" ON onboarding_progress
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "onboarding_progress_service_all" ON onboarding_progress
  FOR ALL USING (true)
  WITH CHECK (true);

-- ── User Profiles ──────────────────────────────────────────────────────────────

CREATE POLICY "user_profiles_self_all" ON user_profiles
  FOR ALL USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles_authenticated_read" ON user_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_tenants_owner_id                 ON tenants(owner_id);

CREATE INDEX idx_workspaces_tenant_id             ON workspaces(tenant_id);
CREATE INDEX idx_workspaces_slug                  ON workspaces(slug);

CREATE INDEX idx_workspace_members_workspace_id   ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id        ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_role           ON workspace_members(role);

CREATE INDEX idx_connectors_workspace_id          ON connectors(workspace_id);
CREATE INDEX idx_connectors_type                  ON connectors(type);
CREATE INDEX idx_connectors_workspace_type        ON connectors(workspace_id, type);

CREATE INDEX idx_snaps_workspace_id               ON snaps(workspace_id);
CREATE INDEX idx_snaps_sync_status                ON snaps(sync_status);
CREATE INDEX idx_snaps_timestamp                  ON snaps(timestamp DESC);
CREATE INDEX idx_snaps_workspace_timestamp        ON snaps(workspace_id, timestamp DESC);
CREATE INDEX idx_snaps_created_by                 ON snaps(created_by);

CREATE INDEX idx_sync_history_workspace_id        ON sync_history(workspace_id);
CREATE INDEX idx_sync_history_started_at          ON sync_history(started_at DESC);
CREATE INDEX idx_sync_history_workspace_status    ON sync_history(workspace_id, status);

CREATE INDEX idx_onboarding_progress_user_id      ON onboarding_progress(user_id);

CREATE INDEX idx_user_profiles_email              ON user_profiles(email);

-- ============================================================================
-- FUNCTION + TRIGGERS: keep user_profiles in sync with auth.users
-- ============================================================================

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
    name       = COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), user_profiles.name),
    email      = COALESCE(NEW.email, user_profiles.email),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_profile_upsert();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_profile_upsert();

-- ============================================================================
-- BACK-FILL: seed user_profiles for existing auth.users rows
-- ============================================================================

INSERT INTO public.user_profiles (id, name, email, updated_at)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1), '') AS name,
  COALESCE(email, '')                                                   AS email,
  NOW()
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  email      = EXCLUDED.email,
  updated_at = NOW();

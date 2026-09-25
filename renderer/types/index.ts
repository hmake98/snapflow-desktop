/**
 * Simplified three-level role model.
 *
 *  owner  – created the workspace/tenant; has all permissions
 *  admin  – can manage workspace settings, invite/remove members, change roles
 *  member – can create, view, and capture snaps; cannot manage workspace
 *
 * Legacy roles (pm | qa | dev | client) were collapsed into "member".
 * The DB migration coerces old rows automatically.
 */
export type UserRole = "owner" | "admin" | "member";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: UserRole;
  joinedAt: string;
}

export interface WorkspaceMemberWithUser extends WorkspaceMember {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
}

export interface WorkspaceWithRole extends Workspace {
  role: UserRole;
  tenantName?: string;
}

export interface WorkspaceWithMembers extends Workspace {
  members?: WorkspaceMember[];
  currentUserRole?: UserRole;
}

/** Active window/app context captured alongside each session screenshot */
export interface WindowContext {
  appName: string;
  windowTitle: string;
  url?: string;
}

export interface SessionSnapData {
  sessionId: string;
  duration: number;
  screenshotCount: number;
  eventCount: number;
  screenshotPaths: string[];
  /** Cloud storage URLs for each screenshot, populated after Supabase sync */
  cloudScreenshotUrls?: string[];
  timeline: unknown[];
  /**
   * Per-screenshot window/app metadata captured at the moment each
   * screenshot was taken. Parallel array to screenshotPaths.
   */
  windowContexts?: WindowContext[];
}

export interface Snap {
  id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  description?: string;
  type: "screenshot" | "session";
  timestamp: string;
  filePath: string;
  thumbnailPath?: string;
  cloudFileUrl?: string;
  cloudThumbnailUrl?: string;
  syncStatus: "local" | "synced" | "syncing" | "failed";
  syncedTo?: {
    platform: string;
    externalId: string;
    url?: string;
    connectorId?: string;
  }[];
  tags?: string[];
  sessionData?: SessionSnapData;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

// Backwards compatibility alias
export type Issue = Snap;

export interface GitHubConnectorConfig {
  accessToken: string;
  owner: string;
  repo: string;
}

export interface ZohoConnectorConfig {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  portalId: string;
  projectId: string;
  portalName?: string;
  projectName?: string;
  apiDomain?: string;
  accountsServer?: string;
}

export interface Connector {
  id: string;
  workspaceId: string;
  createdBy: string;
  name: string;
  type: "github" | "zoho";
  enabled: boolean;
  config: GitHubConnectorConfig | ZohoConnectorConfig;
  lastSyncAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CaptureOptions {
  mode: "fullscreen" | "window" | "region";
  windowId?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface AppSettings {
  storagePath: string;
  defaultCaptureMode: "fullscreen" | "window" | "region";
  autoSync?: boolean;
  shortcuts: {
    captureScreenshot: string;
    openApp: string;
  };
}

export interface OnboardingStatus {
  hasTenant: boolean;
  hasWorkspace: boolean;
  hasConnector: boolean;
  isComplete: boolean;
  currentStep: number; // 1=tenant, 2=invite, 3=workspace, 4=connectors
  userType?: "owner" | "member"; // owner = owns tenant, member = invited to workspace
  tenant?: Tenant;
  workspace?: Workspace;
}

export type IPCChannel =
  | "user:create"
  | "user:get"
  | "user:login"
  | "user:logout"
  | "user:get-session-expiry"
  | "user:is-session-expiring-soon"
  | "tenant:create"
  | "tenant:list"
  | "tenant:get"
  | "tenant:update"
  | "workspace:create"
  | "workspace:list"
  | "workspace:get"
  | "workspace:get-info"
  | "workspace:join"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:get-user-workspaces"
  | "workspace-member:add"
  | "workspace-member:list"
  | "workspace-member:list-with-users"
  | "workspace-member:remove"
  | "workspace-member:update-role"
  | "workspace-member:invite"
  | "onboarding:get-status"
  | "onboarding:set-step"
  | "onboarding:complete"
  | "snap:create"
  | "snap:list"
  | "snap:update"
  | "snap:delete"
  | "issue:create"
  | "issue:list"
  | "issue:update"
  | "issue:delete"
  | "capture:screenshot"
  | "clipboard:paste-bug"
  | "clipboard:copy-bug-data"
  | "connector:list"
  | "connector:add"
  | "connector:update"
  | "connector:delete"
  | "connector:validate-github"
  | "connector:validate-zoho"
  | "connector:zoho-signin"
  | "connector:get-zoho-portals"
  | "connector:get-zoho-projects"
  | "connector:github-signin"
  | "connector:get-github-repos"
  | "connector:get-github-user"
  | "sync:snap"
  | "sync:issue"
  | "sync:to-cloud"
  | "sync:from-cloud"
  | "sync:full"
  | "sync:get-history"
  | "settings:get"
  | "settings:update"
  | "app:quit"
  | "app:show-window"
  | "app:hide-window";

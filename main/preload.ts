import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value);
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);

    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  invoke(channel: string, ...args: unknown[]) {
    return ipcRenderer.invoke(channel, ...args);
  },
};

// Expose API methods
const api = {
  // User methods
  createUser: (name: string, email: string, password: string) =>
    ipcRenderer.invoke("user:create", { name, email, password }),
  loginUser: (email: string, password: string) =>
    ipcRenderer.invoke("user:login", { email, password }),
  getUser: () => ipcRenderer.invoke("user:get"),
  updateUser: (userId: string, updates: { name?: string; email?: string }) =>
    ipcRenderer.invoke("user:update", { userId, updates }),
  logout: () => ipcRenderer.invoke("user:logout"),
  googleSignIn: () => ipcRenderer.invoke("user:google-signin"),
  getSessionExpiry: () => ipcRenderer.invoke("user:get-session-expiry"),
  isSessionExpiringSoon: (minutesBuffer?: number) =>
    ipcRenderer.invoke("user:is-session-expiring-soon", { minutesBuffer }),
  isSessionInitialized: () => ipcRenderer.invoke("session:is-initialized"),

  // Tenant methods
  createTenant: (name: string, description?: string) =>
    ipcRenderer.invoke("tenant:create", { name, description }),
  getUserTenant: () => ipcRenderer.invoke("tenant:get"),
  updateTenant: (tenantId: string, name?: string, description?: string) =>
    ipcRenderer.invoke("tenant:update", { tenantId, name, description }),

  // Workspace methods
  setActiveWorkspace: (workspaceId: string) =>
    ipcRenderer.invoke("workspace:set-active", { workspaceId }),
  getActiveWorkspaceId: () => ipcRenderer.invoke("workspace:get-active"),
  createWorkspace: (tenantId: string, name: string, description?: string) =>
    ipcRenderer.invoke("workspace:create", { tenantId, name, description }),
  listWorkspaces: (tenantId: string) =>
    ipcRenderer.invoke("workspace:list", { tenantId }),
  updateWorkspace: (workspaceId: string, name?: string, description?: string) =>
    ipcRenderer.invoke("workspace:update", { workspaceId, name, description }),
  deleteWorkspace: (workspaceId: string) =>
    ipcRenderer.invoke("workspace:delete", { workspaceId }),
  getUserWorkspaces: () => ipcRenderer.invoke("workspace:get-user-workspaces"),
  getWorkspaceInfo: (workspaceId: string) =>
    ipcRenderer.invoke("workspace:get-info", { workspaceId }),
  joinWorkspace: (workspaceId: string, role: string) =>
    ipcRenderer.invoke("workspace:join", { workspaceId, role }),
  inviteTeamMember: (
    workspaceId: string,
    email: string,
    role: "admin" | "pm" | "qa" | "dev" | "client"
  ) =>
    ipcRenderer.invoke("workspace-member:invite", { workspaceId, email, role }),
  listWorkspaceMembers: (workspaceId: string) =>
    ipcRenderer.invoke("workspace-member:list", { workspaceId }),
  listWorkspaceMembersWithUsers: (workspaceId: string) =>
    ipcRenderer.invoke("workspace-member:list-with-users", { workspaceId }),
  removeWorkspaceMember: (workspaceId: string, userId: string) =>
    ipcRenderer.invoke("workspace-member:remove", { workspaceId, userId }),
  updateMemberRole: (
    workspaceId: string,
    userId: string,
    role: "admin" | "pm" | "qa" | "dev" | "client"
  ) =>
    ipcRenderer.invoke("workspace-member:update-role", {
      workspaceId,
      userId,
      role,
    }),

  // Onboarding
  getOnboardingStatus: () => ipcRenderer.invoke("onboarding:get-status"),
  setOnboardingStep: (step: number) =>
    ipcRenderer.invoke("onboarding:set-step", { step }),

  // Issue methods
  createIssue: (
    userId: string,
    title: string,
    type: "screenshot" | "recording",
    filePath: string,
    description?: string,
    thumbnailPath?: string,
    workspaceId?: string
  ) =>
    ipcRenderer.invoke("issue:create", {
      userId,
      title,
      type,
      filePath,
      description,
      thumbnailPath,
      workspaceId,
    }),
  listIssues: (userId: string, workspaceId?: string) =>
    ipcRenderer.invoke("issue:list", { userId, workspaceId }),
  updateIssue: (issueId: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke("issue:update", { issueId, updates }),
  deleteIssue: (issueId: string) =>
    ipcRenderer.invoke("issue:delete", { issueId }),

  // Capture methods - Core functions
  captureFullScreen: () => ipcRenderer.invoke("capture:full-screen"),
  captureActiveWindow: () => ipcRenderer.invoke("capture:active-window"),
  captureSelectedRegion: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => ipcRenderer.invoke("capture:selected-region", { bounds }),
  captureAllScreens: () => ipcRenderer.invoke("capture:all-screens"),
  captureSpecificScreen: (displayId: number) =>
    ipcRenderer.invoke("capture:specific-screen", { displayId }),
  getAvailableDisplays: () => ipcRenderer.invoke("capture:get-displays"),
  getDefaultCaptureScreen: () =>
    ipcRenderer.invoke("capture:get-default-screen"),
  setDefaultCaptureScreen: (displayId: number) =>
    ipcRenderer.invoke("capture:set-default-screen", { displayId }),
  clearDefaultCaptureScreen: () =>
    ipcRenderer.invoke("capture:clear-default-screen"),

  // Legacy capture methods
  captureScreenshot: (options: {
    mode: "fullscreen" | "window" | "region";
    windowId?: string;
    bounds?: { x: number; y: number; width: number; height: number };
    originOffset?: { x: number; y: number };
  }) => ipcRenderer.invoke("capture:screenshot", options),
  checkCapturePermission: () => ipcRenderer.invoke("capture:check-permission"),
  getAvailableWindows: () => ipcRenderer.invoke("capture:get-windows"),
  saveCapture: (issueId: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke("capture:save", { issueId, buffer }),
  getPendingScreenshot: () => ipcRenderer.invoke("capture:get-pending"),
  selectWindow: (windowId: string) =>
    ipcRenderer.invoke("capture:select-window", { windowId }),
  cancelWindowSelect: () => ipcRenderer.invoke("capture:cancel-window-select"),

  // Recording methods
  recordingAreaSelected: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => ipcRenderer.invoke("recording:area-selected", { bounds }),
  startRecording: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => ipcRenderer.invoke("recording:start", { bounds }),
  stopRecording: () => ipcRenderer.invoke("recording:stop"),
  cancelRecording: () => ipcRenderer.invoke("recording:cancel"),
  getPendingRecording: () => ipcRenderer.invoke("recording:get-pending"),
  getRecordingSources: () => ipcRenderer.invoke("recording:get-sources"),
  startRecordingWithSource: (args: {
    sourceId: string;
    sourceName: string;
    displayBounds?: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    setAsDefault?: boolean;
  }) => ipcRenderer.invoke("recording:start-with-source", args),
  getDefaultRecordingSource: () =>
    ipcRenderer.invoke("recording:get-default-source"),
  setDefaultRecordingSource: (source: Record<string, unknown>) =>
    ipcRenderer.invoke("recording:set-default-source", source),
  clearDefaultRecordingSource: () =>
    ipcRenderer.invoke("recording:clear-default-source"),
  getRecordingSourcesWithDefault: () =>
    ipcRenderer.invoke("recording:get-sources-with-default"),
  onShowRecordingPicker: (callback: (payload: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown) =>
      callback(payload);
    ipcRenderer.on("recording:show-picker", handler);
    return () => ipcRenderer.removeListener("recording:show-picker", handler);
  },

  // Clipboard methods
  pasteBug: (snapId: string) =>
    ipcRenderer.invoke("clipboard:paste-bug", { snapId }),
  copyBugData: (data: {
    title: string;
    description?: string;
    cloudFileUrl?: string;
    type?: string;
    filePath?: string;
    syncedTo?: {
      platform: string;
      externalId: string;
      url?: string;
      connectorId?: string;
    }[];
  }) => ipcRenderer.invoke("clipboard:copy-bug-data", data),

  // Listeners
  onRecordingSources: (callback: (sources: unknown[]) => void) => {
    return ipcRenderer.on("recording:sources", (_event, sources) =>
      callback(sources)
    );
  },

  // Connector methods
  listConnectors: (workspaceId: string) =>
    ipcRenderer.invoke("connector:list", { workspaceId }),
  addConnector: (workspaceId: string, connector: Record<string, unknown>) =>
    ipcRenderer.invoke("connector:add", { workspaceId, ...connector }),
  updateConnector: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke("connector:update", { id, updates }),
  deleteConnector: (id: string) =>
    ipcRenderer.invoke("connector:delete", { id }),
  validateZohoConnector: (accessToken: string, portalId: string) =>
    ipcRenderer.invoke("connector:validate-zoho", { accessToken, portalId }),
  zohoSignIn: () => ipcRenderer.invoke("connector:zoho-signin"),
  getZohoPortals: () => ipcRenderer.invoke("connector:get-zoho-portals"),
  getZohoProjects: (portalId: string) =>
    ipcRenderer.invoke("connector:get-zoho-projects", { portalId }),
  getZohoAccessToken: () => ipcRenderer.invoke("connector:get-zoho-token"),

  // GitHub OAuth methods
  githubSignIn: () => ipcRenderer.invoke("connector:github-signin"),
  getGitHubRepositories: () => ipcRenderer.invoke("connector:get-github-repos"),
  getGitHubUser: () => ipcRenderer.invoke("connector:get-github-user"),
  getGitHubAccessToken: () => ipcRenderer.invoke("connector:get-github-token"),

  // Sync methods - GitHub
  syncIssue: (issueId: string, connectorId: string) =>
    ipcRenderer.invoke("sync:issue", { issueId, connectorId }),
  validateGitHubConnector: (accessToken: string, owner: string, repo: string) =>
    ipcRenderer.invoke("connector:validate-github", {
      accessToken,
      owner,
      repo,
    }),

  // Sync methods - Zoho
  syncIssueToZoho: (issueId: string, connectorId: string) =>
    ipcRenderer.invoke("sync:issue-zoho", { issueId, connectorId }),

  // Sync methods - Cloud (Supabase)
  syncToCloud: (userId: string, workspaceId?: string) =>
    ipcRenderer.invoke("sync:to-cloud", { userId, workspaceId }),
  syncFromCloud: (userId: string, workspaceId?: string) =>
    ipcRenderer.invoke("sync:from-cloud", { userId, workspaceId }),
  fullSync: (userId: string, workspaceId?: string) =>
    ipcRenderer.invoke("sync:full", { userId, workspaceId }),
  getSyncHistory: (userId: string) =>
    ipcRenderer.invoke("sync:get-history", { userId }),

  // Settings methods
  getAutoSync: () => ipcRenderer.invoke("settings:get-auto-sync"),
  setAutoSync: (enabled: boolean) =>
    ipcRenderer.invoke("settings:set-auto-sync", { enabled }),
  // Database methods
  getDatabaseConfig: () => ipcRenderer.invoke("db:get-config"),
  setDatabaseConfig: (url: string) =>
    ipcRenderer.invoke("db:set-config", { url }),
  testDatabaseConnection: () => ipcRenderer.invoke("db:test-connection"),

  // File access
  readImageFile: (filePath: string) =>
    ipcRenderer.invoke("file:read-image", { filePath }),

  // App control
  quitApp: () => ipcRenderer.invoke("app:quit"),
  showWindow: () => ipcRenderer.invoke("app:show-window"),
  hideWindow: () => ipcRenderer.invoke("app:hide-window"),

  // Window control
  closeWindow: () => ipcRenderer.invoke("window:close"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),

  // Update methods
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  checkForUpdatesManual: () => ipcRenderer.invoke("update:check-manual"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  getUpdateInfo: () => ipcRenderer.invoke("update:get-info"),

  // Debug methods
  testCapture: () => ipcRenderer.invoke("debug:test-capture"),

  // Debug Collector — Collection Layer
  collectorStartSession: () => ipcRenderer.invoke("collector:start-session"),
  collectorStopSession: () => ipcRenderer.invoke("collector:stop-session"),
  collectorCaptureSnapshot: () =>
    ipcRenderer.invoke("collector:capture-snapshot"),
  collectorCaptureScreenshot: () =>
    ipcRenderer.invoke("collector:capture-screenshot"),
  collectorGetTimeline: () => ipcRenderer.invoke("collector:get-timeline"),
  collectorGetSession: () => ipcRenderer.invoke("collector:get-session"),
  onCollectorSessionStarted: (callback: () => void) => {
    const sub = () => callback();
    ipcRenderer.on("collector:session-started", sub);
    return () => ipcRenderer.removeListener("collector:session-started", sub);
  },
  onCollectorSessionStopped: (callback: (session: unknown) => void) => {
    const sub = (_: IpcRendererEvent, session: unknown) => callback(session);
    ipcRenderer.on("collector:session-stopped", sub);
    return () => ipcRenderer.removeListener("collector:session-stopped", sub);
  },

  // Session HUD + session annotate
  sessionTakeScreenshot: () => ipcRenderer.invoke("session:take-screenshot"),
  sessionStop: () => ipcRenderer.invoke("session:stop"),
  getPendingSession: () => ipcRenderer.invoke("session:get-pending"),
  saveSessionSnap: (
    title: string,
    description?: string,
    workspaceId?: string
  ) =>
    ipcRenderer.invoke("session:save-snap", {
      title,
      description,
      workspaceId,
    }),

  // AI: session description generation
  aiGenerateDescription: (params: {
    screenshotPaths: string[];
    typedTexts: string[];
    shortcuts: string[];
    clickCount: number;
    durationMs: number;
    windowContexts?: Array<{
      appName: string;
      windowTitle: string;
      url?: string;
    }>;
  }) => ipcRenderer.invoke("ai:generate-description", params),
  aiGenerateDescriptionFromSnap: (snapId: string) =>
    ipcRenderer.invoke("ai:generate-description-from-snap", { snapId }),
  aiIsConfigured: () => ipcRenderer.invoke("ai:is-configured"),
  aiGetKey: () => ipcRenderer.invoke("ai:get-key"),
  aiSetKey: (key: string) => ipcRenderer.invoke("ai:set-key", { key }),
  aiClearKey: () => ipcRenderer.invoke("ai:clear-key"),

  // Event listeners
  onScreenshotCaptured: (
    callback: (data: { dataUrl: string; mode: string }) => void
  ) => {
    const subscription = (
      _event: IpcRendererEvent,
      data: { dataUrl: string; mode: string }
    ) => callback(data);
    ipcRenderer.on("screenshot-captured", subscription);
    return () =>
      ipcRenderer.removeListener("screenshot-captured", subscription);
  },
  onBackgroundScreenshot: (
    callback: (data: { dataUrl: string; mode: string }) => void
  ) => {
    const subscription = (
      _event: IpcRendererEvent,
      data: { dataUrl: string; mode: string }
    ) => callback(data);
    ipcRenderer.on("background-screenshot", subscription);
    return () =>
      ipcRenderer.removeListener("background-screenshot", subscription);
  },
  onNavigate: (callback: (route: string) => void) => {
    const subscription = (_event: IpcRendererEvent, route: string) =>
      callback(route);
    ipcRenderer.on("navigate", subscription);
    return () => ipcRenderer.removeListener("navigate", subscription);
  },
  onAvailableWindows: (
    callback: (windows: Array<{ id: string; name: string }>) => void
  ) => {
    const subscription = (
      _event: IpcRendererEvent,
      windows: Array<{ id: string; name: string }>
    ) => callback(windows);
    ipcRenderer.on("available-windows", subscription);
    return () => ipcRenderer.removeListener("available-windows", subscription);
  },
  onUpdateStatus: (
    callback: (status: { event: string; data?: unknown }) => void
  ) => {
    const subscription = (
      _event: IpcRendererEvent,
      status: { event: string; data?: unknown }
    ) => callback(status);
    ipcRenderer.on("update-status", subscription);
    return () => ipcRenderer.removeListener("update-status", subscription);
  },
  onZohoOAuthSuccess: (callback: () => void): (() => void) => {
    const subscription = () => callback();
    ipcRenderer.on("zoho-oauth-success", subscription);
    return () => ipcRenderer.removeListener("zoho-oauth-success", subscription);
  },
  onZohoOAuthError: (callback: (error: string) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, error: string) =>
      callback(error);
    ipcRenderer.on("zoho-oauth-error", subscription);
    return () => ipcRenderer.removeListener("zoho-oauth-error", subscription);
  },
  onGitHubOAuthSuccess: (callback: () => void): (() => void) => {
    const subscription = () => callback();
    ipcRenderer.on("github-oauth-success", subscription);
    return () =>
      ipcRenderer.removeListener("github-oauth-success", subscription);
  },
  onGitHubOAuthError: (callback: (error: string) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, error: string) =>
      callback(error);
    ipcRenderer.on("github-oauth-error", subscription);
    return () => ipcRenderer.removeListener("github-oauth-error", subscription);
  },

  onSessionExpiringSoon: (
    callback: (expiresAt: number) => void
  ): (() => void) => {
    const subscription = (_event: IpcRendererEvent, expiresAt: number) =>
      callback(expiresAt);
    ipcRenderer.on("session-expiring-soon", subscription);
    return () =>
      ipcRenderer.removeListener("session-expiring-soon", subscription);
  },

  onSessionExpired: (callback: () => void): (() => void) => {
    const subscription = () => callback();
    ipcRenderer.on("session-expired", subscription);
    return () => ipcRenderer.removeListener("session-expired", subscription);
  },

  onAutoSyncCompleted: (
    callback: (data: { userId: string; syncedCount: number }) => void
  ): (() => void) => {
    const subscription = (
      _event: IpcRendererEvent,
      data: { userId: string; syncedCount: number }
    ) => callback(data);
    ipcRenderer.on("auto-sync-completed", subscription);
    return () =>
      ipcRenderer.removeListener("auto-sync-completed", subscription);
  },

  // Utility methods
  openExternalUrl: (url: string) =>
    ipcRenderer.invoke("util:open-external", { url }),
  showNotification: (title: string, body?: string) =>
    ipcRenderer.invoke("util:show-notification", { title, body }),
};

contextBridge.exposeInMainWorld("ipc", handler);
contextBridge.exposeInMainWorld("api", api);

export type IpcHandler = typeof handler;
export type API = typeof api;

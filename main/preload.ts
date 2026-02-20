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

  // Issue methods
  createIssue: (
    userId: string,
    title: string,
    type: "screenshot" | "recording",
    filePath: string,
    description?: string,
    thumbnailPath?: string
  ) =>
    ipcRenderer.invoke("issue:create", {
      userId,
      title,
      type,
      filePath,
      description,
      thumbnailPath,
    }),
  listIssues: (userId: string) => ipcRenderer.invoke("issue:list", { userId }),
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

  // Legacy capture methods
  captureScreenshot: (options: {
    mode: "fullscreen" | "window" | "region";
    windowId?: string;
    bounds?: { x: number; y: number; width: number; height: number };
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

  // Connector methods
  listConnectors: () => ipcRenderer.invoke("connector:list"),
  addConnector: (connector: Record<string, unknown>) =>
    ipcRenderer.invoke("connector:add", connector),
  updateConnector: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke("connector:update", { id, updates }),
  deleteConnector: (id: string) =>
    ipcRenderer.invoke("connector:delete", { id }),

  // Sync methods - GitHub
  syncIssue: (issueId: string, connectorId: string) =>
    ipcRenderer.invoke("sync:issue", { issueId, connectorId }),
  validateGitHubConnector: (accessToken: string, owner: string, repo: string) =>
    ipcRenderer.invoke("connector:validate-github", {
      accessToken,
      owner,
      repo,
    }),

  // Sync methods - Cloud (Supabase)
  syncToCloud: (userId: string) =>
    ipcRenderer.invoke("sync:to-cloud", { userId }),
  syncFromCloud: (userId: string) =>
    ipcRenderer.invoke("sync:from-cloud", { userId }),
  fullSync: (userId: string) => ipcRenderer.invoke("sync:full", { userId }),
  getSyncHistory: (userId: string) =>
    ipcRenderer.invoke("sync:get-history", { userId }),

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
};

contextBridge.exposeInMainWorld("ipc", handler);
contextBridge.exposeInMainWorld("api", api);

export type IpcHandler = typeof handler;
export type API = typeof api;

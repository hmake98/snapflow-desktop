export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Issue {
  id: string;
  title: string;
  description?: string;
  type: "screenshot" | "recording";
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
  userId: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface Connector {
  id: string;
  name: string;
  type: "github";
  enabled: boolean;
  config: {
    accessToken: string;
    owner: string;
    repo: string;
  };
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

export interface RecordingOptions {
  mode: "fullscreen" | "region";
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  audioEnabled?: boolean;
}

export interface AppSettings {
  storagePath: string;
  defaultCaptureMode: "fullscreen" | "window" | "region";
  defaultRecordingMode: "fullscreen" | "region";
  shortcuts: {
    captureScreenshot: string;
    recordScreen: string;
    openApp: string;
  };
}

export type IPCChannel =
  | "user:create"
  | "user:get"
  | "user:login"
  | "issue:create"
  | "issue:list"
  | "issue:update"
  | "issue:delete"
  | "capture:screenshot"
  | "capture:start-recording"
  | "capture:stop-recording"
  | "connector:list"
  | "connector:add"
  | "connector:update"
  | "connector:delete"
  | "sync:issue"
  | "db:get-config"
  | "db:set-config"
  | "db:test-connection"
  | "settings:get"
  | "settings:update"
  | "app:quit"
  | "app:show-window"
  | "app:hide-window";

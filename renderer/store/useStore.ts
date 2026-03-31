import { create } from "zustand";
import type {
  User,
  Issue,
  Connector,
  Workspace,
  ShowPickerPayload,
} from "../types";

export type QueuedSyncType = "syncIssue" | "syncToCloud" | "syncIssueToZoho";

export interface QueuedSync {
  id: string;
  type: QueuedSyncType;
  params: Record<string, string>;
  addedAt: string;
}

interface AppState {
  // User state
  user: User | null;
  setUser: (user: User | null) => void;

  // Active workspace state (persisted across pages)
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (workspace: Workspace | null) => void;

  // Issues state
  issues: Issue[];
  setIssues: (issues: Issue[]) => void;
  addIssue: (issue: Issue) => void;
  updateIssue: (issueId: string, updates: Partial<Issue>) => void;
  deleteIssue: (issueId: string) => void;

  // Connectors state
  connectors: Connector[];
  setConnectors: (connectors: Connector[]) => void;
  addConnector: (connector: Connector) => void;
  updateConnector: (connectorId: string, updates: Partial<Connector>) => void;
  deleteConnector: (connectorId: string) => void;

  // UI state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Network / offline state
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;

  // Sync queue (operations queued while offline)
  syncQueue: QueuedSync[];
  addToSyncQueue: (item: Omit<QueuedSync, "id" | "addedAt">) => void;
  removeFromSyncQueue: (id: string) => void;
  clearSyncQueue: () => void;
  processSyncQueue: () => void;

  // Recording picker state (global so modal works on any page)
  pickerPayload: ShowPickerPayload | null;
  showRecordingPicker: boolean;
  setPickerPayload: (payload: ShowPickerPayload | null) => void;
  setShowRecordingPicker: (show: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  // User state
  user: null,
  setUser: (user) => set({ user }),

  // Active workspace
  activeWorkspace: null,
  setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),

  // Issues state
  issues: [],
  setIssues: (issues) => set({ issues }),
  addIssue: (issue) => set((state) => ({ issues: [issue, ...state.issues] })),
  updateIssue: (issueId, updates) =>
    set((state) => ({
      issues: state.issues.map((issue) =>
        issue.id === issueId ? { ...issue, ...updates } : issue
      ),
    })),
  deleteIssue: (issueId) =>
    set((state) => ({
      issues: state.issues.filter((issue) => issue.id !== issueId),
    })),

  // Connectors state
  connectors: [],
  setConnectors: (connectors) => set({ connectors }),
  addConnector: (connector) =>
    set((state) => ({ connectors: [...state.connectors, connector] })),
  updateConnector: (connectorId, updates) =>
    set((state) => ({
      connectors: state.connectors.map((connector) =>
        connector.id === connectorId ? { ...connector, ...updates } : connector
      ),
    })),
  deleteConnector: (connectorId) =>
    set((state) => ({
      connectors: state.connectors.filter((c) => c.id !== connectorId),
    })),

  // UI state
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  // Network / offline state
  isOnline: true,
  setIsOnline: (isOnline) => set({ isOnline }),

  // Sync queue
  syncQueue: [],
  addToSyncQueue: (item) =>
    set((state) => ({
      syncQueue: [
        ...state.syncQueue,
        {
          ...item,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          addedAt: new Date().toISOString(),
        },
      ],
    })),
  removeFromSyncQueue: (id) =>
    set((state) => ({
      syncQueue: state.syncQueue.filter((q) => q.id !== id),
    })),
  clearSyncQueue: () => set({ syncQueue: [] }),
  processSyncQueue: () => {
    // Actual processing is handled by the useSyncQueue hook in home.tsx
    // This is a no-op placeholder; the hook subscribes to isOnline changes
    // and processes the queue. Kept here so useNetworkStatus can call it.
  },

  // Recording picker state
  pickerPayload: null,
  showRecordingPicker: false,
  setPickerPayload: (pickerPayload) => set({ pickerPayload }),
  setShowRecordingPicker: (showRecordingPicker) => set({ showRecordingPicker }),
}));

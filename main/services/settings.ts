import Store from "electron-store";

export interface RecordingSource {
  id: string;
  name: string;
  type: "screen" | "window";
  displayBounds?: { x: number; y: number; width: number; height: number };
}

export type HomeViewMode = "grid" | "list";
export type HomeSortBy = "date" | "name";
export type HomeSortOrder = "asc" | "desc";
export type HomeTypeFilter = "all" | "screenshot" | "session";
export type HomeStatusFilter = "all" | "github" | "zoho";

export interface HomeScreenPrefs {
  viewMode: HomeViewMode;
  sortBy: HomeSortBy;
  sortOrder: HomeSortOrder;
  typeFilter: HomeTypeFilter;
  statusFilter: HomeStatusFilter;
  activeWorkspaceId: string | null;
}

const DEFAULT_HOME_PREFS: HomeScreenPrefs = {
  viewMode: "grid",
  sortBy: "name",
  sortOrder: "asc",
  typeFilter: "all",
  statusFilter: "all",
  activeWorkspaceId: null,
};

const recordingSettingsStore = new Store({
  name: "snapflow-recording-settings",
  defaults: {
    defaultRecordingSource: null,
    defaultCaptureScreenId: null as number | null,
    homeScreenPrefs: DEFAULT_HOME_PREFS,
  },
});

/**
 * RecordingSettingsService persists recording-related settings.
 */
export class RecordingSettingsService {
  /**
   * Get the default recording source (if set)
   */
  getDefaultSource(): RecordingSource | null {
    return recordingSettingsStore.get(
      "defaultRecordingSource"
    ) as RecordingSource | null;
  }

  /**
   * Set the default recording source
   */
  setDefaultSource(source: RecordingSource): void {
    recordingSettingsStore.set("defaultRecordingSource", source);
  }

  /**
   * Clear the default recording source
   */
  clearDefaultSource(): void {
    recordingSettingsStore.set("defaultRecordingSource", null);
  }
}

export const recordingSettingsService = new RecordingSettingsService();

// ---------------------------------------------------------------------------
// Default capture screen preference
// ---------------------------------------------------------------------------

export const captureScreenSettings = {
  getDefaultScreenId(): number | null {
    const id = recordingSettingsStore.get("defaultCaptureScreenId");
    return typeof id === "number" ? id : null;
  },

  setDefaultScreenId(displayId: number): void {
    recordingSettingsStore.set("defaultCaptureScreenId", displayId);
  },

  clearDefaultScreenId(): void {
    recordingSettingsStore.set("defaultCaptureScreenId", null);
  },
};

// ---------------------------------------------------------------------------
// Home screen preferences (view mode, sort, filter, last active workspace)
// ---------------------------------------------------------------------------

export const homeScreenSettings = {
  get(): HomeScreenPrefs {
    const stored = recordingSettingsStore.get(
      "homeScreenPrefs"
    ) as Partial<HomeScreenPrefs> | undefined;
    if (!stored) return { ...DEFAULT_HOME_PREFS };
    return { ...DEFAULT_HOME_PREFS, ...stored };
  },

  update(patch: Partial<HomeScreenPrefs>): HomeScreenPrefs {
    const next = { ...this.get(), ...patch };
    recordingSettingsStore.set("homeScreenPrefs", next);
    return next;
  },
};

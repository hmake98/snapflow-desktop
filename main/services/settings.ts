import Store from "electron-store";

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

interface SettingsStoreSchema {
  defaultCaptureScreenId: number | null;
  homeScreenPrefs: HomeScreenPrefs;
}

const settingsStore = new Store<SettingsStoreSchema>({
  name: "snapflow-recording-settings",
  defaults: {
    defaultCaptureScreenId: null,
    homeScreenPrefs: DEFAULT_HOME_PREFS,
  },
});

// ---------------------------------------------------------------------------
// Default capture screen preference
// ---------------------------------------------------------------------------

export const captureScreenSettings = {
  getDefaultScreenId(): number | null {
    const id = settingsStore.get("defaultCaptureScreenId");
    return typeof id === "number" ? id : null;
  },

  setDefaultScreenId(displayId: number): void {
    settingsStore.set("defaultCaptureScreenId", displayId);
  },

  clearDefaultScreenId(): void {
    settingsStore.set("defaultCaptureScreenId", null);
  },
};

// ---------------------------------------------------------------------------
// Home screen preferences (view mode, sort, filter, last active workspace)
// ---------------------------------------------------------------------------

export const homeScreenSettings = {
  get(): HomeScreenPrefs {
    const stored = settingsStore.get("homeScreenPrefs") as
      Partial<HomeScreenPrefs> | undefined;
    if (!stored) return { ...DEFAULT_HOME_PREFS };
    return { ...DEFAULT_HOME_PREFS, ...stored };
  },

  update(patch: Partial<HomeScreenPrefs>): HomeScreenPrefs {
    const next = { ...this.get(), ...patch };
    settingsStore.set("homeScreenPrefs", next);
    return next;
  },
};

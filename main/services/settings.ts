import Store from "electron-store";
import log from "electron-log";

export interface RecordingSource {
  id: string;
  name: string;
  type: "screen" | "window";
  displayBounds?: { x: number; y: number; width: number; height: number };
}

const recordingSettingsStore = new Store({
  name: "snapflow-recording-settings",
  defaults: {
    defaultRecordingSource: null,
    defaultCaptureScreenId: null as number | null,
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
    const source = recordingSettingsStore.get(
      "defaultRecordingSource"
    ) as RecordingSource | null;

    if (source) {
      log.info(
        `[RecordingSettings] Retrieved default source: ${source.name} (${source.id})`
      );
    } else {
      log.info("[RecordingSettings] No default source configured");
    }

    return source;
  }

  /**
   * Set the default recording source
   */
  setDefaultSource(source: RecordingSource): void {
    recordingSettingsStore.set("defaultRecordingSource", source);
    log.info(
      `[RecordingSettings] Set default source: ${source.name} (${source.id})`
    );
  }

  /**
   * Clear the default recording source
   */
  clearDefaultSource(): void {
    recordingSettingsStore.set("defaultRecordingSource", null);
    log.info("[RecordingSettings] Cleared default recording source");
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
    log.info("[CaptureSettings] Default capture screen set:", displayId);
  },

  clearDefaultScreenId(): void {
    recordingSettingsStore.set("defaultCaptureScreenId", null);
    log.info("[CaptureSettings] Default capture screen cleared");
  },
};

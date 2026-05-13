import { BrowserWindow, desktopCapturer, screen } from "electron";
import log from "electron-log";
import { captureService } from "./capture";

export interface RecordingSource {
  id: string;
  name: string;
  type: "screen" | "window";
  thumbnail: string;
  resolution?: string;
  displayBounds?: { x: number; y: number; width: number; height: number };
}

export interface SourcesWithDefaultPayload {
  sources: RecordingSource[];
  validatedDefault: RecordingSource | null;
  defaultWasInvalid: boolean;
  invalidSourceName: string | null;
}

/**
 * WindowPickerService provides sources for recording via desktopCapturer.
 * Manages the window picker UI window.
 */
export class WindowPickerService {
  private pickerWindow: BrowserWindow | null = null;

  /**
   * Get all available recording sources (screens + windows)
   */
  async getSources(): Promise<RecordingSource[]> {
    try {
      // Check screen recording permission first (macOS requirement)
      const hasPermission =
        await captureService.checkScreenRecordingPermission();
      if (!hasPermission) {
        log.warn(
          "[WindowPicker] Screen recording permission not granted, falling back to displays only"
        );
      }

      const primaryDisplay = screen.getPrimaryDisplay();

      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: {
          width: 250,
          height: 160,
        },
        fetchWindowIcons: false,
      });

      if (sources.length > 0) {
      }

      // Get Snapflow window IDs to filter them out
      const snapflowWindowIds = BrowserWindow.getAllWindows().map(
        (win) => `window:${win.id}:0`
      );

      const primaryBounds = primaryDisplay.bounds;

      // Start with "Full Screen" quick option as the ONLY screen option
      const recordingSources: RecordingSource[] = [
        {
          id: `full-screen`,
          name: "🖥️ Full Screen",
          type: "screen",
          thumbnail:
            sources
              .find((s) => s.id.startsWith("screen:"))
              ?.thumbnail.toDataURL() || "",
          resolution: `${primaryBounds.width} × ${primaryBounds.height}`,
          displayBounds: primaryBounds,
        },
      ];

      // Add window sources (filter out Snapflow windows and inactive windows)
      const windowSources = sources.filter((s) => {
        const isWindow = !s.id.startsWith("screen");
        if (!isWindow) return false;

        if (s.name === "") {
          return false;
        }
        if (snapflowWindowIds.includes(s.id)) {
          return false;
        }
        if (s.name.toLowerCase().includes("snapflow")) {
          return false;
        }

        // Check if window is in a visible area (has reasonable bounds)
        // Skip windows with zero or very small dimensions (likely hidden/minimized)
        const size = s.thumbnail.getSize();
        if (size.width < 50 || size.height < 50) {
          return false;
        }

        return true;
      });

      for (const source of windowSources) {
        const size = source.thumbnail.getSize();
        recordingSources.push({
          id: source.id,
          name: source.name,
          type: "window",
          thumbnail: source.thumbnail.toDataURL(),
          resolution:
            size.width > 0 && size.height > 0
              ? `${size.width} × ${size.height}`
              : undefined,
        });
      }

      // Fallback: if no sources found from desktopCapturer, at least add displays
      if (recordingSources.length === 0) {
        log.warn(
          "[WindowPicker] No sources found from desktopCapturer, adding displays as fallback"
        );

        const displays = screen.getAllDisplays();
        for (const display of displays) {
          recordingSources.push({
            id: `screen:${display.id}`,
            name:
              display.id === primaryDisplay.id
                ? "Primary Display"
                : `Display ${display.id}`,
            type: "screen",
            thumbnail: "", // Empty thumbnail for fallback
            resolution: `${display.bounds.width} × ${display.bounds.height}`,
            displayBounds: display.bounds,
          });
        }
      }

      return recordingSources;
    } catch (error) {
      log.error("[WindowPicker] Failed to get sources:", error);
      throw error;
    }
  }

  /**
   * Validate whether a saved default source is still active.
   * Uses name-based fallback for windows since IDs change on app restart.
   */
  async validateDefaultSource(saved: {
    id: string;
    name: string;
    type: string;
  }): Promise<{ valid: true; source: RecordingSource } | { valid: false }> {
    try {
      const sources = await this.getSources();

      // Full-screen special case: both "full-screen" and "screen:*" IDs map to our
      // synthetic Full Screen entry. This handles legacy saves that used "screen:1:0".
      if (saved.id === "full-screen" || saved.id.startsWith("screen:")) {
        const fs = sources.find((s) => s.id === "full-screen");
        if (fs) return { valid: true, source: fs };
        return { valid: false };
      }

      // Exact ID match
      const exact = sources.find((s) => s.id === saved.id);
      if (exact) return { valid: true, source: exact };

      // Name-based fallback for windows (IDs change on app restart)
      if (saved.type === "window") {
        const byName = sources.find(
          (s) => s.type === "window" && s.name === saved.name
        );
        if (byName) {
          return { valid: true, source: byName };
        }
      }

      return { valid: false };
    } catch (error) {
      log.error("[WindowPicker] Error validating default source:", error);
      return { valid: false };
    }
  }

  /**
   * Get all sources plus validate and resolve the saved default in a single call.
   * Avoids double-fetching by reusing the already-fetched sources list.
   */
  async getSourcesWithDefault(
    savedDefault: { id: string; name: string; type: string } | null
  ): Promise<SourcesWithDefaultPayload> {
    const sources = await this.getSources();

    if (!savedDefault) {
      return {
        sources,
        validatedDefault: null,
        defaultWasInvalid: false,
        invalidSourceName: null,
      };
    }

    let validatedDefault: RecordingSource | null;

    // Full-screen special case: both "full-screen" synthetic ID and any "screen:*" ID
    // map to the single "Full Screen" entry in our sources list.
    // This handles both new saves (id="full-screen") and old saves (id="screen:1:0")
    if (
      savedDefault.id === "full-screen" ||
      savedDefault.id.startsWith("screen:")
    ) {
      validatedDefault = sources.find((s) => s.id === "full-screen") ?? null;
    } else {
      // Exact ID match first
      validatedDefault = sources.find((s) => s.id === savedDefault.id) ?? null;

      // Name-based fallback for windows
      if (!validatedDefault && savedDefault.type === "window") {
        validatedDefault =
          sources.find(
            (s) => s.type === "window" && s.name === savedDefault.name
          ) ?? null;
        if (validatedDefault) {
        }
      }
    }

    const defaultWasInvalid = !validatedDefault;
    if (defaultWasInvalid) {
      log.warn(
        `[WindowPicker] Saved default source is no longer active: "${savedDefault.name}" (${savedDefault.id})`
      );
    }

    return {
      sources,
      validatedDefault,
      defaultWasInvalid,
      invalidSourceName: defaultWasInvalid ? savedDefault.name : null,
    };
  }

  /**
   * Send picker sources to main window via IPC.
   * Accepts a pre-fetched payload to avoid redundant getSources() calls.
   */
  async showPickerInMainWindow(
    mainWindow: BrowserWindow | null,
    payload: SourcesWithDefaultPayload
  ): Promise<void> {
    if (!mainWindow || mainWindow.isDestroyed()) {
      log.error("[WindowPicker] Main window not available");
      throw new Error("Main window not available");
    }

    mainWindow.webContents.send("recording:show-picker", payload);
  }

  /**
   * Legacy method kept for compatibility - now a no-op
   */
  async openPicker(_port?: string): Promise<void> {
    // Window picker now shows as modal in main window, not separate window
  }

  /**
   * Close the window picker
   */
  closePicker(): void {
    if (this.pickerWindow) {
      this.pickerWindow.close();
      this.pickerWindow = null;
    }
  }

  /**
   * Check if picker is open
   */
  isOpen(): boolean {
    return this.pickerWindow !== null && !this.pickerWindow.isDestroyed();
  }
}

export const windowPickerService = new WindowPickerService();

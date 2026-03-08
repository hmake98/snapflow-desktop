import { BrowserWindow, desktopCapturer, screen } from "electron";
import log from "electron-log";
import { captureService } from "./capture";

export interface RecordingSource {
  id: string;
  name: string;
  type: "screen" | "window";
  thumbnail: string;
  displayBounds?: { x: number; y: number; width: number; height: number };
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
      log.info("[WindowPicker] Fetching available sources...");

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

      log.info(`[WindowPicker] Retrieved ${sources.length} sources`);
      if (sources.length > 0) {
        log.info(
          "[WindowPicker] Source IDs:",
          sources.map((s) => `${s.id}(${s.name})`).join(", ")
        );
      }

      // Get Snapflow window IDs to filter them out
      const snapflowWindowIds = BrowserWindow.getAllWindows().map(
        (win) => `window:${win.id}:0`
      );

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
          displayBounds: primaryDisplay.bounds,
        },
      ];

      log.info("[WindowPicker] Added Full Screen option");

      // Add window sources (filter out Snapflow windows and inactive windows)
      const windowSources = sources.filter((s) => {
        const isWindow = !s.id.startsWith("screen");
        if (!isWindow) return false;

        if (s.name === "") {
          log.info(`[WindowPicker] Skipping window with empty name`);
          return false;
        }
        if (snapflowWindowIds.includes(s.id)) {
          log.info(`[WindowPicker] Skipping Snapflow window: ${s.id}`);
          return false;
        }
        if (s.name.toLowerCase().includes("snapflow")) {
          log.info(`[WindowPicker] Skipping Snapflow-named window: ${s.name}`);
          return false;
        }

        // Check if window is in a visible area (has reasonable bounds)
        // Skip windows with zero or very small dimensions (likely hidden/minimized)
        const size = s.thumbnail.getSize();
        if (size.width < 50 || size.height < 50) {
          log.info(
            `[WindowPicker] Skipping window with invalid thumbnail: ${s.name}`
          );
          return false;
        }

        return true;
      });

      for (const source of windowSources) {
        recordingSources.push({
          id: source.id,
          name: source.name,
          type: "window",
          thumbnail: source.thumbnail.toDataURL(),
        });
      }

      log.info(
        `[WindowPicker] Returning ${recordingSources.length} sources (1 screen + ${windowSources.length} windows)`
      );

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
            displayBounds: display.bounds,
          });
        }

        log.info(
          `[WindowPicker] Added ${recordingSources.length} displays as fallback`
        );
      }

      return recordingSources;
    } catch (error) {
      log.error("[WindowPicker] Failed to get sources:", error);
      throw error;
    }
  }

  /**
   * Get sources for the window picker
   * No longer opens a separate window - sources are sent to main window via IPC
   */
  async showPickerInMainWindow(
    mainWindow: BrowserWindow | null
  ): Promise<void> {
    if (!mainWindow || mainWindow.isDestroyed()) {
      log.error("[WindowPicker] Main window not available");
      throw new Error("Main window not available");
    }

    try {
      log.info("[WindowPicker] Getting sources for main window picker");
      const sources = await this.getSources();

      // Send sources to main window to show picker modal
      mainWindow.webContents.send("recording:show-picker", sources);
      log.info("[WindowPicker] Sent picker request to main window");
    } catch (error) {
      log.error("[WindowPicker] Failed to show picker in main window:", error);
      throw error;
    }
  }

  /**
   * Legacy method kept for compatibility - now a no-op
   */
  async openPicker(_port?: string): Promise<void> {
    log.info(
      "[WindowPicker] openPicker called (legacy, now showing in main window)"
    );
    // Window picker now shows as modal in main window, not separate window
  }

  /**
   * Close the window picker
   */
  closePicker(): void {
    if (this.pickerWindow) {
      log.info("[WindowPicker] Closing picker window");
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

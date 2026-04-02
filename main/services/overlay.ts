import { BrowserWindow, app } from "electron";
import path from "path";
import log from "electron-log";

const isProd = process.env.NODE_ENV === "production";

/**
 * OverlayService creates and manages a red border overlay window
 * that shows while screen recording is active.
 */
export class OverlayService {
  private overlayWindow: BrowserWindow | null = null;

  /**
   * Show the overlay at the specified bounds
   */
  async show(
    bounds: { x: number; y: number; width: number; height: number },
    port?: string
  ): Promise<void> {
    if (this.overlayWindow) {
      log.warn("[Overlay] Overlay already visible, ignoring show request");
      return;
    }

    try {
      log.info("[Overlay] Creating overlay window at bounds:", bounds);

      this.overlayWindow = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        movable: false,
        hasShadow: false,
        focusable: false,
        skipTaskbar: true,
        enableLargerThanScreen: true,
        backgroundColor: "#00000000",
        show: false, // Don't show until content loads
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, "preload.js"),
        },
      });

      this.overlayWindow.setIgnoreMouseEvents(true);
      this.overlayWindow.setAlwaysOnTop(true, "screen-saver", 2);
      this.overlayWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
      // setVisibleOnAllWorkspaces can hide the dock icon on macOS — restore immediately.
      if (process.platform === "darwin") app.dock?.show();
      // Prevent the overlay border from appearing in screen recordings.
      // setContentProtection(true) makes this window invisible to capture APIs
      // (desktopCapturer, screenshots) while remaining visible on screen.
      this.overlayWindow.setContentProtection(true);

      // Load the overlay page
      if (isProd) {
        await this.overlayWindow.loadURL("app://./recording-overlay");
      } else {
        await this.overlayWindow.loadURL(
          `http://localhost:${port}/recording-overlay`
        );
      }

      // Show the overlay window after content loads
      this.overlayWindow.show();

      // Clean up reference when window closes and restore dock icon
      this.overlayWindow.on("closed", () => {
        this.overlayWindow = null;
        if (process.platform === "darwin") app.dock?.show();
      });

      log.info("[Overlay] Overlay window created successfully");
    } catch (error) {
      log.error("[Overlay] Failed to create overlay window:", error);
      this.overlayWindow = null;
      throw error;
    }
  }

  /**
   * Hide and destroy the overlay window
   */
  hide(): void {
    if (this.overlayWindow) {
      log.info("[Overlay] Hiding overlay window");
      this.overlayWindow.close();
      this.overlayWindow = null;
    }
  }

  /**
   * Check if overlay is currently visible
   */
  isVisible(): boolean {
    return this.overlayWindow !== null && !this.overlayWindow.isDestroyed();
  }
}

export const overlayService = new OverlayService();

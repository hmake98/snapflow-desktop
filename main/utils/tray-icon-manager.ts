import { Tray, nativeImage, app } from "electron";
import log from "electron-log";
import path from "path";

export type TrayState = "normal" | "ready-record" | "recording";

export class TrayIconManager {
  private tray: Tray | null = null;
  private currentState: TrayState = "normal";
  private isProd: boolean;

  constructor(tray: Tray, isProd: boolean) {
    this.tray = tray;
    this.isProd = isProd;
  }

  /**
   * Set the tray icon state
   * Note: Only updates icon if it exists. Recording state is shown in menu instead.
   */
  setState(state: TrayState): void {
    if (this.currentState === state) {
      log.info(`[TrayIcon] State already ${state}, skipping update`);
      return;
    }

    log.info(`[TrayIcon] Changing state from ${this.currentState} to ${state}`);
    this.currentState = state;

    // Only update icon for "normal" state to avoid missing icon files
    // Recording state is shown in the tray menu text instead
    if (state === "normal") {
      const iconPath = this.getIconPath(state);
      const image = nativeImage.createFromPath(iconPath);

      if (image.isEmpty()) {
        log.warn(`[TrayIcon] Failed to load icon from ${iconPath}`);
        return;
      }

      // Resize for tray
      const resized = image.resize({ width: 16, height: 16 });
      resized.setTemplateImage(true);

      if (this.tray) {
        this.tray.setImage(resized);
        log.info(`[TrayIcon] Icon updated to normal state`);
      }
    }
  }

  /**
   * Get current tray state
   */
  getState(): TrayState {
    return this.currentState;
  }

  /**
   * Reset tray icon to normal state
   */
  reset(): void {
    this.setState("normal");
  }

  /**
   * Get the icon path based on state and platform
   */
  private getIconPath(state: TrayState): string {
    const basePath = this.isProd
      ? process.resourcesPath
      : path.join(app.getAppPath(), "resources");

    let iconName: string;

    switch (state) {
      case "ready-record":
        iconName =
          process.platform === "win32"
            ? "tray-icon-record-white.png"
            : "tray-icon-record.png";
        break;

      case "recording":
        iconName =
          process.platform === "win32"
            ? "tray-icon-stop-white.png"
            : "tray-icon-stop.png";
        break;

      default:
        // Normal state
        iconName =
          process.platform === "win32"
            ? "tray-icon-white.png"
            : "tray-icon.png";
    }

    const fullPath = path.join(basePath, iconName);
    log.info(`[TrayIcon] Icon path for ${state}:`, fullPath);
    return fullPath;
  }
}

import { autoUpdater } from "electron-updater";
import { BrowserWindow, dialog } from "electron";
import log from "electron-log";
import fs from "fs";
import path from "path";

interface WindowWithQuitting extends BrowserWindow {
  setQuitting?: (value: boolean) => void;
}

interface PublishConfig {
  provider: string;
  owner: string;
  repo: string;
}

export class UpdaterService {
  private mainWindow: WindowWithQuitting | null = null;
  private updateDownloaded = false;
  private isInitialized = false;
  private updateInfo: { version: string; releaseDate?: string } | null = null;

  constructor() {
    // Don't initialize in constructor - wait for explicit init() call
  }

  /**
   * Read publish configuration from electron-builder.yml
   */
  private getPublishConfig(): PublishConfig | null {
    try {
      const configPath = path.join(__dirname, "..", "electron-builder.yml");

      // If config doesn't exist in prod, use fallback values
      if (!fs.existsSync(configPath)) {
        log.warn(
          "[Updater] electron-builder.yml not found, using default config"
        );
        return {
          provider: "github",
          owner: "harsh-simform",
          repo: "snapflow-desktop",
        };
      }

      const yaml = fs.readFileSync(configPath, "utf8");

      // Parse YAML manually (simple parser for our use case)
      const ownerMatch = yaml.match(/owner:\s*(.+)/);
      const repoMatch = yaml.match(/repo:\s*(.+)/);

      if (ownerMatch && repoMatch) {
        return {
          provider: "github",
          owner: ownerMatch[1].trim(),
          repo: repoMatch[1].trim(),
        };
      }

      // Fallback to default
      return {
        provider: "github",
        owner: "harsh-simform",
        repo: "snapflow-desktop",
      };
    } catch (error) {
      log.error("[Updater] Failed to read publish config:", error);
      // Return default config
      return {
        provider: "github",
        owner: "harsh-simform",
        repo: "snapflow-desktop",
      };
    }
  }

  init() {
    if (this.isInitialized) return;

    // Configure logging
    autoUpdater.logger = log;
    (autoUpdater.logger as typeof log).transports.file.level = "info";
    log.info("[Updater] Initializing auto-updater service");

    // Get publish config from electron-builder.yml
    const publishConfig = this.getPublishConfig();

    if (publishConfig) {
      log.info(
        `[Updater] Setting feed URL: ${publishConfig.owner}/${publishConfig.repo}`
      );

      // Configure update feed URL for GitHub releases
      autoUpdater.setFeedURL({
        provider: "github" as const,
        owner: publishConfig.owner,
        repo: publishConfig.repo,
        private: false,
      });
    }

    // Don't check for pre-releases unless explicitly enabled
    autoUpdater.allowPrerelease = false;

    // Disable automatic downloading to give user control
    autoUpdater.autoDownload = false;

    // IMPORTANT: For unsigned/adhoc-signed builds
    // If SKIP_CODE_SIGNATURE_VERIFICATION is set, disable verification so updates can be installed
    // This allows unsigned production builds to receive updates, but updates are not cryptographically verified.
    // Should be removed once proper code signing is implemented.
    if (process.env.SKIP_CODE_SIGNATURE_VERIFICATION === "true") {
      log.warn(
        "[Updater] ⚠️  Code signature verification is disabled - updates will be allowed without verification"
      );

      // @ts-expect-error - Accessing internal electron-updater property
      autoUpdater.verifyUpdateCodeSignature = async (_): Promise<void> => {
        log.warn(
          "[Updater] Skipping code signature verification (SKIP_CODE_SIGNATURE_VERIFICATION=true)"
        );
        return Promise.resolve();
      };
    }

    this.setupAutoUpdater();
    this.isInitialized = true;

    log.info("[Updater] Auto-updater service initialized successfully");
  }

  setMainWindow(window: WindowWithQuitting) {
    this.mainWindow = window;
  }

  private setupAutoUpdater() {
    // Configure auto-updater
    autoUpdater.autoInstallOnAppQuit = true;

    // Check for updates on startup (only in production)
    autoUpdater.on("checking-for-update", () => {
      log.info("[Updater] Checking for updates...");
      this.sendStatusToWindow("checking-for-update");
    });

    autoUpdater.on("update-available", (info) => {
      log.info("[Updater] Update available:", info);

      // Store update info
      this.updateInfo = {
        version: info.version,
        releaseDate: info.releaseDate,
      };

      this.sendStatusToWindow("update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
        currentVersion: autoUpdater.currentVersion.version,
      });

      // Automatically download the update
      log.info("[Updater] Starting automatic download...");
      autoUpdater.downloadUpdate().catch((error) => {
        log.error("[Updater] Download failed:", error);
        this.sendStatusToWindow("update-error", {
          message: `Download failed: ${error.message}`,
        });
      });
    });

    autoUpdater.on("update-not-available", (info) => {
      log.info("[Updater] Update not available:", info);
      this.sendStatusToWindow("update-not-available", {
        currentVersion: autoUpdater.currentVersion.version,
      });
    });

    autoUpdater.on("error", (err) => {
      log.error("[Updater] Error in auto-updater:", err);

      let errorMessage = err.message;
      let isSignatureError = false;
      let downloadUrl: string | undefined;
      let canRetry = false;

      // Provide user-friendly error messages
      if (
        err.message.includes("ENOTFOUND") ||
        err.message.includes("ETIMEDOUT")
      ) {
        errorMessage =
          "Cannot connect to update server. Please check your internet connection.";
        canRetry = true;
      } else if (err.message.includes("404")) {
        errorMessage = "No updates found. This may be a development build.";
      } else if (err.message.includes("EACCES")) {
        errorMessage =
          "Permission denied. Please ensure the app has write permissions.";
      } else if (
        err.message.includes("code signature") ||
        err.message.includes("not signed") ||
        err.message.includes("signature validation") ||
        err.message.includes("code object is not signed") ||
        err.message.includes("Code signature") ||
        err.message.includes("code failed to satisfy")
      ) {
        isSignatureError = true;
        errorMessage =
          "This is a development build without code signing. The update has been downloaded but cannot be verified. You can try installing it anyway or download the signed release from GitHub.";
        downloadUrl =
          "https://github.com/harsh-simform/snapflow-desktop/releases/latest";
      }

      this.sendStatusToWindow("update-error", {
        message: errorMessage,
        isSignatureError,
        downloadUrl,
        canRetry,
      });
    });

    autoUpdater.on("download-progress", (progressObj) => {
      const percent = Math.round(progressObj.percent);
      const speed = this.formatBytes(progressObj.bytesPerSecond);
      const downloaded = this.formatBytes(progressObj.transferred);
      const total = this.formatBytes(progressObj.total);

      log.info(
        `[Updater] Download progress: ${percent}% (${downloaded}/${total}) @ ${speed}/s`
      );

      this.sendStatusToWindow("download-progress", {
        percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
        speed,
        downloaded,
        totalSize: total,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      log.info("[Updater] Update downloaded successfully:", info);
      this.updateDownloaded = true;

      this.sendStatusToWindow("update-downloaded", {
        version: info.version,
        releaseDate: info.releaseDate,
      });

      // Show dialog to user
      this.promptUserToUpdate(info);
    });
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
  }

  private sendStatusToWindow(event: string, data?: unknown) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send("update-status", { event, data });
    }
  }

  private async promptUserToUpdate(info: {
    version: string;
    releaseDate?: string;
  }) {
    if (!this.mainWindow) return;

    const currentVersion = autoUpdater.currentVersion.version;
    const releaseInfo = info.releaseDate
      ? `\n\nRelease Date: ${new Date(info.releaseDate).toLocaleDateString()}`
      : "";

    const { response } = await dialog.showMessageBox(this.mainWindow, {
      type: "info",
      title: "Update Downloaded",
      message: `SnapFlow ${info.version} is ready to install`,
      detail: `Current version: ${currentVersion}\nNew version: ${info.version}${releaseInfo}\n\nThe application will restart to complete the installation. Your data will be preserved.`,
      buttons: ["Install and Restart", "Install Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (response === 0) {
      // User chose to install now
      log.info("[Updater] User chose to install update now");

      // Disable window close prevention before quitting
      if (this.mainWindow?.setQuitting) {
        log.info("[Updater] Disabling close prevention");
        this.mainWindow.setQuitting(true);
      }

      // Use setTimeout to ensure the dialog is closed before quitting
      setTimeout(() => {
        log.info("[Updater] Calling quitAndInstall");
        // First parameter: isSilent (false = show installer)
        // Second parameter: isForceRunAfter (true = restart after install)
        autoUpdater.quitAndInstall(false, true);
      }, 100);
    } else {
      log.info(
        "[Updater] User chose to install later - will install on next quit"
      );
    }
  }

  async checkForUpdates() {
    if (process.env.NODE_ENV === "development") {
      log.info("[Updater] Skipping update check in development mode");
      return null;
    }

    if (!this.isInitialized) {
      log.error("[Updater] Service not initialized, cannot check for updates");
      throw new Error(
        "Updater service not initialized. Please restart the application."
      );
    }

    try {
      log.info("[Updater] Starting update check...");
      const result = await autoUpdater.checkForUpdates();
      log.info(
        "[Updater] Update check completed:",
        result?.updateInfo?.version || "No update available"
      );
      return result;
    } catch (error) {
      log.error("[Updater] Failed to check for updates:", error);

      // Provide more specific error information
      if (error instanceof Error) {
        // Network errors
        if (
          error.message.includes("ENOTFOUND") ||
          error.message.includes("ETIMEDOUT") ||
          error.message.includes("EAI_AGAIN")
        ) {
          throw new Error(
            "ENOTFOUND - Unable to connect to update server. Please check your internet connection.",
            { cause: error }
          );
        }

        // Permission errors
        if (
          error.message.includes("EACCES") ||
          error.message.includes("EPERM")
        ) {
          throw new Error(
            "EACCES - Permission denied. Please ensure the application has necessary permissions.",
            { cause: error }
          );
        }

        // 404 errors (no releases found)
        if (error.message.includes("404")) {
          throw new Error(
            "404 - No releases found. This may be a development or pre-release build.",
            { cause: error }
          );
        }

        // Code signature errors
        if (
          error.message.includes("code signature") ||
          error.message.includes("not signed")
        ) {
          throw new Error(
            "code signature - Unable to verify update signature. Please download updates manually.",
            { cause: error }
          );
        }

        // Re-throw the original error with more context
        throw new Error(`Update check failed: ${error.message}`, {
          cause: error,
        });
      }

      throw new Error(
        "An unexpected error occurred while checking for updates",
        { cause: error }
      );
    }
  }

  async downloadUpdate() {
    if (!this.isInitialized) {
      log.error("[Updater] Service not initialized, cannot download update");
      throw new Error(
        "Updater service not initialized. Please restart the application."
      );
    }

    if (!this.updateInfo) {
      log.error("[Updater] No update info available");
      throw new Error("No update available to download");
    }

    try {
      log.info("[Updater] Starting update download...");
      await autoUpdater.downloadUpdate();
      log.info("[Updater] Download initiated successfully");
    } catch (error) {
      log.error("[Updater] Failed to download update:", error);

      if (error instanceof Error) {
        // Network errors during download
        if (
          error.message.includes("ENOTFOUND") ||
          error.message.includes("ETIMEDOUT")
        ) {
          throw new Error(
            "Download failed: Unable to connect to update server. Please check your internet connection.",
            { cause: error }
          );
        }

        // Disk space errors
        if (error.message.includes("ENOSPC")) {
          throw new Error(
            "Download failed: Insufficient disk space. Please free up some space and try again.",
            { cause: error }
          );
        }

        // Permission errors
        if (
          error.message.includes("EACCES") ||
          error.message.includes("EPERM")
        ) {
          throw new Error(
            "Download failed: Permission denied. Please ensure the application has write permissions.",
            { cause: error }
          );
        }

        throw new Error(`Download failed: ${error.message}`, {
          cause: error,
        });
      }

      throw new Error(
        "An unexpected error occurred while downloading the update",
        { cause: error }
      );
    }
  }

  quitAndInstall() {
    if (!this.isInitialized) {
      log.error("[Updater] Service not initialized, cannot install update");
      throw new Error(
        "Updater service not initialized. Please restart the application."
      );
    }

    if (!this.updateDownloaded) {
      log.error("[Updater] No update downloaded, cannot install");
      throw new Error(
        "No update has been downloaded yet. Please download the update first."
      );
    }

    try {
      log.info("[Updater] quitAndInstall called");

      // Disable window close prevention before quitting
      if (this.mainWindow?.setQuitting) {
        log.info("[Updater] Disabling close prevention");
        this.mainWindow.setQuitting(true);
      }

      // Verify that the update is still available
      if (!this.updateDownloaded) {
        throw new Error("Update is no longer available for installation");
      }

      // Use setTimeout to ensure current operations complete before quitting
      setTimeout(() => {
        log.info("[Updater] Calling quitAndInstall");
        try {
          // First parameter: isSilent (false = show installer)
          // Second parameter: isForceRunAfter (true = restart after install)
          autoUpdater.quitAndInstall(false, true);
        } catch (installError) {
          log.error("[Updater] Failed to quit and install:", installError);
          throw installError;
        }
      }, 100);
    } catch (error) {
      log.error("[Updater] quitAndInstall failed:", error);
      throw error;
    }
  }

  getUpdateInfo() {
    return {
      currentVersion: autoUpdater.currentVersion.version,
      updateDownloaded: this.updateDownloaded,
      updateInfo: this.updateInfo,
    };
  }
}

export const updaterService = new UpdaterService();

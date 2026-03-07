import dotenv from "dotenv";
import path from "path";
import electron from "electron";
import serve from "electron-serve";
import log from "electron-log";
import http from "http";
import { URL } from "url";
import Store from "electron-store";
import { createWindow, WindowInstance } from "./helpers";
import { authService } from "./services/auth";
import { issueService } from "./services/issues";
import { captureService } from "./services/capture";
import { connectorService } from "./services/connectors";
import { updaterService } from "./services/updater";
import { syncService } from "./services/sync";
import { tenantService } from "./services/tenant";
import { workspaceService } from "./services/workspace";
import { onboardingService } from "./services/onboarding";
import { zohoService } from "./services/zoho";
import { githubService } from "./services/github";
import { storageManager } from "./utils/storage";
import { sessionManager } from "./utils/session";
import { TrayIconManager } from "./utils/tray-icon-manager";
import { getSupabase } from "./utils/supabase";
import { secureConfig } from "./utils/secure-config";
import fs from "fs";
import type { Workspace } from "../renderer/types";

const {
  app,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  BrowserWindow,
  protocol,
  dialog,
  shell,
  screen,
  globalShortcut,
} = electron;

// Catch any genuinely unhandled promise rejections so they don't crash the app.
process.on("unhandledRejection", (reason: unknown) => {
  log.error("[Process] Unhandled promise rejection:", reason);
});

// Determine if we're in production
const isProd = process.env.NODE_ENV === "production";

// Load environment variables
// Development: load from .env in project root
// Production (CI): secrets are loaded by secureConfig.initialize() after app.whenReady()
// Production (local build): also try to load from .env as fallback
if (!isProd) {
  dotenv.config();
} else {
  // Local production builds might still have .env available (for testing)
  // Try to load it as a fallback before secureConfig initialization
  const devEnvPath = path.join(__dirname, "../.env");
  if (fs.existsSync(devEnvPath)) {
    log.info("[Startup] Loading .env for local production build");
    dotenv.config({ path: devEnvPath });
  }
}

// Register custom protocol scheme before app is ready (if available)
if (protocol && protocol.registerSchemesAsPrivileged) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "snapflow",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        bypassCSP: false,
      },
    },
  ]);
}

// Global state
let mainWindow: WindowInstance | null = null;
let windowCaptureOverlay: typeof BrowserWindow.prototype | null = null;
let recordingControlWindow: typeof BrowserWindow.prototype | null = null;
let recordingAreaSelector: typeof BrowserWindow.prototype | null = null;
let tray: typeof Tray.prototype | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let isQuitting = false;
let pendingScreenshot: { dataUrl: string; mode: string } | null = null;
let pendingZohoTokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountsServer?: string;
  apiDomain?: string;
} | null = null;
let pendingGitHubTokens: {
  accessToken: string;
  expiresAt: number;
} | null = null;

// App settings store
const appSettingsStore = new Store({
  name: "snapflow-app-settings",
  defaults: { autoSync: false },
}) as any;

// State tracking for tray actions to prevent race conditions
let isShowingWindow = false;

// Tray icon manager and recording state
let trayIconManager: TrayIconManager | null = null;
let recordingState: "idle" | "selecting" | "recording" = "idle";
let recordingBounds: {
  x: number;
  y: number;
  width: number;
  height: number;
} | null = null;
let pendingRecording: {
  dataUrl: string;
  duration: number;
  thumbnailPath?: string;
  issueId?: string;
} | null = null;

if (isProd) {
  serve({ directory: "app" });
} else {
  if (app && app.setPath) {
    app.setPath("userData", `${app.getPath("userData")} (development)`);
  }

  // In development, quit app when terminal process is killed
  process.on("SIGTERM", () => {
    log.info("SIGTERM received, quitting app...");
    isQuitting = true;
    if (mainWindow && mainWindow.setQuitting) {
      mainWindow.setQuitting(true);
    }
    if (app) app.quit();
  });

  process.on("SIGINT", () => {
    log.info("SIGINT received, quitting app...");
    isQuitting = true;
    if (mainWindow && mainWindow.setQuitting) {
      mainWindow.setQuitting(true);
    }
    if (app) app.quit();
  });

  // Also handle parent process exit (when npm run dev is killed)
  process.on("disconnect", () => {
    log.info("Parent process disconnected, quitting app...");
    isQuitting = true;
    if (mainWindow && mainWindow.setQuitting) {
      mainWindow.setQuitting(true);
    }
    if (app) app.quit();
  });
}

async function createMainWindow() {
  // Set app icon
  const iconPath = isProd
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "../resources/icon.png");

  mainWindow = createWindow(
    "main",
    {
      width: 1200,
      height: 800,
      icon: iconPath,
      frame: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
      },
    },
    true // Enable preventClose for tray-based application
  );

  // Set Content Security Policy to fix Electron security warning
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            isProd
              ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'"
              : "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: http://localhost:*",
          ],
        },
      });
    }
  );

  const port = process.argv[2];

  // Navigate to a route, falling back to /500 on load failure
  const navigateTo = async (route: string) => {
    if (isProd) {
      await mainWindow!.loadURL(`app://.${route}`);
    } else {
      await mainWindow!.loadURL(`http://localhost:${port}${route}`);
      mainWindow!.webContents.openDevTools();
    }
  };

  // Show 500 error page if the renderer fails to load
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      if (errorCode === -3) return; // ERR_ABORTED — user navigated away, not a real failure
      log.error(
        `[Window] Page failed to load (${errorCode}: ${errorDescription})`
      );
      navigateTo("/500").catch((err) =>
        log.error("[Window] Failed to load error page:", err)
      );
    }
  );

  // Route based on stored session (no network call) — renderer re-checks auth on load
  const initialRoute = sessionManager.hasStoredSession() ? "/home" : "/auth";
  try {
    await navigateTo(initialRoute);
  } catch (err) {
    log.error("[Window] Initial load failed:", err);
    await navigateTo("/500").catch((e) =>
      log.error("[Window] Failed to load error page:", e)
    );
  }

  // Handle window focus event
  mainWindow.on("focus", async () => {
    log.info("[Window] Window focused");
  });

  return mainWindow;
}

function createSystemTray() {
  // Get tray icon path - different for dev vs production and OS
  let trayIconPath: string;

  if (isProd) {
    // Use white icon for Windows, regular icon for other platforms
    if (process.platform === "win32") {
      trayIconPath = path.join(process.resourcesPath, "tray-icon-white.png");
    } else {
      trayIconPath = path.join(process.resourcesPath, "tray-icon.png");
    }
  } else {
    // Development mode
    if (process.platform === "win32") {
      trayIconPath = path.join(__dirname, "../resources/tray-icon-white.png");
    } else {
      trayIconPath = path.join(__dirname, "../resources/tray-icon.png");
    }
  }

  const image = nativeImage.createFromPath(trayIconPath);

  // Resize for tray
  const trayIcon = image.resize({ width: 16, height: 16 });
  trayIcon.setTemplateImage(true); // Makes it adapt to light/dark themes on macOS

  tray = new Tray(trayIcon);

  // Initialize tray icon manager
  trayIconManager = new TrayIconManager(tray, isProd);
  log.info("[Tray] TrayIconManager initialized");

  updateTrayMenu();

  tray.setToolTip("SnapFlow");
}

function registerGlobalShortcuts() {
  // Register Ctrl+Shift+5 (Windows/Linux) for Capture Area
  const captureAreaShortcut = "Control+Shift+5";

  const areaRegistered = globalShortcut.register(
    captureAreaShortcut,
    async () => {
      log.info(`[Shortcuts] ${captureAreaShortcut} pressed - Capture Area`);
      await handleScreenshotCapture("region");
    }
  );

  if (areaRegistered) {
    log.info(
      `[Shortcuts] Successfully registered ${captureAreaShortcut} for Capture Area`
    );
  } else {
    log.error(`[Shortcuts] Failed to register ${captureAreaShortcut}`);
  }

  // Register Ctrl+Shift+3 (Windows/Linux) for Capture Full Screen
  const captureFullScreenShortcut = "Control+Shift+3";

  const fullScreenRegistered = globalShortcut.register(
    captureFullScreenShortcut,
    async () => {
      log.info(
        `[Shortcuts] ${captureFullScreenShortcut} pressed - Capture Full Screen`
      );
      await handleScreenshotCapture("fullscreen");
    }
  );

  if (fullScreenRegistered) {
    log.info(
      `[Shortcuts] Successfully registered ${captureFullScreenShortcut} for Capture Full Screen`
    );
  } else {
    log.error(`[Shortcuts] Failed to register ${captureFullScreenShortcut}`);
  }

  // Log registered shortcuts
  log.info(
    "[Shortcuts] All registered shortcuts:",
    globalShortcut.isRegistered(captureAreaShortcut),
    globalShortcut.isRegistered(captureFullScreenShortcut)
  );
}

function updateTrayMenu() {
  if (!tray) return;

  // Get available displays
  const displays = captureService.getAvailableDisplays();
  const hasMultipleDisplays = displays.length > 1;

  // Build capture menu items
  const captureMenuItems: electron.MenuItemConstructorOptions[] = [
    {
      label: "Capture Full Screen",
      accelerator: "Control+Shift+3",
      click: () => {
        handleScreenshotCapture("fullscreen");
      },
    },
    {
      label: "Capture Area",
      accelerator: "Control+Shift+5",
      click: () => {
        handleScreenshotCapture("region");
      },
    },
  ];

  // Add multi-screen options if multiple displays are available
  if (hasMultipleDisplays) {
    captureMenuItems.push({ type: "separator" });
    captureMenuItems.push({
      label: "Capture All Screens",
      click: () => {
        handleScreenshotCapture("all-screens");
      },
    });

    // Add individual screen capture options
    const screenSubmenu = displays.map((display) => ({
      label: display.label,
      click: () => {
        handleScreenshotCapture("specific-screen", display.id.toString());
      },
    }));

    captureMenuItems.push({
      label: "Capture Specific Screen",
      submenu: screenSubmenu,
    });
  }

  // Recording menu item - disabled for now, code preserved for future re-enablement
  // let recordingMenuItem: electron.MenuItemConstructorOptions;
  //
  // if (recordingState === "recording") {
  //   recordingMenuItem = {
  //     label: "■ Stop Recording",
  //     click: async () => {
  //       await handleStopRecording();
  //     },
  //   };
  // } else {
  //   // idle or selecting state
  //   recordingMenuItem = {
  //     label: "Record Screen",
  //     click: async () => {
  //       await handleStartRecordingFlow();
  //     },
  //   };
  // }

  const menuItems: electron.MenuItemConstructorOptions[] = [];

  // Add capture menu items
  menuItems.push(...captureMenuItems);
  menuItems.push({ type: "separator" });

  // Recording feature disabled for now - code preserved for future re-enablement
  // if (recordingState === "recording") { ... }

  const contextMenu = Menu.buildFromTemplate([
    ...menuItems,
    {
      label: "View My Snaps",
      click: async () => {
        try {
          log.info("[Tray] View My Snaps clicked");

          // Show the main window first
          await showMainWindow();

          // Verify window is ready before navigation
          if (!mainWindow || mainWindow.isDestroyed()) {
            log.error("[Tray] Main window not available after showMainWindow");
            dialog.showErrorBox(
              "Window Error",
              "Unable to open the application window. Please try again."
            );
            return;
          }

          // Check if webContents is ready
          if (!mainWindow.webContents) {
            log.error("[Tray] WebContents not available");
            dialog.showErrorBox(
              "Window Error",
              "Application window is not ready. Please try again."
            );
            return;
          }

          // Wait for the page to be ready before navigation
          if (mainWindow.webContents.isLoading()) {
            log.info("[Tray] Waiting for page to finish loading...");
            await new Promise<void>((resolve) => {
              mainWindow!.webContents.once("did-finish-load", () => {
                log.info("[Tray] Page loaded, ready to navigate");
                resolve();
              });
            });
          }

          // Navigate to home page
          log.info("[Tray] Navigating to /home");
          mainWindow.webContents.send("navigate", "/home");
        } catch (error) {
          log.error("[Tray] Failed to show snaps:", error);
          dialog.showErrorBox(
            "Navigation Error",
            "Failed to open your snaps. Please try again or restart the application."
          );
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        if (mainWindow && mainWindow.setQuitting) {
          mainWindow.setQuitting(true);
        }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Handle macOS screen recording permission request flow
 * Shows dialog to user and opens System Settings if requested
 * Returns true if user clicked "Open System Settings", false otherwise
 */

async function showMainWindow() {
  // Prevent concurrent calls to showMainWindow
  if (isShowingWindow) {
    log.info("[App] Already showing window, skipping duplicate call");
    return;
  }

  isShowingWindow = true;

  try {
    // Check if window exists and is not destroyed
    if (!mainWindow || mainWindow.isDestroyed()) {
      log.info("[App] Main window destroyed, recreating...");
      await createMainWindow();
    } else {
      // Handle minimized state
      if (mainWindow.isMinimized()) {
        log.info("[App] Restoring minimized window");
        mainWindow.restore();
      }

      // Handle hidden state
      if (!mainWindow.isVisible()) {
        log.info("[App] Showing hidden window");
        mainWindow.show();
      }

      // Always focus to bring window to front
      mainWindow.focus();
    }
  } catch (error) {
    log.error("[App] Failed to show main window:", error);
    // If showing fails, try to recreate the window
    try {
      log.info("[App] Attempting to recreate window after error...");
      mainWindow = null; // Clear the reference
      await createMainWindow();
    } catch (recreateError) {
      log.error("[App] Failed to recreate window:", recreateError);
      // Show user-friendly error dialog
      dialog.showErrorBox(
        "Application Error",
        "Failed to open the application window. Please restart SnapFlow."
      );
    }
  } finally {
    isShowingWindow = false;
  }
}

async function createWindowCaptureOverlay() {
  const { screen } = electron;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height, x, y } = primaryDisplay.bounds;

  // Capture screenshot first to use as background
  const { dataUrl } = await captureService.captureScreenshot({
    mode: "fullscreen",
  });

  // Get all available windows before creating overlay
  const availableWindows = await captureService.getAvailableWindows();

  windowCaptureOverlay = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    backgroundColor: "#00000000", // Fully transparent background
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Set always on top but don't use fullscreen mode (which can break transparency on macOS)
  windowCaptureOverlay.setAlwaysOnTop(true, "screen-saver", 1);
  windowCaptureOverlay.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  // Load the window capture page
  if (isProd) {
    await windowCaptureOverlay.loadURL("app://./window-capture");
  } else {
    const port = process.argv[2];
    await windowCaptureOverlay.loadURL(
      `http://localhost:${port}/window-capture`
    );
  }

  // Send background screenshot and available windows to the renderer
  windowCaptureOverlay.webContents.once("did-finish-load", () => {
    windowCaptureOverlay?.webContents.send("background-screenshot", {
      dataUrl,
    });
    windowCaptureOverlay?.webContents.send(
      "available-windows",
      availableWindows
    );
  });

  // Handle window close
  windowCaptureOverlay.on("closed", () => {
    windowCaptureOverlay = null;
  });
}

async function createAreaCaptureOverlay() {
  const { screen } = electron;

  // For now, use primary display - in future, could show overlay on all displays
  const primaryDisplay = screen.getPrimaryDisplay();

  // Use bounds (includes menu bar and dock) not workArea (excludes them)
  const { width, height, x, y } = primaryDisplay.bounds;
  const scaleFactor = primaryDisplay.scaleFactor || 1;

  // Create the overlay window (no need to capture screenshot beforehand)
  windowCaptureOverlay = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    backgroundColor: "#00000000", // Fully transparent background
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Set always on top but don't use fullscreen mode (which can break transparency on macOS)
  windowCaptureOverlay.setAlwaysOnTop(true, "screen-saver", 1);
  windowCaptureOverlay.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  // Load the area capture page
  if (isProd) {
    await windowCaptureOverlay.loadURL("app://./area-capture");
  } else {
    const port = process.argv[2];
    await windowCaptureOverlay.loadURL(`http://localhost:${port}/area-capture`);
  }

  // Send display info once page is loaded
  windowCaptureOverlay.webContents.once("did-finish-load", async () => {
    const overlayBounds =
      windowCaptureOverlay?.getBounds() || primaryDisplay.bounds;

    windowCaptureOverlay?.webContents.send("area-capture-ready", {
      scaleFactor,
      displayBounds: primaryDisplay.bounds,
      overlayBounds,
    });
  });

  // Handle window close
  windowCaptureOverlay.on("closed", () => {
    windowCaptureOverlay = null;
  });
}

async function handleScreenshotCapture(
  mode: "fullscreen" | "window" | "region" | "all-screens" | "specific-screen",
  screenId?: string
) {
  try {
    // For window mode, create a transparent overlay for window selection
    if (mode === "window") {
      mainWindow?.hide();

      // Wait a bit for window to hide
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Create transparent overlay window for window selection
      await createWindowCaptureOverlay();
      return;
    }

    if (mode === "region") {
      mainWindow?.hide();

      // Wait a bit for window to hide (reduced delay for smoother UX)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create transparent overlay window for area selection
      await createAreaCaptureOverlay();
      return;
    }

    // For fullscreen, all-screens, or specific-screen, capture immediately
    log.info("[Tray] Starting", mode, "capture...");

    mainWindow?.hide();
    await new Promise((resolve) => setTimeout(resolve, 300));

    log.info("[Tray] Capturing screenshot...");
    const captureOptions: {
      mode:
        | "fullscreen"
        | "window"
        | "region"
        | "all-screens"
        | "specific-screen";
      screenId?: string;
    } = {
      mode: mode as
        | "fullscreen"
        | "window"
        | "region"
        | "all-screens"
        | "specific-screen",
    };
    if (mode === "specific-screen" && screenId) {
      captureOptions.screenId = screenId;
    }

    const { dataUrl } = await captureService.captureScreenshot(captureOptions);
    log.info(
      "[Tray] Screenshot captured, dataUrl length:",
      dataUrl?.length || 0
    );

    // Store screenshot data globally so annotate page can retrieve it
    pendingScreenshot = { dataUrl, mode };
    log.info("[Tray] Screenshot stored in pendingScreenshot");

    // Navigate to annotate page first (while hidden)
    log.info("[Tray] Navigating to annotate page...");
    try {
      if (isProd) {
        await mainWindow?.loadURL("app://./annotate");
      } else {
        const port = process.argv[2];
        await mainWindow?.loadURL(`http://localhost:${port}/annotate`);
      }
      log.info("[Tray] Navigation complete");
    } catch (err) {
      log.error("[Tray] Navigation failed:", err);
    }

    // Then show and focus the window
    mainWindow?.show();
    mainWindow?.focus();
    log.info("[Tray] Window shown and focused");
  } catch (error) {
    log.error("[Tray] Failed to capture screenshot:", error);
  }
}

// TODO: Recording feature - temporarily disabled
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleScreenRecording() {
  try {
    // Create area selector for recording
    await createRecordingAreaSelector();
  } catch (error) {
    log.error("[Recording] Failed to start recording:", error);
  }
}

// TODO: Recording feature - temporarily disabled
// (Old createRecordingAreaSelector removed - using new one below)

// Prefix with underscore to indicate intentionally unused (will be used when recording feature is enabled)
async function _createRecordingControlWindow(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  // Create a small control window that floats above everything
  const controlWidth = 300;
  const controlHeight = 150;

  recordingControlWindow = new BrowserWindow({
    width: controlWidth,
    height: controlHeight,
    x: bounds.x + bounds.width / 2 - controlWidth / 2,
    y: bounds.y + bounds.height + 20, // Position below the recording area
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });

  recordingControlWindow.setAlwaysOnTop(true, "floating");

  // Pass recording bounds to the control window
  const controlData = encodeURIComponent(JSON.stringify(bounds));

  if (isProd) {
    await recordingControlWindow.loadURL(
      `app://./recording-control?bounds=${controlData}`
    );
  } else {
    const port = process.argv[2];
    await recordingControlWindow.loadURL(
      `http://localhost:${port}/recording-control?bounds=${controlData}`
    );
  }

  recordingControlWindow.on("closed", () => {
    recordingControlWindow = null;
  });
}

// Recording workflow functions
async function _handleStartRecordingFlow() {
  try {
    log.info("[Recording] Starting recording flow");
    recordingState = "selecting";

    // Keep app in dock
    if (process.platform === "darwin") {
      app.dock?.show();
    }

    // Hide main window
    mainWindow?.hide();

    // Wait for window to hide
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Create recording area selector
    await createRecordingAreaSelector();
  } catch (error) {
    log.error("[Recording] Failed to start recording flow:", error);
    recordingState = "idle";
    trayIconManager?.setState("normal");
    updateTrayMenu();
  }
}

async function createRecordingAreaSelector() {
  const { screen } = electron;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height, x, y } = primaryDisplay.bounds;

  recordingAreaSelector = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  recordingAreaSelector.setAlwaysOnTop(true, "screen-saver", 1);
  recordingAreaSelector.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  // Load recording area selector
  if (isProd) {
    await recordingAreaSelector.loadURL("app://./recording-area-selector");
  } else {
    const port = process.argv[2];
    await recordingAreaSelector.loadURL(
      `http://localhost:${port}/recording-area-selector`
    );
  }

  recordingAreaSelector.on("closed", () => {
    if (recordingState === "selecting") {
      recordingState = "idle";
      trayIconManager?.setState("normal");
      updateTrayMenu();
    }
    recordingAreaSelector = null;
  });
}

async function handleRecordingAreaSelected(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  try {
    log.info("[Recording] Area selected:", bounds);
    recordingBounds = bounds;

    // Close area selector first
    if (recordingAreaSelector) {
      recordingAreaSelector.close();
      recordingAreaSelector = null;
    }

    // Start recording immediately after area selection
    log.info("[Recording] Starting recording with selected bounds");
    recordingState = "recording";

    // Change tray icon to recording state
    trayIconManager?.setState("recording");
    updateTrayMenu();

    // Start recording
    await captureService.startRecording(recordingBounds);

    log.info("[Recording] Recording started. Click tray icon to stop.");
  } catch (error) {
    log.error("[Recording] Failed to start recording:", error);
    recordingState = "idle";
    recordingBounds = null;
    trayIconManager?.setState("normal");
    updateTrayMenu();

    dialog.showErrorBox(
      "Recording Error",
      "Failed to start recording. Please try again."
    );
  }
}

// Note: handleBeginRecording is no longer needed as recording starts immediately
// after area selection in handleRecordingAreaSelected()

async function _handleStopRecording() {
  try {
    log.info("[Recording] Stopping recording");

    // Reset state immediately
    recordingState = "idle";
    recordingBounds = null;
    trayIconManager?.setState("normal");
    updateTrayMenu();

    // Stop recording and get result
    const result = await captureService.stopRecording();
    log.info("[Recording] Recording stopped:", result);

    // Store recording data including thumbnail path
    pendingRecording = {
      dataUrl: result.filePath, // Path to video file
      duration: result.duration,
      thumbnailPath: result.thumbnailPath, // Path to thumbnail
      issueId: result.issueId, // Issue ID for file organization
    };

    // Show main window and navigate to recording annotate page
    mainWindow?.show();

    if (isProd) {
      await mainWindow?.loadURL("app://./annotate-recording");
    } else {
      const port = process.argv[2];
      await mainWindow?.loadURL(`http://localhost:${port}/annotate-recording`);
    }

    log.info("[Recording] Navigated to annotate-recording page");
  } catch (error) {
    log.error("[Recording] Failed to stop recording:", error);

    // Reset state on error
    recordingState = "idle";
    recordingBounds = null;
    trayIconManager?.setState("normal");
    updateTrayMenu();

    dialog.showErrorBox(
      "Recording Error",
      "Failed to stop recording. The recording may not have been saved."
    );
  }
}

async function handleCancelRecording() {
  log.info("[Recording] Canceling recording");

  // Reset state
  recordingState = "idle";
  recordingBounds = null;
  trayIconManager?.setState("normal");
  updateTrayMenu();

  // Close area selector if open
  if (recordingAreaSelector) {
    recordingAreaSelector.close();
    recordingAreaSelector = null;
  }

  // Show main window
  mainWindow?.show();
}

/**
 * Handle OAuth callback deep link (snapflow://auth/callback)
 *
 * Strategy: Just set the session and let the auth listener handle user setup.
 * The auth listener (sessionManager.attachAuthListener) will fire on SIGNED_IN
 * and call sessionManager.setUser() which handles all the business logic.
 * We just need to ensure navigation happens after the user is set.
 */
const handleOAuthCallback = async (url: string) => {
  log.info("[OAuth] Handling callback URL:", url);

  try {
    // Supabase v2 uses PKCE by default: callback has ?code=... in query params.
    // Older implicit flow puts tokens in the hash (#access_token=...).
    // Try PKCE first, fall back to implicit.
    const parsedUrl = new URL(url);
    const code = parsedUrl.searchParams.get("code");

    if (code) {
      // PKCE flow — exchange authorization code for session
      log.info("[OAuth] PKCE flow detected, exchanging code for session");
      const session = await authService.exchangeCodeForSession(url);
      if (!session) {
        log.error("[OAuth] Failed to exchange code for session");
        return;
      }
      log.info("[OAuth] Session exchanged successfully");
      // PKCE flow is handled by Supabase and will trigger auth listener
    } else {
      // Implicit flow — extract tokens from hash fragment
      const hashFragment = url.substring(url.indexOf("#") + 1);
      const params = new URLSearchParams(hashFragment);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken || !refreshToken) {
        log.warn("[OAuth] No code or tokens found in callback URL:", url);
        return;
      }

      log.info("[OAuth] Implicit flow detected, setting session from tokens");
      try {
        // Set session - this returns both session and user object
        log.info("[OAuth] Calling setSession...");
        const result = await authService.setSession(accessToken, refreshToken);
        log.info(
          "[OAuth] setSession returned, session exists:",
          !!result.session
        );
        if (result.user) {
          log.info(
            "[OAuth] Applying user directly from setSession:",
            result.user.email
          );
          await sessionManager.setUser(result.user);
          log.info(
            "[OAuth] User applied successfully, skipping auth listener wait"
          );
        }
      } catch (setSessionError) {
        log.error("[OAuth] Error in setSession:", setSessionError);
        throw setSessionError;
      }
    }

    // User is now set via setSession (implicit flow) or auth listener (PKCE flow)

    // Check for pending workspace invite in user metadata (from Supabase admin invite)
    // Admin API uses app_metadata, OTP uses user_metadata
    const session = authService.getSession();
    let invitedWorkspaceId: string | undefined;
    let invitedRole: string | undefined;
    if (session?.user) {
      invitedWorkspaceId =
        (session.user as any).user_metadata?.invited_to_workspace ||
        (session.user as any).app_metadata?.invited_to_workspace;
      invitedRole =
        (session.user as any).user_metadata?.invited_role ||
        (session.user as any).app_metadata?.invited_role ||
        "dev";
      if (invitedWorkspaceId) {
        log.info(
          "[OAuth] User has pending invite to workspace:",
          invitedWorkspaceId
        );
      }
    }

    // Determine where to navigate: invited users (already workspace members) go to /home,
    // new users who need to set up their org go to /onboarding,
    // users with pending invites go to /join-workspace.
    let navigateTo = "/onboarding";
    try {
      const currentUserId = sessionManager.getUserId();
      if (currentUserId) {
        const existingTenant =
          await tenantService.getTenantByOwner(currentUserId);
        if (existingTenant) {
          // User owns a tenant — they've completed onboarding already
          log.info("[OAuth] User owns a tenant, navigating to /home");
          navigateTo = "/home";
        } else {
          // Check if user has a pending invite (metadata present, not yet a member)
          if (invitedWorkspaceId) {
            const supabase = getSupabase();
            if (supabase) {
              const { data: existingMember } = await supabase
                .from("workspace_members")
                .select("id")
                .eq("user_id", currentUserId)
                .eq("workspace_id", invitedWorkspaceId)
                .limit(1)
                .maybeSingle();

              if (!existingMember) {
                // Pending invite — user not yet added to workspace
                log.info(
                  "[OAuth] User has pending invite, navigating to /join-workspace"
                );
                navigateTo = `/join-workspace?workspaceId=${invitedWorkspaceId}&role=${invitedRole}`;
              } else {
                // Already a member (invite was previously accepted)
                log.info(
                  "[OAuth] Invited user already accepted, navigating to /home"
                );
                navigateTo = "/home";
              }
            }
          } else {
            // No pending invite, check if user is a member of any workspace (invited user from before)
            const supabase = getSupabase();
            if (supabase) {
              const { data: memberData } = await supabase
                .from("workspace_members")
                .select("workspace_id")
                .eq("user_id", currentUserId)
                .limit(1)
                .maybeSingle();
              if (memberData?.workspace_id) {
                log.info(
                  "[OAuth] User has workspace membership, navigating to /home"
                );
                navigateTo = "/home";
              }
            }
          }
        }
      }
    } catch (navCheckError) {
      log.warn(
        "[OAuth] Could not determine navigation target, defaulting to /onboarding:",
        navCheckError
      );
    }

    log.info("[OAuth] Attempting to send navigate event...");
    log.info("[OAuth] mainWindow exists:", !!mainWindow);
    if (mainWindow) {
      log.info("[OAuth] mainWindow destroyed:", mainWindow.isDestroyed());
      log.info(
        "[OAuth] mainWindow.webContents exists:",
        !!mainWindow.webContents
      );
    }

    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      try {
        log.info(`[OAuth] Sending navigate event to renderer: ${navigateTo}`);
        mainWindow.webContents.send("navigate", navigateTo);
        log.info("[OAuth] Navigate event sent successfully ✓");
      } catch (sendError) {
        log.error("[OAuth] Error sending navigate event:", sendError);
      }
    } else {
      log.warn("[OAuth] Cannot send navigate event - mainWindow not available");
    }

    log.info("[OAuth] ✓ OAuth callback handled");
  } catch (error) {
    log.error("[OAuth] Unexpected error handling OAuth callback:", error);
  }
};

/**
 * Handle Zoho OAuth callback
 */
const handleZohoCallback = async (url: string) => {
  log.info("[Zoho OAuth] ========== CALLBACK HANDLER START ==========");
  log.info("[Zoho OAuth] Full callback URL:", url);

  try {
    const parsedUrl = new URL(url);
    log.info("[Zoho OAuth] Parsed URL pathname:", parsedUrl.pathname);
    log.info("[Zoho OAuth] Parsed URL search:", parsedUrl.search);

    const code = parsedUrl.searchParams.get("code");
    const error = parsedUrl.searchParams.get("error");
    const errorDescription = parsedUrl.searchParams.get("error_description");
    const accountsServer = parsedUrl.searchParams.get("accounts-server");
    const location = parsedUrl.searchParams.get("location");

    log.info(
      "[Zoho OAuth] Code extracted:",
      code ? `${code.substring(0, 20)}...` : "NULL"
    );
    log.info("[Zoho OAuth] Error extracted:", error || "NULL");
    log.info("[Zoho OAuth] Error description:", errorDescription || "NULL");
    log.info("[Zoho OAuth] Accounts server:", accountsServer || "NULL");
    log.info("[Zoho OAuth] Location:", location || "NULL");

    if (error) {
      log.warn(
        "[Zoho OAuth] Authorization error from Zoho:",
        error,
        errorDescription
      );
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(
          "zoho-oauth-error",
          `Authorization failed: ${error} - ${errorDescription}`
        );
      }
      return;
    }

    if (!code) {
      log.warn("[Zoho OAuth] No authorization code in callback URL");
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(
          "zoho-oauth-error",
          "No authorization code received"
        );
      }
      return;
    }

    // Handle data center region mismatch - set the correct accounts server before token exchange
    if (accountsServer) {
      log.info(
        "[Zoho OAuth] Setting Zoho service to use region-specific server:",
        accountsServer
      );
      zohoService.setAccountsServer(accountsServer);
    }

    log.info("[Zoho OAuth] ✓ Code validation passed, proceeding to exchange");
    log.info("[Zoho OAuth] Calling zohoService.exchangeCodeForTokens()");

    const tokens = await zohoService.exchangeCodeForTokens(code);

    log.info("[Zoho OAuth] ✓ Token exchange succeeded");
    log.info(
      "[Zoho OAuth] Received tokens - AccessToken length:",
      tokens.accessToken.length
    );
    log.info(
      "[Zoho OAuth] Received tokens - RefreshToken length:",
      tokens.refreshToken.length
    );
    log.info("[Zoho OAuth] Received tokens - ExpiresIn:", tokens.expiresIn);
    log.info(
      "[Zoho OAuth] API Domain from response:",
      tokens.apiDomain || "NOT PROVIDED"
    );

    // Update API domain if provided in token response
    if (tokens.apiDomain) {
      log.info("[Zoho OAuth] Updating API domain with response value");
      zohoService.setAccountsServer(
        accountsServer || "https://accounts.zoho.com",
        tokens.apiDomain
      );
    }

    // Normalize apiDomain to just the domain
    let normalizedApiDomain = tokens.apiDomain;
    if (normalizedApiDomain) {
      // First, try to parse as URL if it looks like one
      if (normalizedApiDomain.includes("://")) {
        try {
          const url = new URL(normalizedApiDomain);
          normalizedApiDomain = url.hostname;
          log.info(
            "[Zoho OAuth] Normalized api_domain from URL to hostname:",
            normalizedApiDomain
          );
        } catch (_e) {
          log.warn(
            "[Zoho OAuth] Failed to parse api_domain as URL, using as-is:",
            normalizedApiDomain
          );
        }
      }

      // Remove www. prefix if present
      if (normalizedApiDomain && normalizedApiDomain.startsWith("www.")) {
        normalizedApiDomain = normalizedApiDomain.replace("www.", "");
        log.info(
          "[Zoho OAuth] Removed www. prefix from api_domain:",
          normalizedApiDomain
        );
      }
    }

    // Store tokens temporarily in memory until connector is saved
    pendingZohoTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
      accountsServer: accountsServer || "https://accounts.zoho.com",
      apiDomain:
        normalizedApiDomain ||
        (accountsServer ? accountsServer.replace("accounts.", "") : undefined),
    };

    log.info("[Zoho OAuth] ✓ Tokens stored in memory");
    log.info(
      "[Zoho OAuth] Stored accounts server:",
      pendingZohoTokens.accountsServer
    );
    log.info("[Zoho OAuth] Stored API domain:", pendingZohoTokens.apiDomain);

    // Notify renderer that OAuth is complete
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      log.info("[Zoho OAuth] Sending 'zoho-oauth-success' event to renderer");
      mainWindow.webContents.send("zoho-oauth-success");
    }

    log.info("[Zoho OAuth] ✓ OAuth callback handled successfully");
    log.info("[Zoho OAuth] ========== CALLBACK HANDLER END ==========");
  } catch (error) {
    log.error("[Zoho OAuth] ✗ Error handling callback");
    log.error(
      "[Zoho OAuth] Error type:",
      error instanceof Error ? error.constructor.name : typeof error
    );
    log.error(
      "[Zoho OAuth] Error message:",
      error instanceof Error ? error.message : String(error)
    );
    if (error instanceof Error && error.stack) {
      log.error("[Zoho OAuth] Stack trace:", error.stack);
    }
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      mainWindow.webContents.send("zoho-oauth-error", errorMsg);
    }
    log.info("[Zoho OAuth] ========== CALLBACK HANDLER END (ERROR) ==========");
  }
};

/**
 * Handle GitHub OAuth callback
 */
const handleGitHubCallback = async (url: string) => {
  log.info("[GitHub OAuth] Handling callback URL");

  try {
    const parsedUrl = new URL(url);
    const code = parsedUrl.searchParams.get("code");
    const error = parsedUrl.searchParams.get("error");

    if (error) {
      log.warn("[GitHub OAuth] Authorization error:", error);
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(
          "github-oauth-error",
          `Authorization failed: ${error}`
        );
      }
      return;
    }

    if (!code) {
      log.warn("[GitHub OAuth] No authorization code in callback URL");
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(
          "github-oauth-error",
          "No authorization code received"
        );
      }
      return;
    }

    log.info("[GitHub OAuth] Exchanging authorization code for token");
    const tokens = await githubService.exchangeCodeForToken(code);

    // Store token temporarily in memory until connector is saved
    pendingGitHubTokens = {
      accessToken: tokens.accessToken,
      expiresAt: Date.now() + (tokens.expiresIn || 28800) * 1000,
    };

    log.info("[GitHub OAuth] ✓ Token received and stored");

    // Notify renderer that OAuth is complete
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send("github-oauth-success");
    }

    log.info("[GitHub OAuth] ✓ OAuth callback handled");
  } catch (error) {
    log.error("[GitHub OAuth] Error handling callback:", error.message);
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      mainWindow.webContents.send("github-oauth-error", errorMsg);
    }
  }
};

// Request single instance lock
if (app && app.requestSingleInstanceLock) {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    // Another instance is already running, quit this one
    app.quit();
  } else {
    // Register snapflow:// as the default protocol handler so the OS routes
    // OAuth callback URLs back to this app after the browser completes sign-in.
    // In dev mode, Electron needs the executable path + script path explicitly.
    if (isProd) {
      app.setAsDefaultProtocolClient("snapflow");
    } else {
      app.setAsDefaultProtocolClient("snapflow", process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }

    // Handle macOS deep link (open-url event) — currently only for Google OAuth
    // Zoho and GitHub OAuth now use localhost HTTP callbacks
    app.on("open-url", (event, url) => {
      event.preventDefault();
      log.info("[Deep Link] Received deep link:", url);
      if (url.startsWith("snapflow://auth/callback")) {
        handleOAuthCallback(url);
      }
    });

    // Handle Windows/Linux second instance with command line args
    app.on("second-instance", async (_event, commandLine) => {
      // Check if one of the command line arguments is a Google OAuth callback
      const callbackUrl = commandLine.find((arg) =>
        arg.startsWith("snapflow://auth/callback")
      );
      if (callbackUrl) {
        log.info("[Deep Link] Second instance Google OAuth callback detected");
        handleOAuthCallback(callbackUrl);
      } else {
        // Regular second instance - just focus the window
        log.info("[Deep Link] Second instance focus");
        await showMainWindow();
      }
    });

    (async () => {
      await app.whenReady();

      // Initialize secure config (must run after app.whenReady() — electron.safeStorage requires app ready)
      // Production: loads encrypted secrets from store (or bootstraps from JSON on first launch)
      // Development: no-op (env vars loaded via dotenv from project root)
      if (isProd) {
        await secureConfig.initialize();
      }

      // Register custom protocol for local file access.
      // IMPORTANT: OAuth deep-link callbacks arrive as snapflow://auth/callback?code=...
      // Those must NOT be handled here — they are handled by the open-url / second-instance
      // events above.  Skip them so the OS deep-link routing works correctly.
      protocol.registerFileProtocol("snapflow", (request, callback) => {
        const rawUrl = request.url;

        // Pass Google OAuth callback URLs through — do not try to serve them as files.
        // (Zoho and GitHub OAuth now use localhost HTTP callbacks, not custom protocols)
        if (rawUrl.startsWith("snapflow://auth/")) {
          log.info(
            "[Protocol] Skipping file-serve for Google OAuth callback URL:",
            rawUrl
          );
          // Trigger the OAuth callback handler directly from here as a safety net,
          // because on macOS the open-url event fires before the app is ready in
          // some cases and can be missed.
          handleOAuthCallback(rawUrl);
          callback({ error: -3 }); // ERR_FILE_NOT_FOUND — benign, browser already closed
          return;
        }

        // Remove protocol - handle both snapflow:// and snapflow:///
        let url = rawUrl.substring("snapflow://".length);

        // Ensure absolute path starts with /
        if (!url.startsWith("/")) {
          url = "/" + url;
        }

        try {
          const decodedPath = decodeURIComponent(url);
          log.info("Loading file:", decodedPath);

          // Check if file exists
          if (fs.existsSync(decodedPath)) {
            callback({ path: decodedPath });
          } else {
            log.error("File not found:", decodedPath);
            callback({ error: -6 }); // FILE_NOT_FOUND
          }
        } catch (error) {
          log.error("Error loading file:", error);
          callback({ error: -2 }); // FAILED
        }
      });

      // Initialize session from persistent storage (non-blocking — renderer handles auth state)
      sessionManager.initialize().catch((err) => {
        log.error("[App] Session initialization failed:", err);
      });

      // Initialize storage
      await storageManager.ensureDirectories();

      // Remove the menu bar entirely for Windows/Linux
      Menu.setApplicationMenu(null);

      // Create main window
      await createMainWindow();

      // Setup IPC handlers
      setupIPCHandlers();

      // Start session expiry monitor
      startSessionExpiryMonitor();

      // Start OAuth callback server (localhost HTTP server)
      startOAuthCallbackServer();

      // Create system tray
      createSystemTray();

      // Register global keyboard shortcuts
      registerGlobalShortcuts();

      // Listen for display changes to update tray menu
      screen.on("display-added", () => {
        log.info("[Display] Display added, updating tray menu");
        updateTrayMenu();
      });

      screen.on("display-removed", () => {
        log.info("[Display] Display removed, updating tray menu");
        updateTrayMenu();
      });

      screen.on("display-metrics-changed", () => {
        log.info("[Display] Display metrics changed, updating tray menu");
        updateTrayMenu();
      });

      // Initialize auto-updater (only in production)
      if (isProd) {
        updaterService.init();
        updaterService.setMainWindow(mainWindow);
        // Check for updates after a 3-second delay (don't block startup)
        setTimeout(() => {
          updaterService
            .checkForUpdates()
            .catch((err) =>
              log.warn("[Update] Background check failed:", err.message)
            );
        }, 3000);
        log.info("[Update] Auto-updater initialized");
      }
    })();
  }
}

// Prevent app from quitting when all windows are closed
if (app && app.on) {
  app.on("window-all-closed", () => {
    // Do nothing, keep app running in tray
  });

  // Unregister all shortcuts before quit
  app.on("will-quit", () => {
    log.info("[Shortcuts] Unregistering all global shortcuts");
    globalShortcut.unregisterAll();
  });
}

// Monitor session expiry and notify renderer
let sessionExpiryCheckInterval: NodeJS.Timeout | null = null;

function startSessionExpiryMonitor() {
  if (sessionExpiryCheckInterval) return; // Already running

  sessionExpiryCheckInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const expiresAt = sessionManager.getSessionExpiryTime();
    if (!expiresAt) return; // No session

    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;

    // Warn if expiring in next 30 minutes but not yet expired
    if (timeUntilExpiry > 0 && timeUntilExpiry <= 30 * 60 * 1000) {
      log.info(
        "[Session] Token expiring soon (",
        Math.round(timeUntilExpiry / 60000),
        "minutes)"
      );
      mainWindow.webContents.send("session-expiring-soon", expiresAt);
    }

    // Token expired
    if (timeUntilExpiry <= 0) {
      log.warn("[Session] Token has expired, clearing session");
      sessionManager
        .clearUser()
        .catch((err) =>
          log.error("[Session] Error clearing expired session:", err)
        );
      mainWindow.webContents.send("session-expired");
    }
  }, 60 * 1000); // Check every minute

  log.info("[Session] Session expiry monitor started");
}

function _stopSessionExpiryMonitor() {
  if (sessionExpiryCheckInterval) {
    clearInterval(sessionExpiryCheckInterval);
    sessionExpiryCheckInterval = null;
    log.info("[Session] Session expiry monitor stopped");
  }
}

// ─── OAuth Callback HTTP Server ────────────────────────────────────────────

let oauthCallbackServer: http.Server | null = null;

function startOAuthCallbackServer() {
  if (oauthCallbackServer) {
    log.info("[OAuth Server] Already running on port 3000");
    return;
  }

  oauthCallbackServer = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost:3000");
    const pathname = url.pathname;

    log.info("[OAuth Server] Request:", pathname);

    // Handle Zoho OAuth callback
    if (pathname === "/auth/zoho/callback") {
      log.info("[OAuth Server] ========== ZOHO CALLBACK RECEIVED ==========");
      log.info("[OAuth Server] Request URL:", req.url);
      log.info(
        "[OAuth Server] Full callback:",
        `http://localhost:3000${req.url}`
      );

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      log.info(
        "[OAuth Server] Code present:",
        !!code,
        code ? `(${code.substring(0, 20)}...)` : ""
      );
      log.info("[OAuth Server] Error present:", !!error, error || "");
      log.info("[OAuth Server] Error description:", errorDescription || "");

      if (error) {
        log.warn(
          "[OAuth Server] Zoho authorization error:",
          error,
          errorDescription
        );
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Authorization Failed</h1><p>${error}</p></body></html>`
        );
        return;
      }

      if (!code) {
        log.warn("[OAuth Server] No code in Zoho callback");
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Authorization Failed</h1><p>No authorization code received</p></body></html>`
        );
        return;
      }

      log.info("[OAuth Server] ✓ Zoho callback validation passed");
      log.info("[OAuth Server] Triggering handleZohoCallback async handler");
      // Trigger the Zoho handler with the full URL
      const fullUrl = `http://localhost:3000${req.url}`;
      handleZohoCallback(fullUrl).catch((err) => {
        log.error(
          "[OAuth Server] handleZohoCallback threw error:",
          err.message
        );
      });

      // Send success page to browser
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><body><h1>Authorization Successful</h1><p>You can close this window and return to SnapFlow.</p></body></html>`
      );
      return;
    }

    // Handle GitHub OAuth callback
    if (pathname === "/auth/github/callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        log.warn("[OAuth Server] GitHub error:", error);
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Authorization Failed</h1><p>${error}</p></body></html>`
        );
        return;
      }

      if (!code) {
        log.warn("[OAuth Server] No code in GitHub callback");
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Authorization Failed</h1><p>No authorization code received</p></body></html>`
        );
        return;
      }

      log.info("[OAuth Server] GitHub callback received with code");
      // Trigger the GitHub handler with the full URL
      handleGitHubCallback(`http://localhost:3000${req.url}`);

      // Send success page to browser
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><body><h1>Authorization Successful</h1><p>You can close this window and return to SnapFlow.</p></body></html>`
      );
      return;
    }

    // 404 for unknown paths
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(`<html><body><h1>Not Found</h1></body></html>`);
  });

  oauthCallbackServer.listen(3000, "localhost", () => {
    log.info("[OAuth Server] ✓ Listening on http://localhost:3000");
  });

  oauthCallbackServer.on("error", (err) => {
    log.error("[OAuth Server] Error:", err);
  });
}

function _stopOAuthCallbackServer() {
  if (oauthCallbackServer) {
    oauthCallbackServer.close();
    oauthCallbackServer = null;
    log.info("[OAuth Server] Stopped");
  }
}

// Setup IPC Handlers function
function setupIPCHandlers() {
  if (!ipcMain) return;

  // Auth handlers
  ipcMain.handle("user:create", async (_event, { name, email, password }) => {
    try {
      const user = await authService.createUser(name, email, password);
      // Store user in session (same as login)
      await sessionManager.setUser(user);
      return { success: true, data: user };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Create user error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("user:login", async (_event, { email, password }) => {
    try {
      log.info("[IPC] Login attempt for:", email);
      log.info(
        "[ENV] SUPABASE_URL:",
        process.env.SUPABASE_URL ? "SET" : "NOT SET"
      );
      log.info(
        "[ENV] SUPABASE_ANON_KEY:",
        process.env.SUPABASE_ANON_KEY
          ? "SET (length: " + process.env.SUPABASE_ANON_KEY.length + ")"
          : "NOT SET"
      );

      const user = await authService.login(email, password);
      log.info("[IPC] Login successful for:", user.email);

      // Store user in session
      await sessionManager.setUser(user);
      return { success: true, data: user };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[IPC] Login error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("user:get", async (_event, userId?: string) => {
    try {
      // If userId provided, fetch from database
      if (userId) {
        const user = await authService.getUserById(userId);
        return { success: true, data: user };
      }
      // Otherwise return current session user
      const user = sessionManager.getUser();
      return { success: true, data: user };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("session:is-initialized", () => {
    return { success: true, data: sessionManager.isInitialized() };
  });

  ipcMain.handle(
    "user:update",
    async (
      _event,
      { userId, updates }: { userId: string; updates: Record<string, unknown> }
    ) => {
      try {
        const user = await authService.updateUser(userId, updates);
        // Update session with new user data
        await sessionManager.setUser(user);
        return { success: true, data: user };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("IPC Handler error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle("user:logout", async () => {
    try {
      await sessionManager.clearUser();
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Logout error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("user:get-session-expiry", () => {
    try {
      const expiresAt = sessionManager.getSessionExpiryTime();
      if (!expiresAt) {
        return { success: true, data: { expiresAt: null, expiresIn: null } };
      }
      const expiresIn = Math.max(0, expiresAt - Date.now());
      return {
        success: true,
        data: {
          expiresAt,
          expiresIn,
          expiresAtDate: new Date(expiresAt).toISOString(),
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Get session expiry error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    "user:is-session-expiring-soon",
    (_, { minutesBuffer = 30 } = {}) => {
      try {
        const expiringSoon =
          sessionManager.isSessionExpiringsoon(minutesBuffer);
        return { success: true, data: { expiringSoon } };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("Check session expiry error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle("user:google-signin", async () => {
    try {
      const oauthUrl = await authService.googleSignIn();
      // Open the URL in the default browser
      shell.openExternal(oauthUrl);
      return { success: true, data: { url: oauthUrl } };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Google signin error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Tenant handlers
  ipcMain.handle("tenant:create", async (_event, { name, description }) => {
    try {
      const userId = sessionManager.getUserId();
      if (!userId) {
        throw new Error("User not authenticated");
      }
      const tenant = await tenantService.createTenant(
        userId,
        name,
        description
      );
      return { success: true, data: tenant };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Create tenant error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("tenant:get", async () => {
    try {
      const userId = sessionManager.getUserId();
      if (!userId) {
        throw new Error("User not authenticated");
      }
      const tenant = await tenantService.getTenantByOwner(userId);
      return { success: true, data: tenant };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Get tenant error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    "tenant:update",
    async (_event, { tenantId, name, description }) => {
      try {
        const userId = sessionManager.getUserId();
        if (!userId) {
          throw new Error("User not authenticated");
        }
        const tenant = await tenantService.updateTenant(tenantId, userId, {
          name,
          description,
        });
        return { success: true, data: tenant };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("Update tenant error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Workspace handlers
  ipcMain.handle(
    "workspace:create",
    async (_event, { tenantId, name, description }) => {
      try {
        const userId = sessionManager.getUserId();
        if (!userId) {
          throw new Error("User not authenticated");
        }
        const workspace = await workspaceService.createWorkspace(
          userId,
          tenantId,
          name,
          description
        );
        return { success: true, data: workspace };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("Create workspace error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle("workspace:list", async (_event, { tenantId }) => {
    try {
      const workspaces = await workspaceService.listWorkspaces(tenantId);
      return { success: true, data: workspaces };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("List workspaces error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    "workspace:update",
    async (_event, { workspaceId, name, description }) => {
      try {
        const userId = sessionManager.getUserId();
        if (!userId) {
          throw new Error("User not authenticated");
        }
        const workspace = await workspaceService.updateWorkspace(
          workspaceId,
          userId,
          {
            name,
            description,
          }
        );
        return { success: true, data: workspace };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("Update workspace error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle("workspace:delete", async (_event, { workspaceId }) => {
    try {
      const userId = sessionManager.getUserId();
      if (!userId) {
        throw new Error("User not authenticated");
      }
      await workspaceService.deleteWorkspace(workspaceId, userId);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Delete workspace error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("workspace:get-user-workspaces", async () => {
    try {
      const userId = sessionManager.getUserId();
      if (!userId) {
        throw new Error("User not authenticated");
      }
      const workspaces = await workspaceService.getUserWorkspaces(userId);
      return { success: true, data: workspaces };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Get user workspaces error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("workspace:get-info", async (_event, { workspaceId }) => {
    try {
      const workspace = await workspaceService.getWorkspaceById(workspaceId);
      if (!workspace) {
        return { success: false, error: "Workspace not found" };
      }
      const tenant = await tenantService.getTenantById(workspace.tenantId);
      if (!tenant) {
        return { success: false, error: "Tenant not found" };
      }
      return { success: true, data: { workspace, tenantName: tenant.name } };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Get workspace info error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("workspace:join", async (_event, { workspaceId, role }) => {
    try {
      const userId = sessionManager.getUserId();
      if (!userId) {
        throw new Error("User not authenticated");
      }

      // Check if user is already a member
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }
      const { data: existingMember } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .limit(1)
        .maybeSingle();

      if (existingMember) {
        log.warn("[workspace:join] User already a member of workspace");
        return { success: true, message: "User already a member" };
      }

      // Add user to workspace as member
      await workspaceService.addMember(workspaceId, userId, role);

      // Initialize onboarding progress if not exists
      let progress = await onboardingService.getProgress(userId);
      if (!progress) {
        await onboardingService.initializeProgress(userId);
      }

      // Set to connector step (step 4) for member onboarding
      await onboardingService.setStep(userId, 4);

      log.info(
        `[workspace:join] User ${userId} joined workspace ${workspaceId}`
      );
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Join workspace error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Workspace member handlers
  ipcMain.handle(
    "workspace-member:invite",
    async (_event, { workspaceId, email, role }) => {
      try {
        await workspaceService.inviteByEmail(workspaceId, email, role);
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("Invite team member error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle("workspace-member:list", async (_event, { workspaceId }) => {
    try {
      const members = await workspaceService.listMembers(workspaceId);
      return { success: true, data: members };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("List workspace members error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    "workspace-member:list-with-users",
    async (_event, { workspaceId }) => {
      try {
        const members =
          await workspaceService.listMembersWithUsers(workspaceId);
        return { success: true, data: members };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("List workspace members with users error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    "workspace-member:remove",
    async (_event, { workspaceId, userId }) => {
      try {
        await workspaceService.removeMember(workspaceId, userId);
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("Remove workspace member error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    "workspace-member:update-role",
    async (_event, { workspaceId, userId, role }) => {
      try {
        const member = await workspaceService.updateMemberRole(
          workspaceId,
          userId,
          role
        );
        return { success: true, data: member };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("Update workspace member role error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );
  ipcMain.handle("onboarding:get-status", async () => {
    try {
      const userId = sessionManager.getUserId();
      if (!userId) {
        return {
          success: true,
          data: {
            hasTenant: false,
            hasWorkspace: false,
            hasConnector: false,
            isComplete: false,
            currentStep: 1,
          },
        };
      }

      const tenant = await tenantService.getTenantByOwner(userId);

      // Check if user is an invited member of a workspace (non-owner)
      let isInvitedMember = false;
      let invitedWorkspace: Workspace | null = null;
      if (!tenant) {
        const supabase = getSupabase();
        if (supabase) {
          const { data: memberData } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();
          if (memberData?.workspace_id) {
            isInvitedMember = true;
            // Load workspace info for invited members
            invitedWorkspace = await workspaceService.getWorkspaceById(
              memberData.workspace_id
            );
            log.info(
              "[Onboarding] User is an invited workspace member, returning member mode status"
            );
          }
        }
      }

      // Invited members have their own onboarding flow (simplified - just connectors)
      if (isInvitedMember) {
        let progress = await onboardingService.getProgress(userId);
        if (!progress) {
          await onboardingService.initializeProgress(userId);
          progress = { currentStep: 4, isComplete: false };
        }

        return {
          success: true,
          data: {
            hasTenant: false,
            hasWorkspace: true,
            hasConnector: false,
            isComplete: progress.isComplete,
            currentStep: progress.isComplete ? 5 : progress.currentStep,
            userType: "member", // Indicate this is member mode
            workspace: invitedWorkspace ?? undefined,
          },
        };
      }

      const workspaces = tenant
        ? await workspaceService.listWorkspaces(tenant.id)
        : [];
      const workspace = workspaces[0] ?? null;
      const connectors = workspace
        ? await connectorService.getConnectors(workspace.id)
        : [];

      const hasTenant = !!tenant;
      const hasWorkspace = !!workspace;
      const hasConnector = connectors.length > 0;
      // Onboarding is complete after creating tenant + workspace (connectors optional)
      const isComplete = hasTenant && hasWorkspace;

      // Fetch persisted onboarding step
      let persistedProgress = await onboardingService.getProgress(userId);
      if (!persistedProgress) {
        // Initialize if not exists
        await onboardingService.initializeProgress(userId);
        persistedProgress = {
          currentStep: 1,
          isComplete: false,
        };
      }

      // If user has completed onboarding or completed flag is set, return step 5
      let currentStep = persistedProgress.currentStep;
      if (isComplete && !persistedProgress.isComplete) {
        // User just completed onboarding (created tenant + workspace)
        currentStep = 5;
        await onboardingService.complete(userId);
      } else if (persistedProgress.isComplete) {
        // Already marked complete, show step 5
        currentStep = 5;
      }

      return {
        success: true,
        data: {
          hasTenant,
          hasWorkspace,
          hasConnector,
          isComplete,
          currentStep,
          userType: "owner", // Indicate this is owner mode
          tenant: tenant ?? undefined,
          workspace: workspace ?? undefined,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Get onboarding status error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Onboarding set-step handler
  ipcMain.handle("onboarding:set-step", async (_event, { step }) => {
    try {
      const userId = sessionManager.getUserId();
      if (!userId) {
        return { success: false, error: "User not authenticated" };
      }

      await onboardingService.setStep(userId, step);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("Set onboarding step error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Issue handlers
  ipcMain.handle(
    "issue:create",
    async (
      _event,
      { userId, title, type, filePath, description, thumbnailPath }
    ) => {
      try {
        const issue = await issueService.createIssue(
          userId,
          title,
          type,
          filePath,
          description,
          thumbnailPath
        );

        // Trigger auto-sync to cloud if enabled (fire-and-forget)
        if (appSettingsStore.get("autoSync")) {
          syncService
            .syncAllToCloud(userId)
            .then((result) => {
              log.info("[AutoSync] Sync completed. Result:", {
                success: result.success,
                syncedCount: result.syncedCount,
                failedCount: result.failedCount,
              });
              if (result.success && mainWindow && mainWindow.webContents) {
                // Notify renderer that auto-sync completed so it can refresh
                log.info(
                  "[AutoSync] Sending auto-sync-completed event to renderer"
                );
                mainWindow.webContents.send("auto-sync-completed", {
                  userId,
                  syncedCount: result.syncedCount,
                });
              } else if (!result.success) {
                log.warn("[AutoSync] Sync failed:", result.errors);
              }
            })
            .catch((err) =>
              log.warn("[AutoSync] Background cloud sync failed:", err.message)
            );
        }

        return { success: true, data: issue };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("IPC Handler error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle("issue:list", async (_event, { userId }) => {
    try {
      const issues = issueService.getIssues(userId);
      return { success: true, data: issues };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("issue:update", async (_event, { issueId, updates }) => {
    try {
      const issue = await issueService.updateIssue(issueId, updates);

      // Propagate updates to external platforms if title/description/tags changed
      const hasMetadataUpdates =
        updates.title || updates.description || updates.tags;

      // Update Supabase with metadata changes
      if (hasMetadataUpdates) {
        log.info("[Update] Syncing metadata changes to database...");
        await syncService.updateSnapMetadata(issueId, issue.userId, {
          title: updates.title,
          description: updates.description,
          tags: updates.tags,
        });
      }

      if (hasMetadataUpdates && issue.syncedTo && issue.syncedTo.length > 0) {
        // Update GitHub issues
        const githubSync = issue.syncedTo.find((s) => s.platform === "github");
        if (githubSync) {
          try {
            const connector = await connectorService.getConnectorById(
              githubSync.connectorId || ""
            );
            if (connector && connector.enabled) {
              await connectorService.syncToGitHub(connector, {
                title: issue.title,
                description: issue.description,
                filePath: issue.filePath,
                cloudFileUrl: issue.cloudFileUrl,
                syncedTo: issue.syncedTo,
                tags: issue.tags,
                type: issue.type,
              });
              log.info(
                `[Update] GitHub issue #${githubSync.externalId} updated`
              );
            }
          } catch (error) {
            log.warn(
              "[Update] Failed to update GitHub issue:",
              error instanceof Error ? error.message : String(error)
            );
          }
        }

        // Update Zoho bugs
        const zohoSync = issue.syncedTo.find((s) => s.platform === "zoho");
        if (zohoSync) {
          try {
            const connector = await connectorService.getConnectorById(
              zohoSync.connectorId || ""
            );
            if (connector && connector.enabled) {
              await connectorService.updateZohoBug(
                connector,
                zohoSync.externalId,
                {
                  title: updates.title,
                  description: updates.description,
                  tags: updates.tags,
                }
              );
              log.info(`[Update] Zoho bug ${zohoSync.externalId} updated`);
            }
          } catch (error) {
            log.warn(
              "[Update] Failed to update Zoho bug:",
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      }

      // Trigger auto-sync to cloud if enabled (fire-and-forget)
      if (appSettingsStore.get("autoSync")) {
        syncService
          .syncAllToCloud(issue.userId)
          .then((result) => {
            if (result.success && mainWindow && mainWindow.webContents) {
              // Notify renderer that auto-sync completed so it can refresh
              mainWindow.webContents.send("auto-sync-completed", {
                userId: issue.userId,
                syncedCount: result.syncedCount,
              });
            }
          })
          .catch((err) =>
            log.warn("[AutoSync] Background cloud sync failed:", err.message)
          );
      }

      return { success: true, data: issue };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("issue:delete", async (_event, { issueId }) => {
    try {
      const user = sessionManager.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Get the issue to check if it's synced to any platforms
      const issue = issueService.getIssueById(issueId);
      if (!issue) {
        throw new Error("Issue not found");
      }

      // Delete from external platforms
      if (issue.syncedTo && issue.syncedTo.length > 0) {
        for (const sync of issue.syncedTo) {
          try {
            if (sync.platform === "github") {
              // Get GitHub connector
              const connector = await connectorService.getConnectorById(
                sync.connectorId || ""
              );
              if (connector && connector.enabled) {
                const issueNumber = parseInt(sync.externalId, 10);
                await connectorService.closeGitHubIssue(connector, issueNumber);
                log.info(`[Delete] Closed GitHub issue #${issueNumber}`);
              }
            } else if (sync.platform === "zoho") {
              // Get Zoho connector
              const connector = await connectorService.getConnectorById(
                sync.connectorId || ""
              );
              if (connector && connector.enabled) {
                await connectorService.deleteZohoBug(
                  connector,
                  sync.externalId
                );
                log.info(`[Delete] Deleted Zoho bug ${sync.externalId}`);
              }
            }
          } catch (platformError) {
            // Log error but continue with deletion
            log.warn(
              `[Delete] Failed to delete from ${sync.platform}:`,
              platformError instanceof Error
                ? platformError.message
                : String(platformError)
            );
          }
        }
      }

      // Delete from cloud storage and database
      await syncService.deleteFromCloud(user.id, issueId);

      // Delete locally
      await issueService.deleteIssue(issueId);

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Capture handlers - Core functions
  ipcMain.handle("capture:full-screen", async () => {
    try {
      const result = await captureService.captureScreenshot({
        mode: "fullscreen",
      });
      return {
        success: true,
        data: { buffer: Array.from(result.buffer), dataUrl: result.dataUrl },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("capture:active-window", async () => {
    try {
      const result = await captureService.captureScreenshot({ mode: "window" });
      return {
        success: true,
        data: { buffer: Array.from(result.buffer), dataUrl: result.dataUrl },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("capture:selected-region", async (_event, { bounds }) => {
    try {
      const result = await captureService.captureScreenshot({
        mode: "region",
        bounds,
      });
      return {
        success: true,
        data: { buffer: Array.from(result.buffer), dataUrl: result.dataUrl },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Legacy capture handler (kept for backward compatibility)
  ipcMain.handle(
    "capture:screenshot",
    async (_event, { mode, windowId, bounds }) => {
      try {
        // Close overlay window if it exists (for region and window capture)
        if (windowCaptureOverlay) {
          windowCaptureOverlay.close();
          windowCaptureOverlay = null;
          // Wait for the OS compositor to fully remove the overlay from screen
          // before capturing, so it doesn't appear in the screenshot
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        const result = await captureService.captureScreenshot({
          mode,
          windowId,
          bounds,
        });

        // Store screenshot data globally
        pendingScreenshot = { dataUrl: result.dataUrl, mode };
        log.info("[IPC Capture] Screenshot stored in pendingScreenshot");

        // Navigate to annotate page
        mainWindow?.show();
        if (isProd) {
          await mainWindow?.loadURL("app://./annotate");
        } else {
          const port = process.argv[2];
          await mainWindow?.loadURL(`http://localhost:${port}/annotate`);
        }

        // After page has loaded, also send the screenshot via IPC event as a
        // reliable backup in case the renderer's getPendingScreenshot fires
        // before pendingScreenshot was set (race condition safeguard)
        mainWindow?.webContents.send("screenshot-captured", {
          dataUrl: result.dataUrl,
          mode,
        });

        return { success: true, data: result };
      } catch (error) {
        log.error("[IPC Capture] Error:", error);
        // Close overlay and show main window even on error
        if (windowCaptureOverlay) {
          windowCaptureOverlay.close();
          windowCaptureOverlay = null;
        }
        mainWindow?.show();
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("IPC Handler error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle("capture:check-permission", async () => {
    try {
      // Clear cache to get fresh permission status
      captureService.clearPermissionCache();
      const hasPermission =
        await captureService.checkScreenRecordingPermission();
      return { success: true, data: hasPermission };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("capture:get-windows", async () => {
    try {
      const windows = await captureService.getAvailableWindows();
      return { success: true, data: windows };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("capture:get-displays", async () => {
    try {
      const displays = captureService.getAvailableDisplays();
      return { success: true, data: displays };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("capture:all-screens", async () => {
    try {
      const result = await captureService.captureAllScreens();
      return {
        success: true,
        data: { buffer: Array.from(result.buffer), dataUrl: result.dataUrl },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("capture:specific-screen", async (_event, { displayId }) => {
    try {
      const result = await captureService.captureSpecificScreen(displayId);
      return {
        success: true,
        data: { buffer: Array.from(result.buffer), dataUrl: result.dataUrl },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Handle window selection from overlay
  ipcMain.handle("capture:select-window", async (_event, { windowId }) => {
    try {
      log.info("[Window Capture] Selected window ID:", windowId);

      // Close the overlay
      if (windowCaptureOverlay) {
        windowCaptureOverlay.close();
        windowCaptureOverlay = null;
      }

      // Wait a bit for overlay to close
      await new Promise((resolve) => setTimeout(resolve, 100));

      log.info("[Window Capture] Capturing window screenshot...");
      // Capture the selected window
      const result = await captureService.captureScreenshot({
        mode: "window",
        windowId,
      });

      log.info(
        "[Window Capture] Screenshot captured, dataUrl length:",
        result.dataUrl?.length || 0
      );

      // Store screenshot data globally
      pendingScreenshot = { dataUrl: result.dataUrl, mode: "window" };
      log.info("[Window Capture] Stored pending screenshot");

      // Navigate to annotate page
      log.info(
        "[Window Capture] Showing main window and navigating to annotate page..."
      );
      mainWindow?.show();
      if (isProd) {
        await mainWindow?.loadURL("app://./annotate");
      } else {
        const port = process.argv[2];
        await mainWindow?.loadURL(`http://localhost:${port}/annotate`);
      }
      log.info("[Window Capture] Navigation complete");

      return { success: true, data: result };
    } catch (error) {
      log.error("[Window Capture] Error:", error);
      // Show main window even on error
      mainWindow?.show();
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Handle cancel from window capture overlay
  ipcMain.handle("capture:cancel-window-select", () => {
    if (windowCaptureOverlay) {
      windowCaptureOverlay.close();
      windowCaptureOverlay = null;
    }
    mainWindow?.show();
    return { success: true };
  });

  ipcMain.handle("capture:save", async (_event, { issueId, buffer }) => {
    try {
      const filePath = await captureService.saveScreenshot(
        issueId,
        Buffer.from(buffer)
      );
      const thumbnailPath = await captureService.createThumbnail(
        Buffer.from(buffer),
        issueId
      );
      return { success: true, data: { filePath, thumbnailPath } };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Recording handlers
  ipcMain.handle("recording:area-selected", async (_event, { bounds }) => {
    log.info("[IPC] Recording area selected:", bounds);
    try {
      await handleRecordingAreaSelected(bounds);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Recording] Area selection error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("recording:start", async (_event, { bounds }) => {
    try {
      await captureService.startRecording(bounds);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Recording] Start error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("recording:stop", async () => {
    try {
      const result = await captureService.stopRecording();

      // Close recording control window
      if (recordingControlWindow) {
        recordingControlWindow.close();
        recordingControlWindow = null;
      }

      // Show main window and navigate to home
      mainWindow?.show();
      mainWindow?.webContents.send("recording-saved", result);

      return { success: true, data: result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Recording] Stop error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("recording:cancel", async () => {
    log.info("[IPC] Recording cancel requested");
    try {
      await handleCancelRecording();
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Recording] Cancel error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("capture:get-pending", async () => {
    log.info("[IPC] Getting pending screenshot, exists:", !!pendingScreenshot);
    if (pendingScreenshot) {
      const data = pendingScreenshot;
      pendingScreenshot = null; // Clear after retrieval
      log.info(
        "[IPC] Returning pending screenshot, length:",
        data.dataUrl?.length || 0
      );
      return { success: true, data };
    }
    return { success: false, error: "No pending screenshot" };
  });

  ipcMain.handle("recording:get-pending", async () => {
    log.info("[IPC] Getting pending recording, exists:", !!pendingRecording);
    if (pendingRecording) {
      const data = pendingRecording;
      pendingRecording = null; // Clear after retrieval
      log.info("[IPC] Returning pending recording");
      return { success: true, data };
    }
    return { success: false, error: "No pending recording" };
  });

  // Connector handlers
  ipcMain.handle("connector:list", async (_event, { workspaceId }) => {
    try {
      const user = sessionManager.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      const connectors = await connectorService.getConnectors(workspaceId);
      return { success: true, data: connectors };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    "connector:add",
    async (_event, { workspaceId, ...connector }) => {
      try {
        const user = sessionManager.getUser();
        if (!user) {
          throw new Error("User not authenticated");
        }
        let newConnector = await connectorService.addConnector(
          user.id,
          workspaceId,
          connector
        );

        // If this is a GitHub connector and we have pending tokens, update the connector
        if (connector.type === "github") {
          log.info("[Connector:Add] GitHub connector created");
          log.info(
            "[Connector:Add] Incoming connector token:",
            connector.config?.accessToken ? "present" : "empty"
          );
          log.info(
            "[Connector:Add] Pending GitHub tokens exist:",
            !!pendingGitHubTokens
          );

          if (pendingGitHubTokens) {
            log.info("[Connector:Add] Updating connector with pending tokens");
            newConnector = await connectorService.updateConnector(
              newConnector.id,
              {
                config: {
                  ...newConnector.config,
                  accessToken: pendingGitHubTokens.accessToken,
                },
              }
            );
            // Clear pending tokens
            pendingGitHubTokens = null;
            log.info(
              "[Connector:Add] Connector updated and pending tokens cleared"
            );
          } else {
            log.warn(
              "[Connector:Add] No pending tokens, connector has token from renderer:",
              !!connector.config?.accessToken
            );
          }
        }

        // If this is a Zoho connector and we have pending tokens, update the connector
        if (connector.type === "zoho") {
          log.info("[Connector:Add] Zoho connector created");
          log.info(
            "[Connector:Add] Incoming connector token:",
            connector.config?.accessToken ? "present" : "empty"
          );
          log.info(
            "[Connector:Add] Pending Zoho tokens exist:",
            !!pendingZohoTokens
          );

          if (pendingZohoTokens) {
            log.info("[Connector:Add] Updating connector with pending tokens");
            newConnector = await connectorService.updateConnector(
              newConnector.id,
              {
                config: {
                  ...newConnector.config,
                  accessToken: pendingZohoTokens.accessToken,
                  refreshToken: pendingZohoTokens.refreshToken,
                  apiDomain: pendingZohoTokens.apiDomain,
                  accountsServer: pendingZohoTokens.accountsServer,
                },
              }
            );
            // Clear pending tokens
            pendingZohoTokens = null;
            log.info(
              "[Connector:Add] Connector updated and pending tokens cleared"
            );
          } else {
            log.warn(
              "[Connector:Add] No pending tokens, connector has token from renderer:",
              !!connector.config?.accessToken
            );
          }
        }

        return { success: true, data: newConnector };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("IPC Handler error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle("connector:update", async (_event, { id, updates }) => {
    try {
      const connector = await connectorService.updateConnector(id, updates);
      return { success: true, data: connector };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("connector:delete", async (_event, { id }) => {
    try {
      await connectorService.deleteConnector(id);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Sync handler - GitHub
  ipcMain.handle("sync:issue", async (_event, { issueId, connectorId }) => {
    try {
      const user = sessionManager.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      const issue = issueService.getIssueById(issueId);
      if (!issue) {
        throw new Error("Issue not found");
      }

      const connector = await connectorService.getConnectorById(connectorId);
      if (!connector || !connector.enabled) {
        throw new Error("GitHub connector not found or disabled");
      }

      await issueService.updateSyncStatus(issueId, "syncing");

      const result = await connectorService.syncToGitHub(connector, {
        title: issue.title,
        description: issue.description,
        filePath: issue.filePath,
        cloudFileUrl: issue.cloudFileUrl, // Pass the cloud URL if available
        syncedTo: issue.syncedTo, // Pass existing sync info to check for duplicates
        tags: issue.tags, // Pass tags to be mapped to GitHub labels
        type: issue.type, // Pass type to distinguish screenshots from recordings
      });

      await issueService.updateSyncStatus(issueId, "synced", {
        platform: "github",
        externalId: result.issueNumber.toString(),
        url: result.url,
        connectorId: connectorId,
      });

      return {
        success: true,
        data: {
          ...result,
          message: result.isUpdate
            ? "GitHub issue updated successfully"
            : "GitHub issue created successfully",
        },
      };
    } catch (error) {
      await issueService.updateSyncStatus(issueId, "failed");
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Sync handler - Zoho
  ipcMain.handle(
    "sync:issue-zoho",
    async (_event, { issueId, connectorId }) => {
      try {
        const user = sessionManager.getUser();
        if (!user) {
          throw new Error("User not authenticated");
        }

        const issue = await issueService.getIssueById(issueId);
        if (!issue) {
          throw new Error("Issue not found");
        }

        const connector = await connectorService.getConnectorById(connectorId);
        if (!connector || connector.type !== "zoho" || !connector.enabled) {
          throw new Error("Zoho connector not found or disabled");
        }

        await issueService.updateSyncStatus(issueId, "syncing");

        const result = await connectorService.syncToZoho(connector, {
          title: issue.title,
          description: issue.description,
          filePath: issue.filePath,
          cloudFileUrl: issue.cloudFileUrl,
          syncedTo: issue.syncedTo,
          tags: issue.tags,
          type: issue.type,
        });

        await issueService.updateSyncStatus(issueId, "synced", {
          platform: "zoho",
          externalId: result.bugId,
          url: result.url,
          connectorId,
        });

        return {
          success: true,
          data: {
            ...result,
            message: result.isUpdate
              ? "Zoho bug already exists"
              : "Zoho bug created successfully",
          },
        };
      } catch (error) {
        await issueService.updateSyncStatus(issueId, "failed");
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("IPC Handler error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Sync handler - Cloud (Supabase)
  ipcMain.handle("sync:to-cloud", async (_event, { userId }) => {
    try {
      const result = await syncService.syncAllToCloud(userId);
      return { success: result.success, data: result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("sync:from-cloud", async (_event, { userId }) => {
    try {
      const result = await syncService.fetchFromCloud(userId);
      return { success: result.success, data: result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("sync:full", async (_event, { userId }) => {
    try {
      const result = await syncService.fullSync(userId);
      return { success: result.success, data: result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("sync:get-history", async (_event, { userId }) => {
    try {
      const history = await syncService.getLatestSyncHistory(userId);
      return { success: true, data: history };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Settings handlers
  ipcMain.handle("settings:get-auto-sync", async () => {
    try {
      const autoSync = appSettingsStore.get("autoSync");
      return { success: true, data: autoSync };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle(
    "settings:set-auto-sync",
    async (_event, { enabled }: { enabled: boolean }) => {
      try {
        appSettingsStore.set("autoSync", enabled);
        log.info("[Settings] Auto-sync setting updated to:", enabled);
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("IPC Handler error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Validate GitHub connector
  ipcMain.handle(
    "connector:validate-github",
    async (_event, { accessToken, owner, repo }) => {
      try {
        const isValid = await connectorService.validateGitHubConnector(
          accessToken,
          owner,
          repo
        );
        return { success: true, data: { isValid } };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("IPC Handler error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Validate Zoho connector
  ipcMain.handle(
    "connector:validate-zoho",
    async (_event, { accessToken, portalId }) => {
      try {
        const isValid = await connectorService.validateZohoConnector(
          accessToken,
          portalId
        );
        return { success: true, data: { isValid } };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("IPC Handler error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Zoho OAuth Sign In
  ipcMain.handle("connector:zoho-signin", async () => {
    log.info("[Zoho OAuth] IPC Handler: connector:zoho-signin called");
    try {
      log.info("[Zoho OAuth] Generating authorization URL");
      const url = zohoService.getAuthUrl();
      log.info("[Zoho OAuth] ✓ Auth URL generated, length:", url.length);
      log.info("[Zoho OAuth] Opening browser to OAuth consent screen");
      await shell.openExternal(url);
      log.info("[Zoho OAuth] ✓ Browser opened successfully");
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Zoho OAuth] ✗ IPC Handler error:", error);
      log.error("[Zoho OAuth] Error message:", errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // Get Zoho Portals
  ipcMain.handle("connector:get-zoho-portals", async () => {
    try {
      if (!pendingZohoTokens) {
        return {
          success: false,
          error: "No pending Zoho authorization. Please sign in first.",
        };
      }

      // Configure Zoho service with region info before making API calls
      if (pendingZohoTokens.accountsServer || pendingZohoTokens.apiDomain) {
        const accountsServerUrl =
          pendingZohoTokens.accountsServer ||
          `https://accounts.${pendingZohoTokens.apiDomain}`;
        zohoService.setAccountsServer(
          accountsServerUrl,
          pendingZohoTokens.apiDomain
        );
      }

      const portals = await zohoService.getPortals(
        pendingZohoTokens.accessToken
      );
      return { success: true, data: portals };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Zoho Portals] IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Get Zoho Projects for a Portal
  ipcMain.handle(
    "connector:get-zoho-projects",
    async (_event, { portalId }) => {
      try {
        if (!pendingZohoTokens) {
          return {
            success: false,
            error: "No pending Zoho authorization. Please sign in first.",
          };
        }

        // Configure Zoho service with region info before making API calls
        if (pendingZohoTokens.accountsServer || pendingZohoTokens.apiDomain) {
          const accountsServerUrl =
            pendingZohoTokens.accountsServer ||
            `https://accounts.${pendingZohoTokens.apiDomain}`;
          zohoService.setAccountsServer(
            accountsServerUrl,
            pendingZohoTokens.apiDomain
          );
        }

        const projects = await zohoService.getProjects(
          pendingZohoTokens.accessToken,
          portalId
        );
        return { success: true, data: projects };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("[Zoho Projects] IPC Handler error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // GitHub OAuth Sign In
  ipcMain.handle("connector:github-signin", async () => {
    try {
      const url = githubService.getAuthUrl();
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[GitHub OAuth] IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Get GitHub Repositories
  ipcMain.handle("connector:get-github-repos", async () => {
    try {
      if (!pendingGitHubTokens) {
        return {
          success: false,
          error: "No pending GitHub authorization. Please sign in first.",
        };
      }

      const repos = await githubService.getRepositories(
        pendingGitHubTokens.accessToken
      );
      return { success: true, data: repos };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[GitHub Repositories] IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Get GitHub Current User
  ipcMain.handle("connector:get-github-user", async () => {
    try {
      if (!pendingGitHubTokens) {
        return {
          success: false,
          error: "No pending GitHub authorization. Please sign in first.",
        };
      }

      const user = await githubService.getCurrentUser(
        pendingGitHubTokens.accessToken
      );
      return { success: true, data: user };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[GitHub User] IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Get GitHub Access Token
  ipcMain.handle("connector:get-github-token", async () => {
    try {
      log.info("[GitHub Token] Request to get GitHub access token");
      log.info(
        "[GitHub Token] pendingGitHubTokens exists:",
        !!pendingGitHubTokens
      );

      if (!pendingGitHubTokens) {
        log.warn("[GitHub Token] No pending GitHub tokens available");
        return {
          success: false,
          error: "No pending GitHub authorization. Please sign in first.",
        };
      }

      log.info("[GitHub Token] Returning access token");
      return { success: true, accessToken: pendingGitHubTokens.accessToken };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[GitHub Token] IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Get Zoho Access Token
  ipcMain.handle("connector:get-zoho-token", async () => {
    try {
      log.info("[Zoho Token] Request to get Zoho access token");
      log.info("[Zoho Token] pendingZohoTokens exists:", !!pendingZohoTokens);

      if (!pendingZohoTokens) {
        log.warn("[Zoho Token] No pending Zoho tokens available");
        return {
          success: false,
          error: "No pending Zoho authorization. Please sign in first.",
        };
      }

      log.info("[Zoho Token] Returning Zoho tokens");
      return {
        success: true,
        accessToken: pendingZohoTokens.accessToken,
        refreshToken: pendingZohoTokens.refreshToken,
        apiDomain: pendingZohoTokens.apiDomain,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Zoho Token] IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Note: Database configuration handlers removed - Supabase config is now via environment variables

  // File access handler
  ipcMain.handle("file:read-image", async (_event, { filePath }) => {
    try {
      log.info("[File] Reading image:", filePath);

      // Validate file path
      if (!filePath || typeof filePath !== "string") {
        log.error("[File] Invalid file path provided:", filePath);
        return { success: false, error: `Invalid file path: ${filePath}` };
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        log.warn("[File] File not found:", filePath);
        return { success: false, error: `File not found: ${filePath}` };
      }

      // Read and convert file
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString("base64");
      const ext = path.extname(filePath).toLowerCase();
      const mimeType =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".webm"
              ? "video/webm"
              : ext === ".mp4"
                ? "video/mp4"
                : "image/png";
      const dataUrl = `data:${mimeType};base64,${base64}`;

      log.info("[File] Successfully read image, size:", buffer.length, "bytes");
      return { success: true, data: dataUrl };
    } catch (error) {
      log.error("[File] Error reading image:", filePath, error);
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      return {
        success: false,
        error: `Failed to read file ${filePath}: ${errorMessage}`,
      };
    }
  });

  // App control handlers
  ipcMain.handle("app:quit", () => {
    isQuitting = true;
    if (mainWindow && mainWindow.setQuitting) {
      mainWindow.setQuitting(true);
    }
    app.quit();
  });

  ipcMain.handle("app:show-window", async () => {
    await showMainWindow();
  });

  ipcMain.handle("app:hide-window", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  // Utility handler - Open external URL in default browser
  ipcMain.handle("util:open-external", async (_event, { url }) => {
    try {
      if (!url) {
        throw new Error("URL is required");
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      log.error("[Util] Failed to open external URL:", url, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open URL",
      };
    }
  });

  // Window control handlers
  ipcMain.handle("window:close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      isQuitting = true;
      if (mainWindow.setQuitting) {
        mainWindow.setQuitting(true);
      }
      mainWindow.close();
    }
  });

  ipcMain.handle("window:minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle("window:maximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle("window:is-maximized", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isMaximized();
    }
    return false;
  });

  // Update handlers
  ipcMain.handle("update:check", async () => {
    try {
      const result = await updaterService.checkForUpdates();
      const info = updaterService.getUpdateInfo();
      return {
        success: true,
        data: {
          updateAvailable: !!result?.updateInfo?.version,
          version: result?.updateInfo?.version,
          currentVersion: info.currentVersion,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });

  ipcMain.handle("update:check-manual", async () => {
    try {
      const result = await updaterService.checkForUpdates();
      const info = updaterService.getUpdateInfo();
      return {
        success: true,
        data: {
          updateAvailable: !!result?.updateInfo?.version,
          version: result?.updateInfo?.version,
          currentVersion: info.currentVersion,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });

  ipcMain.handle("update:download", async () => {
    try {
      await updaterService.downloadUpdate();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });

  ipcMain.handle("update:install", async () => {
    try {
      updaterService.quitAndInstall();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });

  ipcMain.handle("update:get-info", async () => {
    try {
      const info = updaterService.getUpdateInfo();
      return { success: true, data: info };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  });

  // Debug handler to test screen capture directly
  ipcMain.handle("debug:test-capture", async () => {
    try {
      log.info("[Debug] Testing screen capture...");
      const hasPermission =
        await captureService.checkScreenRecordingPermission();
      log.info("[Debug] Permission status:", hasPermission);

      if (hasPermission) {
        log.info("[Debug] Permission granted, attempting test capture...");
        const result = await captureService.captureScreenshot({
          mode: "fullscreen",
        });
        log.info(
          "[Debug] Test capture successful! Buffer size:",
          result.buffer.length
        );
        return {
          success: true,
          data: {
            hasPermission,
            bufferSize: result.buffer.length,
            dataUrlLength: result.dataUrl.length,
          },
        };
      } else {
        log.info("[Debug] No permission detected");
        return { success: false, error: "No screen recording permission" };
      }
    } catch (error) {
      log.error("[Debug] Test capture failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });
}

// Handle quit events properly
if (app && app.on) {
  // Set isQuitting flag before quit begins (handles CMD+Q, dock quit, etc.)
  app.on("before-quit", () => {
    log.info("[App] before-quit event - setting isQuitting to true");
    isQuitting = true;
    // Also notify the main window that we're quitting
    if (mainWindow && mainWindow.setQuitting) {
      mainWindow.setQuitting(true);
    }
  });

  // Handle activate event (macOS) - show window when clicking dock icon
  app.on("activate", async () => {
    log.info("[App] activate event - showing window");
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) {
      await showMainWindow();
    }
  });
}

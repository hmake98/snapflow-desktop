import dotenv from "dotenv";
import path from "path";
import electron from "electron";
import serve from "electron-serve";
import log from "electron-log";
import { createWindow, WindowInstance } from "./helpers";
import { authService } from "./services/auth";
import { issueService } from "./services/issues";
import { captureService } from "./services/capture";
import { connectorService } from "./services/connectors";
import { updaterService } from "./services/updater";
import { syncService } from "./services/sync";
import { storageManager } from "./utils/storage";
import { sessionManager } from "./utils/session";
import { TrayIconManager } from "./utils/tray-icon-manager";
import fs from "fs";

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

// Determine if we're in production
const isProd = process.env.NODE_ENV === "production";

// Load environment variables
// In production, .env is in the app.asar or app directory
// In development, .env is in the project root
if (isProd) {
  // In production, try multiple possible locations
  const possibleEnvPaths = [
    path.join(process.resourcesPath, "..", ".env"), // app directory
    path.join(process.resourcesPath, ".env"), // resources directory
    path.join(__dirname, "..", ".env"), // app directory
  ];

  let envLoaded = false;
  for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
      log.info("[ENV] Loading .env from:", envPath);
      dotenv.config({ path: envPath });
      envLoaded = true;
      break;
    }
  }

  if (!envLoaded) {
    log.warn(
      "[ENV] No .env file found in production, using existing environment variables"
    );
  }
} else {
  // In development, load from project root
  dotenv.config();
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

// State tracking for tray actions to prevent race conditions
let isShowingWindow = false;
let isCheckingForUpdates = false;

// Tray icon manager and recording state
let trayIconManager: TrayIconManager | null = null;
let recordingState: "idle" | "selecting" | "recording" = "idle";
let recordingBounds: {
  x: number;
  y: number;
  width: number;
  height: number;
} | null = null;
let pendingRecording: { dataUrl: string; duration: number } | null = null;

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

  // Check if user is already logged in (session exists)
  const currentUser = sessionManager.getUser();
  let hasUser = false;

  try {
    hasUser = await authService.hasAnyUser();
  } catch (error) {
    log.error("Database connection error:", error);
    // Will show database setup screen
  }

  // Route logic:
  // - If session exists and is valid, go to home
  // - Otherwise, go to auth
  const route = currentUser && hasUser ? "/home" : "/auth";

  if (isProd) {
    await mainWindow.loadURL(`app://.${route}`);
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}${route}`);
    mainWindow.webContents.openDevTools();
  }

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
  // Register Cmd+Shift+5 (macOS) / Ctrl+Shift+5 (Windows/Linux) for Capture Area
  const captureAreaShortcut =
    process.platform === "darwin" ? "Command+Shift+5" : "Control+Shift+5";

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

  // Register Cmd+Shift+3 (macOS) / Ctrl+Shift+3 (Windows/Linux) for Capture Full Screen
  const captureFullScreenShortcut =
    process.platform === "darwin" ? "Command+Shift+3" : "Control+Shift+3";

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
      accelerator:
        process.platform === "darwin" ? "Command+Shift+3" : "Control+Shift+3",
      click: () => {
        handleScreenshotCapture("fullscreen");
      },
    },
    {
      label: "Capture Area",
      accelerator:
        process.platform === "darwin" ? "Command+Shift+5" : "Control+Shift+5",
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

  // Recording menu item - changes based on recording state
  let recordingMenuItem: electron.MenuItemConstructorOptions;

  if (recordingState === "recording") {
    recordingMenuItem = {
      label: "■ Stop Recording",
      click: async () => {
        await handleStopRecording();
      },
    };
  } else {
    // idle or selecting state
    recordingMenuItem = {
      label: "Record Screen",
      click: async () => {
        await handleStartRecordingFlow();
      },
    };
  }

  const contextMenu = Menu.buildFromTemplate([
    ...captureMenuItems,
    { type: "separator" },
    recordingMenuItem,
    { type: "separator" },
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
      label: "Check for Updates",
      click: async () => {
        await handleCheckForUpdates();
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

  // Check permission before attempting capture
  const hasPermission = await captureService.checkScreenRecordingPermission();
  if (!hasPermission) {
    log.info("[Window Capture] No screen recording permission");
    mainWindow?.show();
    return;
  }

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

  // Ensure dock icon stays visible on macOS
  if (process.platform === "darwin") {
    app.dock?.show();
  }

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

  // Check permission before attempting capture
  const hasPermission = await captureService.checkScreenRecordingPermission();
  if (!hasPermission) {
    log.info("[Area Capture] No screen recording permission");
    mainWindow?.show();
    return;
  }

  // Ensure dock icon stays visible on macOS
  if (process.platform === "darwin") {
    app.dock?.show();
  }

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
    // Check permission first to avoid getting stuck in a loop
    const hasPermission = await captureService.checkScreenRecordingPermission();
    if (!hasPermission) {
      log.info("[Screenshot] No screen recording permission detected");
      // Show dialog to user explaining they need to restart the app
      const result = await dialog.showMessageBox(mainWindow!, {
        type: "warning",
        title: "Screen Recording Permission Required",
        message: "SnapFlow needs Screen Recording permission",
        detail:
          "Please grant Screen Recording permission in System Settings > Privacy & Security > Screen Recording, then completely quit and restart SnapFlow.\n\nNote: Simply closing the window won't work - you must fully quit the app (Cmd+Q) and restart it.",
        buttons: ["Open System Settings", "OK"],
      });

      if (result.response === 0) {
        // Open System Settings to Screen Recording
        shell.openExternal(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        );
      }
      return;
    }

    // For window mode, create a transparent overlay for window selection
    if (mode === "window") {
      // Keep app in dock even when hiding main window
      if (process.platform === "darwin") {
        app.dock?.show();
      }

      mainWindow?.hide();

      // Wait a bit for window to hide
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Create transparent overlay window for window selection
      await createWindowCaptureOverlay();
      return;
    }

    if (mode === "region") {
      // Keep app in dock even when hiding main window
      if (process.platform === "darwin") {
        app.dock?.show();
      }

      mainWindow?.hide();

      // Wait a bit for window to hide (reduced delay for smoother UX)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create transparent overlay window for area selection
      await createAreaCaptureOverlay();
      return;
    }

    // For fullscreen, all-screens, or specific-screen, capture immediately
    log.info("[Tray] Starting", mode, "capture...");

    // Keep app in dock even when hiding main window
    if (process.platform === "darwin") {
      app.dock?.show();
    }

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

    mainWindow?.show();
    // Navigate to annotate page
    log.info("[Tray] Navigating to annotate page...");
    if (isProd) {
      await mainWindow?.loadURL("app://./annotate");
    } else {
      const port = process.argv[2];
      await mainWindow?.loadURL(`http://localhost:${port}/annotate`);
    }
    log.info("[Tray] Navigation complete");
  } catch (error) {
    log.error("[Tray] Failed to capture screenshot:", error);
  }
}

// TODO: Recording feature - temporarily disabled
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleScreenRecording() {
  try {
    // Check permission first
    const hasPermission = await captureService.checkScreenRecordingPermission();
    if (!hasPermission) {
      log.info("[Recording] No screen recording permission detected");
      const result = await dialog.showMessageBox(mainWindow!, {
        type: "warning",
        title: "Screen Recording Permission Required",
        message: "SnapFlow needs Screen Recording permission",
        detail:
          "Please grant Screen Recording permission in System Settings > Privacy & Security > Screen Recording, then completely quit and restart SnapFlow.\n\nNote: Simply closing the window won't work - you must fully quit the app (Cmd+Q) and restart it.",
        buttons: ["Open System Settings", "OK"],
      });

      if (result.response === 0) {
        shell.openExternal(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        );
      }
      return;
    }

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
async function handleStartRecordingFlow() {
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

  // Check permission
  const hasPermission = await captureService.checkScreenRecordingPermission();
  if (!hasPermission) {
    log.info("[Recording] No screen recording permission");
    mainWindow?.show();
    dialog.showErrorBox(
      "Permission Required",
      "Screen recording permission is required. Please grant permission in System Settings and restart SnapFlow."
    );
    recordingState = "idle";
    return;
  }

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

  // Ensure dock icon stays visible
  if (process.platform === "darwin") {
    app.dock?.show();
  }

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

async function handleStopRecording() {
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

    // Store recording data
    pendingRecording = {
      dataUrl: result.filePath, // Path to video file
      duration: result.duration,
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

async function handleCheckForUpdates() {
  // Prevent concurrent update checks
  if (isCheckingForUpdates) {
    log.info(
      "[Tray] Update check already in progress, skipping duplicate request"
    );
    return;
  }

  isCheckingForUpdates = true;
  let checkingDialog: Promise<electron.MessageBoxReturnValue> | null = null;

  try {
    log.info("[Tray] Checking for updates...");

    // Verify main window exists
    if (!mainWindow || mainWindow.isDestroyed()) {
      log.error("[Tray] Main window not available for update check");
      // Attempt to recreate window
      await createMainWindow();

      if (!mainWindow) {
        throw new Error("Unable to create application window");
      }
    }

    // Check if in development mode
    if (process.env.NODE_ENV === "development") {
      log.info("[Tray] Skipping update check in development mode");
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Development Mode",
        message: "Update check disabled in development mode",
        detail:
          "Automatic updates are only available in production builds. Please build and install the production version to test updates.",
        buttons: ["OK"],
      });
      return;
    }

    // Show a loading dialog while checking
    checkingDialog = dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Checking for Updates",
      message: "Checking for updates...",
      detail: "Please wait while we check for the latest version.",
      buttons: [],
    });

    // Set a timeout for the update check (30 seconds)
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error("Update check timed out")), 30000);
    });

    // Check for updates with timeout
    const result = await Promise.race([
      updaterService.checkForUpdates(),
      timeoutPromise,
    ]);

    // Close the loading dialog
    await checkingDialog;

    if (result && result.updateInfo) {
      // Update is available - the updater service will handle the download and prompt
      log.info("[Tray] Update available:", result.updateInfo.version);

      // Show additional confirmation that download will start
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update Available",
        message: `Version ${result.updateInfo.version} is available`,
        detail: `Current version: ${app.getVersion()}\nNew version: ${result.updateInfo.version}\n\nThe update will be downloaded automatically in the background.`,
        buttons: ["OK"],
        defaultId: 0,
      });

      if (response === 0) {
        log.info("[Tray] User acknowledged update availability");
      }
    } else {
      // No update available - show a message to the user
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "No Updates Available",
        message: "You're running the latest version!",
        detail: `SnapFlow is up to date (version ${app.getVersion()}).`,
        buttons: ["OK"],
      });
    }
  } catch (error) {
    log.error("[Tray] Failed to check for updates:", error);

    // Close loading dialog if still open
    if (checkingDialog) {
      await checkingDialog.catch(() => {
        /* ignore */
      });
    }

    // Verify window still exists before showing error
    if (!mainWindow || mainWindow.isDestroyed()) {
      log.error("[Tray] Window destroyed, cannot show error dialog");
      return;
    }

    // Determine error type and provide specific guidance
    const errorMessage = error instanceof Error ? error.message : String(error);
    let userMessage = "Failed to check for updates";
    let detailMessage = "An unexpected error occurred. Please try again later.";

    if (
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("timed out")
    ) {
      userMessage = "Connection Error";
      detailMessage =
        "Unable to connect to the update server. Please check your internet connection and try again.";
    } else if (errorMessage.includes("EACCES")) {
      userMessage = "Permission Error";
      detailMessage =
        "The application does not have permission to check for updates. Please check file permissions.";
    } else if (errorMessage.includes("404")) {
      userMessage = "Update Server Error";
      detailMessage =
        "Update information not found. This may be a development or pre-release build.";
    } else if (errorMessage.includes("code signature")) {
      userMessage = "Signature Verification Error";
      detailMessage =
        "Unable to verify update signature. Please download updates manually from GitHub.";
    } else if (errorMessage.includes("Unable to create application window")) {
      userMessage = "Application Error";
      detailMessage =
        "Unable to open the application window. Please restart SnapFlow.";
      // Use showErrorBox as fallback when window creation fails
      dialog.showErrorBox(userMessage, detailMessage);
      return;
    }

    // Show error dialog
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: userMessage,
      message: "Update Check Failed",
      detail: detailMessage,
      buttons: ["OK"],
    });
  } finally {
    isCheckingForUpdates = false;
  }
}

// Request single instance lock
if (app && app.requestSingleInstanceLock) {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    // Another instance is already running, quit this one
    app.quit();
  } else {
    // Handle second instance attempt - focus the existing window
    app.on("second-instance", async () => {
      // Someone tried to run a second instance, we should focus our window
      await showMainWindow();
    });

    (async () => {
      await app.whenReady();

      // Set application icon for dock (macOS) and taskbar
      const iconPath = isProd
        ? path.join(process.resourcesPath, "icon.png")
        : path.join(__dirname, "../resources/icon.png");

      const appIcon = nativeImage.createFromPath(iconPath);
      if (process.platform === "darwin") {
        app.dock?.setIcon(appIcon);
        // Keep app in dock permanently - never hide
        // This prevents the dock icon from disappearing during overlay/capture
        app.dock?.show();
      }

      // Prevent app from hiding from dock when all windows are closed
      // This ensures the dock icon is always visible
      if (process.platform === "darwin") {
        // Force the app to always show in dock, even with no windows
        app.dock?.show();
      }

      // Register custom protocol for local file access
      protocol.registerFileProtocol("snapflow", (request, callback) => {
        // Remove protocol - handle both snapflow:// and snapflow:///
        let url = request.url.substring("snapflow://".length);

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

      // Initialize session from persistent storage
      await sessionManager.initialize();

      // Initialize storage
      await storageManager.ensureDirectories();

      // Set custom application menu (remove File and Help)
      if (process.platform === "darwin") {
        const template: electron.MenuItemConstructorOptions[] = [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
            ],
          },
          {
            label: "View",
            submenu: [
              { role: "reload" },
              { role: "forceReload" },
              { role: "toggleDevTools" },
              { type: "separator" },
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { type: "separator" },
              { role: "togglefullscreen" },
            ],
          },
          {
            label: "Window",
            submenu: [
              { role: "minimize" },
              { role: "zoom" },
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ],
          },
        ];
        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
      } else {
        // On Windows/Linux, remove the menu bar entirely
        Menu.setApplicationMenu(null);
      }

      // Create main window
      await createMainWindow();

      // Setup IPC handlers
      setupIPCHandlers();

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
      if (isProd && mainWindow) {
        updaterService.init();
        updaterService.setMainWindow(mainWindow);
        // Check for updates 5 seconds after app starts
        setTimeout(() => {
          updaterService.checkForUpdates();
        }, 5000);
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
  ipcMain.handle("connector:list", async () => {
    try {
      const user = sessionManager.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      const connectors = await connectorService.getConnectors(user.id);
      return { success: true, data: connectors };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("connector:add", async (_event, connector) => {
    try {
      const user = sessionManager.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      const newConnector = await connectorService.addConnector(
        user.id,
        connector
      );
      return { success: true, data: newConnector };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("connector:update", async (_event, { id, updates }) => {
    try {
      const user = sessionManager.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      const connector = await connectorService.updateConnector(
        user.id,
        id,
        updates
      );
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
      const user = sessionManager.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      await connectorService.deleteConnector(user.id, id);
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

      const connector = await connectorService.getConnectorById(
        user.id,
        connectorId
      );
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

  // Note: Database configuration handlers removed - Supabase config is now via environment variables

  // File access handler
  ipcMain.handle("file:read-image", async (_event, { filePath }) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: "File not found" };
      }

      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString("base64");
      const ext = path.extname(filePath).toLowerCase();
      const mimeType =
        ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : "image/png";
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return { success: true, data: dataUrl };
    } catch (error) {
      log.error("Error reading image:", error);
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
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
      return { success: true, data: result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("update:check-manual", async () => {
    try {
      log.info("[IPC] Manual update check requested");
      const result = await updaterService.checkForUpdates();

      if (result && result.updateInfo) {
        log.info("[IPC] Update available:", result.updateInfo.version);
        return {
          success: true,
          data: {
            updateAvailable: true,
            version: result.updateInfo.version,
            releaseDate: result.updateInfo.releaseDate,
          },
        };
      } else {
        log.info("[IPC] No update available");
        return {
          success: true,
          data: {
            updateAvailable: false,
            currentVersion: app.getVersion(),
          },
        };
      }
    } catch (error) {
      log.error("[IPC] Manual update check failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("update:download", async () => {
    try {
      await updaterService.downloadUpdate();
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("update:install", () => {
    try {
      updaterService.quitAndInstall();
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("update:get-info", () => {
    try {
      const info = updaterService.getUpdateInfo();
      return { success: true, data: info };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
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

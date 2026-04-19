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
import { recorderService } from "./services/recorder";
import { overlayService } from "./services/overlay";
import { windowPickerService } from "./services/window-picker";
import type { SourcesWithDefaultPayload } from "./services/window-picker";
import { clipboardService } from "./services/clipboard";
import { sessionManager as debugCollector } from "./services/debug-collector";
import {
  recordingSettingsService,
  captureScreenSettings,
} from "./services/settings";
import { aiService, AiService } from "./services/ai";
import { storageManager } from "./utils/storage";
import { sessionManager } from "./utils/session";
import { TrayIconManager } from "./utils/tray-icon-manager";
import { getSupabase, getSupabaseAdmin } from "./utils/supabase";
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
  Notification,
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
// Development: load from .env in project root (dotenv auto-resolves to cwd)
// Production: load from resources/.env — placed there by electron-builder extraResources
if (!isProd) {
  dotenv.config();
} else {
  // process.resourcesPath is the correct location for extraResources in packaged apps.
  // __dirname points inside app.asar and cannot be used to reach extraResources.
  const envPath = path.join(process.resourcesPath, ".env");
  if (fs.existsSync(envPath)) {
    log.info("[Startup] Loading .env from resources");
    dotenv.config({ path: envPath });
  } else {
    log.warn("[Startup] .env not found at resources path:", envPath);
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
let areaCaptureOverlays: (typeof BrowserWindow.prototype)[] = [];
let recordingControlWindow: typeof BrowserWindow.prototype | null = null;
let recordingAreaSelector: typeof BrowserWindow.prototype | null = null;
let tray: typeof Tray.prototype | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let isQuitting = false;
let pendingScreenshot: { dataUrl: string; mode: string } | null = null;
let sessionHudWindow: typeof BrowserWindow.prototype | null = null;
let sessionStatusInterval: ReturnType<typeof setInterval> | null = null;
let pendingSession: {
  id: string;
  start_time: number;
  end_time: number | null;
  events: unknown[];
  screenshots: {
    id: string;
    timestamp: number;
    file_path: string;
    trigger: string;
    windowMeta?: { appName: string; windowTitle: string; url?: string };
  }[];
  timeline: unknown[];
} | null = null;
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
  defaults: {
    autoSync: false,
    autoSyncScreenshots: false,
    autoSyncRecordings: false,
  },
}) as any;

// State tracking for tray actions to prevent race conditions
let isShowingWindow = false;

// Current renderer route — updated via "route:change" IPC from _app.tsx
let currentRoute = "";

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

// Active workspace scoped to the current session (set by renderer on login/switch)
let activeWorkspaceId: string | null = null;

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
      backgroundColor: "#030712", // matches Tailwind bg-gray-950
      titleBarStyle: "hiddenInset", // macOS: keeps native traffic lights, no title text
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
              ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' snapflow: blob:"
              : "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: http://localhost:*; media-src 'self' snapflow: blob:",
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

  // Add double-click handler for recording toggle (Windows/Linux)
  tray.on("double-click", async () => {
    log.info("[Tray] Double-click detected");
    const state = recorderService.getState();
    if (state === "recording") {
      await handleStopRecording();
    } else if (state === "idle") {
      await handleStartRecordingFlow();
    }
  });
}

function registerGlobalShortcuts() {
  // 1 — Capture Full Screen
  const fullScreenShortcut = "Control+Shift+1";
  const fullScreenRegistered = globalShortcut.register(
    fullScreenShortcut,
    async () => {
      log.info(
        `[Shortcuts] ${fullScreenShortcut} pressed - Capture Full Screen`
      );
      await handleScreenshotCapture("fullscreen");
    }
  );
  if (!fullScreenRegistered) {
    log.error(`[Shortcuts] Failed to register ${fullScreenShortcut}`);
  }

  // 2 — Capture Current App Screen (display the app window is on)
  const currentScreenShortcut = "Control+Shift+2";
  const currentScreenRegistered = globalShortcut.register(
    currentScreenShortcut,
    async () => {
      log.info(
        `[Shortcuts] ${currentScreenShortcut} pressed - Capture Current App Screen`
      );
      await handleCaptureCurrentScreen();
    }
  );
  if (!currentScreenRegistered) {
    log.error(`[Shortcuts] Failed to register ${currentScreenShortcut}`);
  }

  // 3 — Capture Screen Area (region selection overlay)
  const areaShortcut = "Control+Shift+3";
  const areaRegistered = globalShortcut.register(areaShortcut, async () => {
    log.info(`[Shortcuts] ${areaShortcut} pressed - Capture Screen Area`);
    await handleScreenshotCapture("region");
  });
  if (!areaRegistered) {
    log.error(`[Shortcuts] Failed to register ${areaShortcut}`);
  }

  // 4 — Capture Session toggle (start / stop) — F9
  const sessionShortcut = "F9";
  const sessionRegistered = globalShortcut.register(sessionShortcut, () => {
    log.info(`[Shortcuts] ${sessionShortcut} pressed - Capture Session toggle`);
    handleCaptureSessionToggle();
  });
  if (!sessionRegistered) {
    log.error(`[Shortcuts] Failed to register ${sessionShortcut}`);
  }

  // 5 — In-session screenshot — Ctrl+Shift+S
  const sessionSnapShortcut = "Control+Shift+S";
  const sessionSnapRegistered = globalShortcut.register(
    sessionSnapShortcut,
    async () => {
      log.info(
        `[Shortcuts] ${sessionSnapShortcut} pressed - Session screenshot`
      );
      const activeSession = debugCollector.getActiveSession();
      if (!activeSession) return; // only active during a session
      try {
        const shot = await debugCollector.captureScreenshot();
        log.info("[Session] In-session screenshot captured:", shot.id);
        // Pulse the HUD screenshot count (status interval will update within 1s)
      } catch (err) {
        log.error("[Session] In-session screenshot failed:", err);
      }
    }
  );
  if (!sessionSnapRegistered) {
    log.error(`[Shortcuts] Failed to register ${sessionSnapShortcut}`);
  }

  log.info(
    "[Shortcuts] Registered — Full Screen:",
    globalShortcut.isRegistered(fullScreenShortcut),
    "Current Screen:",
    globalShortcut.isRegistered(currentScreenShortcut),
    "Area:",
    globalShortcut.isRegistered(areaShortcut),
    "Session:",
    globalShortcut.isRegistered(sessionShortcut),
    "Session Snap:",
    globalShortcut.isRegistered(sessionSnapShortcut)
  );
}

function updateTrayMenu() {
  if (!tray) return;

  // Disable capture actions when user is on auth or onboarding screens
  const isRestrictedRoute =
    currentRoute === "/auth" ||
    currentRoute === "/onboarding" ||
    currentRoute === "";

  // Get available displays
  const displays = captureService.getAvailableDisplays();
  const hasMultipleDisplays = displays.length > 1;

  // Determine whether a debug session is active for the session menu label
  const isSessionActive = !!debugCollector.getActiveSession();

  // Build capture menu items (disabled on restricted routes)
  const captureMenuItems: electron.MenuItemConstructorOptions[] = [
    {
      label: "Capture Full Screen",
      accelerator: "Control+Shift+1",
      enabled: !isRestrictedRoute,
      click: () => {
        handleScreenshotCapture("fullscreen");
      },
    },
    {
      label: "Capture Current App Screen",
      accelerator: "Control+Shift+2",
      enabled: !isRestrictedRoute,
      click: () => {
        handleCaptureCurrentScreen();
      },
    },
    {
      label: "Capture Screen Area",
      accelerator: "Control+Shift+3",
      enabled: !isRestrictedRoute,
      click: () => {
        handleScreenshotCapture("region");
      },
    },
    { type: "separator" },
    {
      label: isSessionActive
        ? "■ Stop Capture Session"
        : "● Start Capture Session",
      accelerator: "F9",
      enabled: !isRestrictedRoute,
      click: () => {
        handleCaptureSessionToggle();
      },
    },
  ];

  // Recording menu items — commented out
  // const isRecording = recorderService.getState() === "recording";
  // const recordingMenuItem: electron.MenuItemConstructorOptions = isRecording
  //   ? {
  //       label: "■ Stop Recording",
  //       accelerator: "Control+Shift+R",
  //       click: async () => { await handleStopRecording(); },
  //     }
  //   : {
  //       label: "● Record Screen (Ctrl+Shift+R)",
  //       accelerator: "Control+Shift+R",
  //       click: async () => { await handleStartRecordingFlow(); },
  //     };

  const menuItems: electron.MenuItemConstructorOptions[] = [];

  // Add capture menu items
  menuItems.push(...captureMenuItems);

  // Recording items — commented out
  // menuItems.push({ type: "separator" });
  // menuItems.push(recordingMenuItem);
  // if (!isRecording) {
  //   menuItems.push({
  //     label: "Start Recording with Selection",
  //     click: async () => { await handleStartRecordingFlowWithSelection(); },
  //   });
  // }

  const contextMenu = Menu.buildFromTemplate([
    ...menuItems,
    { type: "separator" },
    {
      label: "View My Snaps",
      enabled: !isRestrictedRoute,
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
  // setVisibleOnAllWorkspaces can hide the dock icon on macOS — restore it immediately
  if (process.platform === "darwin") app.dock?.show();

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

  // Handle window close — restore dock icon hidden by setVisibleOnAllWorkspaces
  windowCaptureOverlay.on("closed", () => {
    windowCaptureOverlay = null;
    if (process.platform === "darwin") app.dock?.show();
  });
}

function closeAreaCaptureOverlays() {
  for (const overlay of areaCaptureOverlays) {
    if (!overlay.isDestroyed()) overlay.close();
  }
  areaCaptureOverlays = [];
  if (process.platform === "darwin") app.dock?.show();
}

async function createSessionHudWindow() {
  if (sessionHudWindow && !sessionHudWindow.isDestroyed()) return;

  const { screen: electronScreen } = electron;
  const primaryDisplay = electronScreen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const { x: dx, y: dy } = primaryDisplay.workArea;

  const hudWidth = 380;
  const hudHeight = 84;
  const margin = 20;

  sessionHudWindow = new BrowserWindow({
    width: hudWidth,
    height: hudHeight,
    x: dx + width - hudWidth - margin,
    y: dy + height - hudHeight - margin,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  sessionHudWindow.setAlwaysOnTop(true, "floating", 3);
  sessionHudWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
  if (process.platform === "darwin") app.dock?.show();

  // Prevent HUD from appearing in screenshots/screen recordings
  sessionHudWindow.setContentProtection(true);

  if (isProd) {
    await sessionHudWindow.loadURL("app://./session-hud");
  } else {
    const port = process.argv[2];
    await sessionHudWindow.loadURL(`http://localhost:${port}/session-hud`);
  }

  sessionHudWindow.once("ready-to-show", () => {
    sessionHudWindow?.show();
  });

  sessionHudWindow.on("closed", () => {
    sessionHudWindow = null;
    if (sessionStatusInterval) {
      clearInterval(sessionStatusInterval);
      sessionStatusInterval = null;
    }
  });

  // Push live status to HUD every second
  sessionStatusInterval = setInterval(() => {
    const active = debugCollector.getActiveSession();
    if (!active || !sessionHudWindow || sessionHudWindow.isDestroyed()) return;
    const elapsed = Date.now() - active.start_time;
    sessionHudWindow.webContents.send("session:status", {
      elapsed,
      screenshots: active.screenshots.length,
      events: active.events.length,
    });
  }, 1000);
}

function closeSessionHudWindow() {
  if (sessionStatusInterval) {
    clearInterval(sessionStatusInterval);
    sessionStatusInterval = null;
  }
  if (sessionHudWindow && !sessionHudWindow.isDestroyed()) {
    sessionHudWindow.close();
    sessionHudWindow = null;
  }
}

async function createAreaCaptureOverlay() {
  const { screen } = electron;
  const displays = screen.getAllDisplays();

  // Create one overlay per display — a single spanning window is unreliable
  // on macOS because Electron constrains BrowserWindows to one screen.
  for (const display of displays) {
    const { x, y, width, height } = display.bounds;
    const scaleFactor = display.scaleFactor || 1;

    const overlay = new BrowserWindow({
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

    overlay.setAlwaysOnTop(true, "screen-saver", 1);
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    if (isProd) {
      await overlay.loadURL("app://./area-capture");
    } else {
      const port = process.argv[2];
      await overlay.loadURL(`http://localhost:${port}/area-capture`);
    }

    overlay.webContents.once("did-finish-load", () => {
      overlay.webContents.send("area-capture-ready", {
        displayId: display.id,
        scaleFactor,
        // origin of this overlay in screen coordinates
        originOffset: { x, y },
      });
    });

    overlay.on("closed", () => {
      areaCaptureOverlays = areaCaptureOverlays.filter((w) => w !== overlay);
      if (process.platform === "darwin") app.dock?.show();
    });

    areaCaptureOverlays.push(overlay);
  }

  if (process.platform === "darwin") app.dock?.show();
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

    // For fullscreen, auto-upgrade to all-screens when multiple displays are connected
    let resolvedMode = mode as
      | "fullscreen"
      | "window"
      | "region"
      | "all-screens"
      | "specific-screen";

    if (mode === "fullscreen" && screen.getAllDisplays().length > 1) {
      resolvedMode = "all-screens";
      log.info(
        "[Tray] Multiple displays detected — upgrading fullscreen to all-screens"
      );
    }

    log.info("[Tray] Starting", resolvedMode, "capture...");

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
    } = { mode: resolvedMode };

    if (resolvedMode === "specific-screen" && screenId) {
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

    // Navigate to annotate page using client-side navigation (preserves app state)
    log.info("[Tray] Navigating to annotate page...");
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("navigate", "/annotate");
      log.info("[Tray] Navigation complete");
    }

    // Then show and focus the window
    mainWindow?.show();
    mainWindow?.focus();
    log.info("[Tray] Window shown and focused");
  } catch (error) {
    log.error("[Tray] Failed to capture screenshot:", error);
  }
}

/**
 * Capture the display that currently contains the mouse cursor.
 * Falls back to fullscreen if the display cannot be identified.
 */
async function handleCurrentAppScreenCapture(displayId: number) {
  mainWindow?.hide();
  await new Promise((resolve) => setTimeout(resolve, 300));

  const { dataUrl } = await captureService.captureSpecificScreen(
    displayId,
    true
  );
  pendingScreenshot = { dataUrl, mode: "specific-screen" };

  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("navigate", "/annotate");
  }
  mainWindow?.show();
  mainWindow?.focus();
}

async function handleCaptureCurrentScreen() {
  try {
    const allDisplays = screen.getAllDisplays();

    // 1. User-saved preference
    const savedId = captureScreenSettings.getDefaultScreenId();
    if (savedId !== null) {
      const saved = allDisplays.find((d) => d.id === savedId);
      if (saved) {
        log.info("[Tray] Capturing user-selected default screen:", savedId);
        await handleCurrentAppScreenCapture(saved.id);
        return;
      }
      // Saved display no longer connected — clear stale preference
      log.warn("[Tray] Saved default screen not found, clearing preference");
      captureScreenSettings.clearDefaultScreenId();
    }

    // 2. Fallback — display where the cursor currently is
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    log.info("[Tray] No default screen set, using cursor screen:", display.id);
    await handleCurrentAppScreenCapture(display.id);
  } catch (error) {
    log.error("[Tray] Failed to capture current app screen:", error);
    await handleScreenshotCapture("fullscreen");
  }
}

/**
 * Toggle the debug collector session on/off.
 * When a session starts, background event tracking begins and the tray
 * label reflects the active state.  Pressing the shortcut again stops
 * the session and saves the timeline.
 */
function handleCaptureSessionToggle() {
  const active = debugCollector.getActiveSession();
  if (active) {
    try {
      // Build timeline BEFORE stopping (requires active session)
      let timeline: unknown[] = [];
      try {
        timeline = debugCollector.getSessionTimeline();
      } catch {
        // ignore — timeline is best-effort
      }

      const session = debugCollector.stopSession();
      log.info(
        "[Session] Capture session stopped. Events:",
        session.events.length,
        "Screenshots:",
        session.screenshots.length
      );

      closeSessionHudWindow();

      pendingSession = {
        id: session.id,
        start_time: session.start_time,
        end_time: session.end_time,
        events: session.events,
        screenshots: session.screenshots,
        timeline,
      };

      // Navigate to session review page
      mainWindow?.show();
      mainWindow?.focus();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("navigate", "/annotate-session");
        mainWindow.webContents.send("collector:session-stopped", session);
      }
    } catch (err) {
      log.error("[Session] Failed to stop capture session:", err);
      closeSessionHudWindow();
    }
  } else {
    try {
      debugCollector.startSession();
      log.info("[Session] Capture session started");
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("collector:session-started");
      }
      // Create floating HUD
      createSessionHudWindow().catch((err) => {
        log.error("[Session] Failed to create HUD window:", err);
      });
    } catch (err) {
      log.error("[Session] Failed to start capture session:", err);
    }
  }
  updateTrayMenu();
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

// Guard flag to prevent concurrent recording flow starts
let isStartingRecordingFlow = false;

// Recording workflow functions
async function handleStartRecordingFlow() {
  if (isStartingRecordingFlow || recorderService.getState() !== "idle") {
    log.warn(
      "[Recording] Recording flow already in progress, ignoring duplicate trigger"
    );
    return;
  }
  isStartingRecordingFlow = true;
  try {
    log.info("[Recording] Starting recording flow");

    const savedDefault = recordingSettingsService.getDefaultSource();

    if (savedDefault) {
      // Validate that the saved default source is still active
      const payload =
        await windowPickerService.getSourcesWithDefault(savedDefault);

      if (payload.validatedDefault) {
        // Default is live — start immediately without showing picker
        log.info(
          "[Recording] Default source valid, starting immediately:",
          payload.validatedDefault.name
        );
        await handleStartRecordingWithSource(
          payload.validatedDefault.id,
          payload.validatedDefault.displayBounds ?? null
        );
        return;
      } else {
        // Default is gone — clear it and show picker with notification
        log.warn(
          "[Recording] Default source no longer active, clearing:",
          savedDefault.name
        );
        recordingSettingsService.clearDefaultSource();
        await handleStartRecordingWithSelection(payload);
      }
    } else {
      // No default saved — fetch sources and show picker
      log.info("[Recording] No default source, showing picker");
      const payload = await windowPickerService.getSourcesWithDefault(null);
      await handleStartRecordingWithSelection(payload);
    }
  } catch (error) {
    log.error("[Recording] Failed to start recording:", error);
    dialog.showErrorBox("Recording Error", "Failed to start recording");
    recorderService.setState("idle");
    updateTrayMenu();
  } finally {
    isStartingRecordingFlow = false;
  }
}

/**
 * Fetch sources and show the picker — used when tray menu explicitly requests selection
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleStartRecordingFlowWithSelection() {
  if (isStartingRecordingFlow || recorderService.getState() !== "idle") {
    log.warn("[Recording] Recording flow already in progress, ignoring");
    return;
  }
  isStartingRecordingFlow = true;
  try {
    const savedDefault = recordingSettingsService.getDefaultSource();
    const payload = await windowPickerService.getSourcesWithDefault(
      savedDefault ?? null
    );
    await handleStartRecordingWithSelection(payload);
  } catch (error) {
    log.error("[Recording] Failed to show selection picker:", error);
    recorderService.setState("idle");
    recordingState = "idle";
    updateTrayMenu();
  } finally {
    isStartingRecordingFlow = false;
  }
}

/**
 * Show the picker modal in the main window with pre-fetched payload.
 * Navigates to /home first to ensure the modal component is mounted.
 */
async function handleStartRecordingWithSelection(
  payload: SourcesWithDefaultPayload
) {
  try {
    log.info("[Recording] Starting recording with selection");
    recorderService.setState("selecting");
    updateTrayMenu();

    // Keep app in dock
    if (process.platform === "darwin") {
      app.dock?.show();
    }

    // Show main window — picker modal is mounted globally in _app.tsx
    mainWindow?.show();
    mainWindow?.focus();

    // Send picker payload to renderer
    try {
      await windowPickerService.showPickerInMainWindow(mainWindow, payload);
    } catch (error) {
      log.error("[Recording] Failed to show picker:", error);
      recorderService.setState("idle");
      recordingState = "idle";
      updateTrayMenu();
      dialog.showErrorBox(
        "Recording Error",
        "Failed to show recording source picker. Please try again."
      );
    }
  } catch (error) {
    log.error("[Recording] Failed to start recording with selection:", error);
    recorderService.setState("idle");
    recordingState = "idle";
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
      recorderService.setState("idle");
      trayIconManager?.setState("normal");
      updateTrayMenu();
    }
    recordingAreaSelector = null;
  });
}

/**
 * Start recording with a specific source (from window picker or default)
 */
async function handleStartRecordingWithSource(
  sourceId: string,
  bounds: { x: number; y: number; width: number; height: number } | null
) {
  try {
    log.info(
      "[Recording] Starting recording with source:",
      sourceId,
      "bounds:",
      bounds
    );

    recorderService.setState("recording");
    recordingState = "recording";
    recordingBounds = bounds;
    trayIconManager?.setState("recording");
    updateTrayMenu();

    // Get primary display bounds as fallback if no bounds provided
    const primaryDisplay = screen.getPrimaryDisplay();
    const recordingBounds_ = bounds ?? primaryDisplay.bounds;

    // Start recording
    await captureService.startRecording(recordingBounds_);

    // Show overlay only for screen sources (have bounds)
    if (bounds) {
      await overlayService.show(bounds, process.argv[2]);
    }

    // Restore dock icon after overlay is shown — setVisibleOnAllWorkspaces on the
    // overlay window can cause macOS to hide the dock icon as a side effect.
    if (process.platform === "darwin") {
      app.dock?.show();
    }

    log.info("[Recording] Recording started successfully");
  } catch (error) {
    log.error("[Recording] Failed to start recording with source:", error);

    recorderService.setState("idle");
    recordingState = "idle";
    recordingBounds = null;
    trayIconManager?.setState("normal");
    updateTrayMenu();

    // Close window picker if it's open
    windowPickerService.closePicker();

    dialog.showErrorBox(
      "Recording Error",
      "Failed to start recording. Please try again."
    );
  }
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
    recorderService.setState("recording");
    recordingState = "recording";

    // Change tray icon to recording state
    trayIconManager?.setState("recording");
    updateTrayMenu();

    // Start recording
    await captureService.startRecording(recordingBounds);

    // Show red border overlay
    await overlayService.show(recordingBounds, process.argv[2]);

    // Restore dock icon after overlay — setVisibleOnAllWorkspaces can hide it
    if (process.platform === "darwin") {
      app.dock?.show();
    }

    log.info("[Recording] Recording started. Click tray icon to stop.");
  } catch (error) {
    log.error("[Recording] Failed to start recording:", error);
    overlayService.hide();
    recorderService.setState("idle");
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

    // Hide overlay
    overlayService.hide();

    // Reset state immediately
    recorderService.setState("idle");
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

    // Hide overlay on error
    overlayService.hide();

    // Reset state on error
    recorderService.setState("idle");
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
  recorderService.setState("idle");
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

    // Determine where to navigate.
    // Priority order:
    //   1. Pending invite in pending_invites table (not yet accepted, not yet a member) → /join-workspace
    //      This must come FIRST — even tenant owners can be invited to another org's workspace.
    //      Multiple pending invites are processed one at a time in creation order.
    //   2. Already owns a tenant or is already a workspace member → /home
    //   3. Brand-new user with no affiliation → /onboarding
    const session = await authService.getSession();
    let navigateTo = "/onboarding";
    try {
      const currentUserId = sessionManager.getUserId();
      const userEmail = session?.user?.email;
      if (currentUserId) {
        const supabase = getSupabase();

        // ── Priority 1: Pending workspace invite (from pending_invites table) ─
        // Query all unaccepted invites ordered by creation time so we process
        // them one at a time. Metadata-based invites (legacy / OTP fallback)
        // are also still written into this table via inviteByEmail.
        let foundPendingInvite = false;
        if (userEmail && supabase) {
          const { data: pendingInvites } = await supabase
            .from("pending_invites")
            .select("workspace_id, role")
            .eq("email", userEmail)
            .is("accepted_at", null)
            .order("created_at", { ascending: true });

          if (pendingInvites && pendingInvites.length > 0) {
            // Find the first invite the user hasn't joined yet
            for (const invite of pendingInvites) {
              const { data: existingMember } = await supabase
                .from("workspace_members")
                .select("id")
                .eq("user_id", currentUserId)
                .eq("workspace_id", invite.workspace_id)
                .maybeSingle();

              if (!existingMember) {
                log.info(
                  "[OAuth] Pending invite found, navigating to /join-workspace:",
                  invite.workspace_id
                );
                navigateTo = `/join-workspace?workspaceId=${invite.workspace_id}&role=${invite.role}`;
                foundPendingInvite = true;
                break;
              }
            }
            if (!foundPendingInvite) {
              // All pending invites already accepted
              log.info(
                "[OAuth] All pending invites already accepted, navigating to /home"
              );
              navigateTo = "/home";
              foundPendingInvite = true; // skip further checks
            }
          }
        }

        if (!foundPendingInvite) {
          // ── Priority 2: Existing tenant owner ───────────────────────────────
          const existingTenant =
            await tenantService.getTenantByOwner(currentUserId);
          if (existingTenant) {
            log.info("[OAuth] User owns a tenant, navigating to /home");
            navigateTo = "/home";
          } else if (supabase) {
            // ── Priority 3: Existing workspace member (invited user, no owned tenant) ──
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
            // else: new user, stays at /onboarding
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

  // Route tracking — renderer notifies main of current page so tray can update
  ipcMain.on("route:change", (_event, route: string) => {
    currentRoute = route;
    updateTrayMenu();
  });

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
      activeWorkspaceId = null;
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

  // Active workspace tracking (persisted in main process for full-page-reload scenarios)
  ipcMain.handle("workspace:set-active", (_event, { workspaceId }) => {
    activeWorkspaceId = workspaceId ?? null;
    log.info("[Workspace] Active workspace set:", activeWorkspaceId);
    return { success: true };
  });

  ipcMain.handle("workspace:get-active", () => {
    return { success: true, data: activeWorkspaceId };
  });

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

      // Mark this invite as accepted in pending_invites
      const userEmail = (await authService.getSession())?.user?.email;
      if (userEmail) {
        const adminClient = getSupabaseAdmin();
        const updateClient = adminClient ?? supabase;
        await updateClient
          .from("pending_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("email", userEmail)
          .eq("workspace_id", workspaceId);
        log.info(
          `[workspace:join] Marked pending_invite accepted for ${userEmail} / ${workspaceId}`
        );
      }

      // Determine whether this user already has completed onboarding.
      // If they own a tenant or previously completed onboarding they should go
      // straight to /home — not through the member-mode onboarding flow.
      const existingTenant = await tenantService.getTenantByOwner(userId);
      let progress = await onboardingService.getProgress(userId);
      const alreadyOnboarded =
        !!existingTenant || progress?.isComplete === true;

      if (!alreadyOnboarded) {
        // First-time user: initialize progress and send to connector step
        if (!progress) {
          await onboardingService.initializeProgress(userId);
        }
        await onboardingService.setStep(userId, 4);
      }

      // Check whether there are more unaccepted invites for this user so the
      // renderer can navigate directly to the next join-workspace page.
      let nextPendingInvite: { workspaceId: string; role: string } | null =
        null;
      if (userEmail) {
        const { data: remaining } = await supabase
          .from("pending_invites")
          .select("workspace_id, role")
          .eq("email", userEmail)
          .is("accepted_at", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (remaining) {
          // Verify not already a member (invite could be stale)
          const { data: alreadyMember } = await supabase
            .from("workspace_members")
            .select("id")
            .eq("user_id", userId)
            .eq("workspace_id", remaining.workspace_id)
            .maybeSingle();
          if (!alreadyMember) {
            nextPendingInvite = {
              workspaceId: remaining.workspace_id,
              role: remaining.role,
            };
          }
        }
      }

      log.info(
        `[workspace:join] User ${userId} joined workspace ${workspaceId}, alreadyOnboarded=${alreadyOnboarded}, nextPendingInvite=${nextPendingInvite?.workspaceId ?? "none"}`
      );
      return { success: true, alreadyOnboarded, nextPendingInvite };
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
      { userId, title, type, filePath, description, thumbnailPath, workspaceId }
    ) => {
      try {
        const issue = await issueService.createIssue(
          userId,
          title,
          type,
          filePath,
          description,
          thumbnailPath,
          workspaceId
        );

        // Trigger auto-sync to cloud (fire-and-forget)
        // Pass workspaceId directly to avoid async DB lookup and potential mismatch
        syncService
          .syncAllToCloud(userId, workspaceId)
          .then((result) => {
            log.info("[AutoSync] Sync completed. Result:", {
              success: result.success,
              syncedCount: result.syncedCount,
              failedCount: result.failedCount,
            });
            // Always notify renderer so the UI reflects the updated syncStatus,
            // even on partial failures (some items may have synced successfully).
            if (mainWindow && mainWindow.webContents) {
              log.info(
                "[AutoSync] Sending auto-sync-completed event to renderer"
              );
              mainWindow.webContents.send("auto-sync-completed", {
                userId,
                syncedCount: result.syncedCount,
              });
            }
            if (!result.success) {
              log.warn("[AutoSync] Sync had errors:", result.errors);
            }
          })
          .catch((err) =>
            log.warn("[AutoSync] Background cloud sync failed:", err.message)
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

  ipcMain.handle("issue:list", async (_event, { userId, workspaceId }) => {
    try {
      const issues = issueService.getIssues(userId, workspaceId);
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
                sessionData: (issue as any).sessionData,
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

      // Trigger auto-sync to cloud (fire-and-forget)
      syncService
        .syncAllToCloud(issue.userId, issue.workspaceId)
        .then((result) => {
          // Always notify renderer so the UI reflects updated syncStatus.
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send("auto-sync-completed", {
              userId: issue.userId,
              syncedCount: result.syncedCount,
            });
          }
          if (!result.success) {
            log.warn("[AutoSync] Sync had errors:", result.errors);
          }
        })
        .catch((err) =>
          log.warn("[AutoSync] Background cloud sync failed:", err.message)
        );

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
    async (_event, { mode, windowId, bounds, originOffset }) => {
      try {
        // Close overlay windows before capturing so they don't appear in the screenshot
        let hadOverlay = false;
        if (windowCaptureOverlay) {
          windowCaptureOverlay.close();
          windowCaptureOverlay = null;
          if (process.platform === "darwin") app.dock?.show();
          hadOverlay = true;
        }
        if (areaCaptureOverlays.length > 0) {
          closeAreaCaptureOverlays();
          hadOverlay = true;
        }
        // Wait for the OS compositor to fully remove overlays from screen
        if (hadOverlay) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        const result = await captureService.captureScreenshot({
          mode,
          windowId,
          bounds,
          originOffset,
        });

        // Store screenshot data globally
        pendingScreenshot = { dataUrl: result.dataUrl, mode };
        log.info("[IPC Capture] Screenshot stored in pendingScreenshot");

        // Navigate to annotate page using client-side navigation (preserves app state)
        mainWindow?.show();
        mainWindow?.focus();
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send("navigate", "/annotate");
        }

        // Also send the screenshot via IPC event as a
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
          if (process.platform === "darwin") app.dock?.show();
        }
        if (areaCaptureOverlays.length > 0) {
          closeAreaCaptureOverlays();
        }
        mainWindow?.show();
        mainWindow?.focus();
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

  // Default capture screen preference
  ipcMain.handle("capture:get-default-screen", () => {
    try {
      const id = captureScreenSettings.getDefaultScreenId();
      return { success: true, data: id };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(
    "capture:set-default-screen",
    (_event, { displayId }: { displayId: number }) => {
      try {
        captureScreenSettings.setDefaultScreenId(displayId);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle("capture:clear-default-screen", () => {
    try {
      captureScreenSettings.clearDefaultScreenId();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
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
        if (process.platform === "darwin") app.dock?.show();
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

      // Navigate to annotate page using client-side navigation (preserves app state)
      log.info(
        "[Window Capture] Showing main window and navigating to annotate page..."
      );
      mainWindow?.show();
      mainWindow?.focus();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("navigate", "/annotate");
      }
      log.info("[Window Capture] Navigation complete");

      return { success: true, data: result };
    } catch (error) {
      log.error("[Window Capture] Error:", error);
      // Show main window even on error
      mainWindow?.show();
      mainWindow?.focus();
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
      if (process.platform === "darwin") app.dock?.show();
    }
    mainWindow?.show();
    mainWindow?.focus();
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

  // Get available recording sources (screens + windows)
  ipcMain.handle("recording:get-sources", async () => {
    log.info("[IPC] Getting recording sources");
    try {
      const sources = await windowPickerService.getSources();
      return { success: true, data: sources };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Recording] Get sources error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Start recording with selected source
  ipcMain.handle(
    "recording:start-with-source",
    async (_event, { sourceId, sourceName, displayBounds, setAsDefault }) => {
      log.info("[IPC] Starting recording with source:", sourceId);
      try {
        windowPickerService.closePicker();

        // Handle "Full Screen" special case
        let actualSourceId = sourceId;
        let actualBounds = displayBounds;

        if (sourceId === "full-screen") {
          const primaryDisplay = screen.getPrimaryDisplay();
          actualSourceId = `screen:${primaryDisplay.id}:0`;
          actualBounds = primaryDisplay.bounds;
          log.info(
            "[IPC] Full screen selected, using primary display:",
            actualSourceId
          );
        }

        // Defensive check: verify the window source is still live before starting
        // Screen sources (full-screen, screen:*) are always considered live
        if (!actualSourceId.startsWith("screen")) {
          const freshSources = await windowPickerService.getSources();
          const stillLive = freshSources.find(
            (s) =>
              s.id === actualSourceId ||
              (s.type === "window" && s.name === sourceName)
          );
          if (!stillLive) {
            log.warn(
              "[Recording] Selected window is no longer active:",
              sourceName
            );
            return {
              success: false,
              error: `"${sourceName}" is no longer active. Please refresh and select another source.`,
            };
          }
          // Update actualSourceId in case it was matched by name with a new ID
          if (stillLive.id !== actualSourceId) {
            log.info(
              `[Recording] Source ID updated via name match: ${actualSourceId} → ${stillLive.id}`
            );
            actualSourceId = stillLive.id;
          }
        }

        if (setAsDefault) {
          recordingSettingsService.setDefaultSource({
            id: sourceId === "full-screen" ? "full-screen" : actualSourceId,
            name: sourceName,
            type: actualSourceId.startsWith("screen") ? "screen" : "window",
            displayBounds: actualBounds,
          });
        }
        await handleStartRecordingWithSource(
          actualSourceId,
          actualBounds ?? null
        );
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("[Recording] Start with source error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Get default recording source
  ipcMain.handle("recording:get-default-source", async () => {
    log.info("[IPC] Getting default recording source");
    try {
      const source = recordingSettingsService.getDefaultSource();
      return { success: true, data: source };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Recording] Get default source error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Set default recording source
  ipcMain.handle("recording:set-default-source", async (_event, source) => {
    log.info("[IPC] Setting default recording source");
    try {
      recordingSettingsService.setDefaultSource(source);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Recording] Set default source error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Clear default recording source
  ipcMain.handle("recording:clear-default-source", async () => {
    log.info("[IPC] Clearing default recording source");
    try {
      recordingSettingsService.clearDefaultSource();
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Recording] Clear default source error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Get all active recording sources plus validated default in a single call
  ipcMain.handle("recording:get-sources-with-default", async () => {
    log.info("[IPC] Getting recording sources with default");
    try {
      const savedDefault = recordingSettingsService.getDefaultSource();
      const payload = await windowPickerService.getSourcesWithDefault(
        savedDefault ?? null
      );
      return { success: true, data: payload };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Recording] Get sources with default error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Copy bug report to clipboard by snap ID (snap must already be in local store)
  ipcMain.handle("clipboard:paste-bug", async (_event, { snapId }) => {
    log.info("[IPC] Copying bug report to clipboard for snap:", snapId);
    try {
      let snap = await issueService.getSnapById(snapId);
      if (!snap) {
        return { success: false, error: "Snap not found" };
      }

      // Try to sync to cloud first so we can include the cloud URL
      if (!snap.cloudFileUrl) {
        try {
          const syncResult = await syncService.syncAllToCloud(snap.userId);
          if (syncResult.success) {
            snap = (await issueService.getSnapById(snapId)) || snap;
          }
        } catch (syncErr) {
          log.warn(
            "[Clipboard] Sync failed, copying with available data:",
            syncErr
          );
        }
      }

      clipboardService.copyBugReport(snap);
      return { success: true, synced: !!snap.cloudFileUrl };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("[Clipboard] Paste bug error:", error);
      return { success: false, error: errorMessage };
    }
  });

  // Copy bug report to clipboard from raw snap data (no store lookup required)
  ipcMain.handle(
    "clipboard:copy-bug-data",
    async (
      _event,
      { title, description, cloudFileUrl, type, filePath, syncedTo }
    ) => {
      log.info("[IPC] Copying bug report from raw data to clipboard");
      try {
        clipboardService.copyBugReport({
          id: "temp",
          title,
          description,
          cloudFileUrl,
          type,
          filePath,
          syncedTo,
        });
        return { success: true, synced: !!cloudFileUrl };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        log.error("[Clipboard] Copy bug data error:", error);
        return { success: false, error: errorMessage };
      }
    }
  );

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
        cloudFileUrl: issue.cloudFileUrl,
        syncedTo: issue.syncedTo,
        tags: issue.tags,
        type: issue.type,
        sessionData: (issue as any).sessionData,
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
          sessionData: (issue as any).sessionData,
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
  ipcMain.handle("sync:to-cloud", async (_event, { userId, workspaceId }) => {
    try {
      const wsId = workspaceId ?? activeWorkspaceId ?? undefined;
      const result = await syncService.syncAllToCloud(userId, wsId);
      return { success: result.success, data: result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("sync:from-cloud", async (_event, { userId, workspaceId }) => {
    try {
      const wsId = workspaceId ?? activeWorkspaceId ?? undefined;
      const result = await syncService.fetchFromCloud(userId, wsId);
      return { success: result.success, data: result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      log.error("IPC Handler error:", error);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("sync:full", async (_event, { userId, workspaceId }) => {
    try {
      const wsId = workspaceId ?? activeWorkspaceId ?? undefined;
      const result = await syncService.fullSync(userId, wsId);
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

  ipcMain.handle(
    "app:open-external-url",
    async (_event, { url }: { url: string }) => {
      try {
        await shell.openExternal(url);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to open URL",
        };
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

  ipcMain.handle(
    "util:show-notification",
    (_event, { title, body }: { title: string; body?: string }) => {
      try {
        if (Notification.isSupported()) {
          new Notification({ title, body }).show();
        }
        return { success: true };
      } catch (error) {
        log.error("[Util] Failed to show notification:", error);
        return { success: false };
      }
    }
  );

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
  // ------------------------------------------------------------------
  // Debug Collector — Collection Layer IPC handlers
  // ------------------------------------------------------------------

  ipcMain.handle("collector:start-session", () => {
    try {
      const session = debugCollector.startSession();
      return { success: true, data: session };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("collector:stop-session", () => {
    try {
      const session = debugCollector.stopSession();
      return { success: true, data: session };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("collector:capture-snapshot", async () => {
    try {
      const result = await debugCollector.captureSnapshot();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("collector:capture-screenshot", async () => {
    try {
      const screenshot = await debugCollector.captureScreenshot();
      return { success: true, data: screenshot };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("collector:get-timeline", () => {
    try {
      const timeline = debugCollector.getSessionTimeline();
      return { success: true, data: timeline };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("collector:get-session", () => {
    try {
      const session = debugCollector.getActiveSession();
      return { success: true, data: session };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Session HUD: take screenshot during active session (called from HUD button)
  ipcMain.handle("session:take-screenshot", async () => {
    try {
      const active = debugCollector.getActiveSession();
      if (!active) return { success: false, error: "No active session" };
      const shot = await debugCollector.captureScreenshot();
      log.info("[Session] HUD-triggered screenshot:", shot.id);
      return { success: true, data: shot };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Session HUD: stop session (called from HUD stop button)
  ipcMain.handle("session:stop", () => {
    try {
      handleCaptureSessionToggle();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Session annotate page: fetch the finished session data
  ipcMain.handle("session:get-pending", () => {
    return { success: true, data: pendingSession };
  });

  // Session annotate page: save session as a snap
  ipcMain.handle(
    "session:save-snap",
    async (_event, { title, description, workspaceId }) => {
      try {
        if (!pendingSession) {
          return { success: false, error: "No pending session" };
        }

        const userResult = await authService.getSession();
        const userId = userResult?.user?.id;
        if (!userId) {
          return { success: false, error: "Not authenticated" };
        }

        const snap = await issueService.createSessionSnap(
          userId,
          title,
          {
            sessionId: pendingSession.id,
            duration:
              (pendingSession.end_time ?? Date.now()) -
              pendingSession.start_time,
            screenshotCount: pendingSession.screenshots.length,
            eventCount: pendingSession.events.length,
            screenshotPaths: pendingSession.screenshots.map(
              (s: { file_path: string }) => s.file_path
            ),
            timeline: pendingSession.timeline,
            windowContexts: pendingSession.screenshots
              .map(
                (s: {
                  windowMeta?: {
                    appName: string;
                    windowTitle: string;
                    url?: string;
                  };
                }) => s.windowMeta
              )
              .filter(
                (
                  m: unknown
                ): m is {
                  appName: string;
                  windowTitle: string;
                  url?: string;
                } => !!m
              ),
          },
          description,
          workspaceId
        );

        // Clear pending session after save
        pendingSession = null;

        return { success: true, data: snap };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // ── AI: generate session description from screenshots + activity ──────────

  ipcMain.handle(
    "ai:generate-description",
    async (
      _,
      params: {
        screenshotPaths: string[];
        typedTexts: string[];
        shortcuts: string[];
        clickCount: number;
        durationMs: number;
        windowContexts?: Array<{
          appName: string;
          windowTitle: string;
          url?: string;
        }>;
      }
    ) => {
      try {
        const report = await aiService.generateSessionDescription(params);
        return { success: true, data: report };
      } catch (error) {
        log.warn("[AI] Failed to generate description:", error);
        return { success: false, error: AiService.friendlyError(error) };
      }
    }
  );

  // ── AI: generate description directly from a saved snap's session data ──────
  ipcMain.handle(
    "ai:generate-description-from-snap",
    async (_, { snapId }: { snapId: string }) => {
      try {
        const snap = issueService.getSnapById(snapId);
        if (!snap) {
          return { success: false, error: "Snap not found" };
        }

        const sd = (snap as any).sessionData as
          | {
              screenshotPaths?: string[];
              duration?: number;
              eventCount?: number;
              timeline?: Array<{
                event: {
                  type: string;
                  data: { key?: string; button?: number };
                } | null;
                screenshot: unknown;
                description: string;
              }>;
            }
          | undefined;

        if (!sd) {
          return { success: false, error: "No session data on this snap" };
        }

        // Reconstruct typed texts, shortcuts, and click count from stored timeline events
        const MODIFIER_KEYS = new Set(["ctrl", "alt", "shift", "meta"]);
        const SKIP_KEYS = new Set([
          "Tab",
          "Escape",
          "Up",
          "Down",
          "Left",
          "Right",
        ]);

        let typingBuffer: string[] = [];
        const typedTexts: string[] = [];
        const shortcutSet = new Set<string>();
        let clickCount = 0;

        for (const entry of sd.timeline ?? []) {
          const ev = entry.event;
          if (!ev) continue;
          if (ev.type === "click") {
            clickCount++;
            if (typingBuffer.length > 0) {
              const text = typingBuffer.join("").trim();
              if (text.length >= 2) typedTexts.push(text);
              typingBuffer = [];
            }
          } else if (ev.type === "keypress") {
            const key = ev.data.key ?? "";
            if (MODIFIER_KEYS.has(key) || SKIP_KEYS.has(key)) continue;
            if (key.length === 1) {
              typingBuffer.push(key);
            } else {
              if (typingBuffer.length > 0) {
                const text = typingBuffer.join("").trim();
                if (text.length >= 2) typedTexts.push(text);
                typingBuffer = [];
              }
              if (key === "Return") shortcutSet.add("Enter");
              else if (key !== "BackSpace" && key !== "Delete")
                shortcutSet.add(key);
            }
          }
        }
        if (typingBuffer.length > 0) {
          const text = typingBuffer.join("").trim();
          if (text.length >= 2) typedTexts.push(text);
        }

        const report = await aiService.generateSessionDescription({
          screenshotPaths: sd.screenshotPaths ?? [],
          typedTexts: typedTexts.slice(0, 5),
          shortcuts: Array.from(shortcutSet).slice(0, 10),
          clickCount,
          durationMs: sd.duration ?? 0,
          windowContexts: (sd as any).windowContexts as
            | Array<{ appName: string; windowTitle: string; url?: string }>
            | undefined,
        });

        return { success: true, data: report };
      } catch (error) {
        log.warn("[AI] Failed to generate description from snap:", error);
        return { success: false, error: AiService.friendlyError(error) };
      }
    }
  );

  ipcMain.handle("ai:is-configured", () => {
    return { success: true, data: aiService.isConfigured() };
  });

  ipcMain.handle("ai:get-key", () => {
    const key = aiService.getStoredApiKey();
    // Return masked key for display
    const masked = key ? key.slice(0, 7) + "…" + key.slice(-4) : null;
    return { success: true, data: masked };
  });

  ipcMain.handle("ai:set-key", (_, { key }: { key: string }) => {
    try {
      aiService.setApiKey(key);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle("ai:clear-key", () => {
    aiService.clearApiKey();
    return { success: true };
  });

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

/**
 * Debug Collector — Session Manager
 *
 * Owns session lifecycle state and coordinates:
 *  - EventTracker  → collects raw input events
 *  - CaptureService → takes screenshots
 *  - StorageManager → persists screenshot files
 *  - TimelineBuilder → produces the final timeline
 *
 * Public surface:
 *   startSession()        → begins a new debug session
 *   stopSession()         → ends the session, returns the finished Session
 *   captureSnapshot()     → Mode 1 — one-shot capture with recent context
 *   captureScreenshot()   → Mode 2 — manual screenshot inside an active session
 *   getSessionTimeline()  → build + return the timeline for the current session
 *   getActiveSession()    → read the in-progress session (or null)
 */

import { randomUUID } from "crypto";
import { desktopCapturer, screen } from "electron";
import log from "electron-log";
import { captureService } from "../capture";
import { storageManager } from "../../utils/storage";
import { eventTracker } from "./event-tracker";
import { buildTimeline } from "./timeline-builder";
import type {
  DebugEvent,
  DebugScreenshot,
  DebugSession,
  SnapshotResult,
  TimelineEntry,
  WindowMeta,
} from "./types";

// ---------------------------------------------------------------------------
// Window metadata helper — best-effort, never throws
// ---------------------------------------------------------------------------

/** Known browser app substrings for URL hint detection */
const BROWSER_NAMES = [
  "chrome",
  "firefox",
  "safari",
  "edge",
  "brave",
  "arc",
  "opera",
];

/**
 * Extract a short app name from an OS window title.
 * Most apps use the pattern "Page/Document title – App Name".
 */
function extractAppName(windowTitle: string): string {
  // Match "– App Name" or "- App Name" or "— App Name" at the end
  const match = windowTitle.match(/\s[—–-]\s+([^—–-]+)\s*$/);
  if (match && match[1]) return match[1].trim();
  // Fallback: use first word
  return windowTitle.split(/\s/)[0] ?? windowTitle;
}

/**
 * For browser windows, try to extract a page URL from the window title.
 * Browsers sometimes include the URL in the title when devtools are open,
 * but in general we can only detect that it *is* a browser and note the page title.
 */
function extractUrl(appName: string, windowTitle: string): string | undefined {
  const isBrowser = BROWSER_NAMES.some((b) =>
    appName.toLowerCase().includes(b)
  );
  if (!isBrowser) return undefined;
  // Try to match a bare URL embedded in the title (e.g. from address bar copy)
  const urlMatch = windowTitle.match(/https?:\/\/[^\s]+/);
  return urlMatch?.[0];
}

/**
 * Query the OS window list and return metadata about the frontmost
 * non-SnapFlow window. Returns undefined on any failure.
 */
async function getActiveWindowMeta(): Promise<WindowMeta | undefined> {
  try {
    // thumbnailSize 0×0 means skip image data — only window names needed
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 0, height: 0 },
    });

    // Filter out our own overlay / HUD windows and blank entries
    const external = sources.filter((s) => {
      const n = s.name.trim();
      return n.length > 0 && !n.toLowerCase().includes("snapflow");
    });

    if (external.length === 0) return undefined;

    // On macOS the list is roughly front-to-back; take the first entry
    const windowTitle = external[0].name.trim();
    const appName = extractAppName(windowTitle);
    const url = extractUrl(appName, windowTitle);

    return { appName, windowTitle, url };
  } catch {
    // Permission not yet granted, or API unavailable — silently skip
    return undefined;
  }
}

// Minimum ms between auto-captures to prevent burst duplicates
const MIN_CAPTURE_INTERVAL_MS = 1500;
// Bytes sampled from the buffer as a quick visual fingerprint
const FINGERPRINT_BYTES = 2048;

export class SessionManager {
  private activeSession: DebugSession | null = null;
  private lastCaptureTime = 0;
  private lastCaptureFingerprint: string | null = null;

  // ---------------------------------------------------------------------------
  // Mode 2 — Session capture
  // ---------------------------------------------------------------------------

  /** Start a new debug session. Throws if a session is already active. */
  startSession(): DebugSession {
    if (this.activeSession) {
      throw new Error("A debug session is already active");
    }

    const session: DebugSession = {
      id: randomUUID(),
      start_time: Date.now(),
      end_time: null,
      events: [],
      screenshots: [],
    };

    this.activeSession = session;

    // Wire up event collection
    eventTracker.onEvent(this.handleEvent);
    if (!eventTracker.isActive()) {
      eventTracker.start();
    }

    log.info("[SessionManager] Session started:", session.id);
    return { ...session };
  }

  /**
   * End the active session.
   * Returns the completed session (events + screenshots + end_time set).
   */
  stopSession(): DebugSession {
    if (!this.activeSession) {
      throw new Error("No active debug session");
    }

    this.activeSession.end_time = Date.now();
    const finished: DebugSession = {
      ...this.activeSession,
      events: [...this.activeSession.events],
      screenshots: [...this.activeSession.screenshots],
    };

    eventTracker.offEvent(this.handleEvent);
    // Only stop the tracker if nothing else needs it
    if (eventTracker.isActive()) {
      eventTracker.stop();
    }

    log.info(
      "[SessionManager] Session stopped:",
      finished.id,
      "events:",
      finished.events.length,
      "screenshots:",
      finished.screenshots.length
    );
    this.activeSession = null;
    return finished;
  }

  /**
   * Take a screenshot inside the active session.
   * Optionally link the screenshot to the most recent event.
   */
  async captureScreenshot(linkToLatestEvent = true): Promise<DebugScreenshot> {
    if (!this.activeSession) {
      throw new Error("No active debug session");
    }

    const timestamp = Date.now();

    // Capture active window metadata before taking the screenshot so we
    // record what the QA was looking at, not our own overlay.
    const windowMeta = await getActiveWindowMeta();

    // Debounce: skip if a capture was taken very recently
    if (timestamp - this.lastCaptureTime < MIN_CAPTURE_INTERVAL_MS) {
      log.info(
        "[SessionManager] Skipping duplicate capture — too soon after last capture"
      );
      // Return the last screenshot as a no-op
      const last =
        this.activeSession.screenshots[
          this.activeSession.screenshots.length - 1
        ];
      if (last) return last;
    }

    const { buffer } = await captureService.captureScreenshot({
      mode: "fullscreen",
    });

    // Fingerprint check: skip if screen content hasn't changed
    const fingerprint = Buffer.from(
      buffer.slice(0, FINGERPRINT_BYTES)
    ).toString("base64");
    if (fingerprint === this.lastCaptureFingerprint) {
      log.info(
        "[SessionManager] Skipping duplicate capture — screen unchanged"
      );
      const last =
        this.activeSession.screenshots[
          this.activeSession.screenshots.length - 1
        ];
      if (last) return last;
    }

    this.lastCaptureTime = timestamp;
    this.lastCaptureFingerprint = fingerprint;

    const screenshotId = randomUUID();

    const filePath = await storageManager.saveCapture(
      `debug_${screenshotId}`,
      "capture.png",
      buffer
    );

    // Find the most recent event to link (within 2 seconds)
    let linkedEventId: string | undefined;
    if (linkToLatestEvent && this.activeSession.events.length > 0) {
      const recent =
        this.activeSession.events[this.activeSession.events.length - 1];
      if (timestamp - recent.timestamp <= 2000) {
        linkedEventId = recent.id;
        recent.linked_screenshot_id = screenshotId;
      }
    }

    const screenshot: DebugScreenshot = {
      id: screenshotId,
      timestamp,
      file_path: filePath,
      trigger: "manual",
      linked_event_id: linkedEventId,
      windowMeta,
    };

    this.activeSession.screenshots.push(screenshot);
    log.info("[SessionManager] Screenshot captured in session:", screenshotId);
    return screenshot;
  }

  /** Build and return the timeline for the current active session. */
  getSessionTimeline(): TimelineEntry[] {
    if (!this.activeSession) {
      throw new Error("No active debug session");
    }
    return buildTimeline(this.activeSession);
  }

  /** Return a shallow copy of the active session, or null. */
  getActiveSession(): DebugSession | null {
    if (!this.activeSession) return null;
    return {
      ...this.activeSession,
      events: [...this.activeSession.events],
      screenshots: [...this.activeSession.screenshots],
    };
  }

  // ---------------------------------------------------------------------------
  // Mode 1 — Snapshot capture
  // ---------------------------------------------------------------------------

  /**
   * Ad-hoc one-shot capture.  Does NOT require an active session.
   * Collects cursor position, active window name, last 3 seconds of events,
   * and a screenshot — all in one atomic result.
   */
  async captureSnapshot(): Promise<SnapshotResult> {
    const timestamp = Date.now();
    const cursorPoint = screen.getCursorScreenPoint();

    // Get the display that contains the cursor (for active window approximation)
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const activeWindow = `Display ${display.id} (${display.bounds.width}×${display.bounds.height})`;

    // Recent events from the rolling buffer (works even outside a session)
    if (!eventTracker.isActive()) {
      eventTracker.start();
    }
    const recentEvents = eventTracker.getRecentEvents(3000);

    // Take the screenshot
    const screenshotId = randomUUID();
    const { buffer } = await captureService.captureScreenshot({
      mode: "fullscreen",
    });
    const filePath = await storageManager.saveCapture(
      `snapshot_${screenshotId}`,
      "capture.png",
      buffer
    );

    const screenshot: DebugScreenshot = {
      id: screenshotId,
      timestamp,
      file_path: filePath,
      trigger: "manual",
    };

    const result: SnapshotResult = {
      type: "snapshot",
      timestamp,
      cursor_position: { x: cursorPoint.x, y: cursorPoint.y },
      active_window: activeWindow,
      screenshot,
      recent_events: recentEvents,
    };

    log.info(
      "[SessionManager] Snapshot captured:",
      screenshotId,
      "recent events:",
      recentEvents.length
    );
    return result;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /** Arrow function to preserve `this` when passed as a callback. */
  private handleEvent = (event: DebugEvent): void => {
    if (this.activeSession) {
      this.activeSession.events.push(event);
    }
  };
}

export const sessionManager = new SessionManager();

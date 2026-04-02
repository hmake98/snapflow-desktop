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
import { screen } from "electron";
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
} from "./types";

export class SessionManager {
  private activeSession: DebugSession | null = null;

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

    const screenshotId = randomUUID();
    const timestamp = Date.now();

    const { buffer } = await captureService.captureScreenshot({
      mode: "fullscreen",
    });
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

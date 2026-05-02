/**
 * Debug Collector — Type Definitions
 *
 * Strict schema for all entities in the Collection Layer.
 * Events and screenshots are the raw inputs; the Timeline is the product.
 */

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export type EventType = "click" | "keypress" | "scroll";

export interface EventData {
  /** Screen coordinate for click/scroll events */
  x?: number;
  y?: number;
  /** Key name for keypress events (e.g. "Enter", "a", "Backspace") */
  key?: string;
  /** Mouse button: 1=left, 2=right, 3=middle */
  button?: number;
  /** Scroll direction */
  scrollDirection?: "up" | "down";
  /** Approximate scroll amount (wheel rotation) */
  scrollAmount?: number;
}

export interface DebugEvent {
  id: string;
  type: EventType;
  timestamp: number;
  data: EventData;
  /** ID of the screenshot captured closest to this event, if any */
  linked_screenshot_id?: string;
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

export type ScreenshotTrigger = "manual" | "event";

/**
 * Auto-captured context about the active window at the moment a screenshot
 * was taken. Provides the LLM with "what app / page was being tested" without
 * requiring any user input.
 */
export interface WindowMeta {
  /** Application name extracted from the window title, e.g. "Google Chrome" */
  appName: string;
  /** Full OS window title, e.g. "Checkout – MyShop · Google Chrome" */
  windowTitle: string;
  /** Browser URL inferred from the window title, if the app is a browser */
  url?: string;
}

export interface DebugScreenshot {
  id: string;
  timestamp: number;
  /** Absolute path on disk */
  file_path: string;
  trigger: ScreenshotTrigger;
  /** ID of the event that caused this screenshot, if trigger === "event" */
  linked_event_id?: string;
  /** Active window/app context captured at the moment of the screenshot */
  windowMeta?: WindowMeta;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** System context captured once at session start. */
export interface SessionEnvironment {
  /** e.g. "macOS 14.4.0" | "Windows 10.0.22631" | "Linux 6.5.0" */
  os: string;
  /** Primary display resolution, e.g. "2560×1600" */
  screen: string;
  /** SnapFlow app version, e.g. "1.2.0" */
  appVersion: string;
}

export interface DebugSession {
  id: string;
  start_time: number;
  end_time: number | null;
  events: DebugEvent[];
  screenshots: DebugScreenshot[];
  /** Captured once at session start — OS, screen size, app version */
  environment?: SessionEnvironment;
}

// ---------------------------------------------------------------------------
// Snapshot (Mode 1 — single ad-hoc capture)
// ---------------------------------------------------------------------------

export interface SnapshotResult {
  type: "snapshot";
  timestamp: number;
  cursor_position: { x: number; y: number };
  active_window: string;
  screenshot: DebugScreenshot;
  recent_events: DebugEvent[];
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  timestamp: number;
  event: DebugEvent | null;
  screenshot: DebugScreenshot | null;
  description: string;
}

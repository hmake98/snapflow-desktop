/**
 * Debug Collector — Type Definitions
 *
 * Strict schema for all entities in the Collection Layer.
 * Events and screenshots are the raw inputs; the Timeline is the product.
 */

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export type EventType = "click" | "keypress";

export interface EventData {
  /** Screen coordinate for click events */
  x?: number;
  y?: number;
  /** Key name for keypress events (e.g. "Enter", "a", "Backspace") */
  key?: string;
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

export interface DebugScreenshot {
  id: string;
  timestamp: number;
  /** Absolute path on disk */
  file_path: string;
  trigger: ScreenshotTrigger;
  /** ID of the event that caused this screenshot, if trigger === "event" */
  linked_event_id?: string;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface DebugSession {
  id: string;
  start_time: number;
  end_time: number | null;
  events: DebugEvent[];
  screenshots: DebugScreenshot[];
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

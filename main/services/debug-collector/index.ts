/**
 * Debug Collector — Public Entry Point
 *
 * Re-exports the session manager singleton and all types so consumers
 * can import from a single path: `main/services/debug-collector`.
 */

export { sessionManager } from "./session-manager";
export { eventTracker } from "./event-tracker";
export { buildTimeline } from "./timeline-builder";
export type {
  DebugEvent,
  DebugScreenshot,
  DebugSession,
  SnapshotResult,
  TimelineEntry,
  EventType,
  EventData,
  ScreenshotTrigger,
} from "./types";

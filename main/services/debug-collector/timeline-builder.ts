/**
 * Debug Collector — Timeline Builder
 *
 * Merges events and screenshots from a session into a flat, chronological
 * list of TimelineEntry objects with deterministic, rule-based descriptions.
 * No AI, no OCR, no natural-language generation beyond simple rules.
 */

import type {
  DebugEvent,
  DebugScreenshot,
  DebugSession,
  TimelineEntry,
} from "./types";

// Gap threshold — if no event occurred for this many ms, emit a "No activity" entry.
const INACTIVITY_THRESHOLD_MS = 3000;

export function buildTimeline(session: DebugSession): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // Merge events and screenshots into a single list sorted by timestamp
  type RawEntry =
    | { kind: "event"; timestamp: number; event: DebugEvent }
    | { kind: "screenshot"; timestamp: number; screenshot: DebugScreenshot };

  const raw: RawEntry[] = [
    ...session.events.map((e) => ({
      kind: "event" as const,
      timestamp: e.timestamp,
      event: e,
    })),
    ...session.screenshots.map((s) => ({
      kind: "screenshot" as const,
      timestamp: s.timestamp,
      screenshot: s,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  let lastTimestamp: number | null = null;

  for (const item of raw) {
    // Inactivity gap detection
    if (lastTimestamp !== null) {
      const gap = item.timestamp - lastTimestamp;
      if (gap >= INACTIVITY_THRESHOLD_MS) {
        const gapSeconds = Math.round(gap / 1000);
        entries.push({
          timestamp: lastTimestamp + gap,
          event: null,
          screenshot: null,
          description: `No activity for ${gapSeconds} second${gapSeconds !== 1 ? "s" : ""}`,
        });
      }
    }

    if (item.kind === "event") {
      entries.push({
        timestamp: item.timestamp,
        event: item.event,
        screenshot: null,
        description: describeEvent(item.event),
      });
    } else {
      // Screenshot entry — check if it is linked to an event for the description
      const desc = item.screenshot.linked_event_id
        ? "Screenshot captured after event"
        : "Screenshot captured";
      entries.push({
        timestamp: item.timestamp,
        event: null,
        screenshot: item.screenshot,
        description: desc,
      });
    }

    lastTimestamp = item.timestamp;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Rule-based event descriptions
// ---------------------------------------------------------------------------

function describeEvent(event: DebugEvent): string {
  switch (event.type) {
    case "click": {
      const x = event.data.x ?? 0;
      const y = event.data.y ?? 0;
      const btn = event.data.button ?? 1;
      const btnLabel =
        btn === 2 ? "Right-click" : btn === 3 ? "Middle-click" : "Left-click";
      return `${btnLabel} at (${x}, ${y})`;
    }
    case "keypress": {
      const key = event.data.key ?? "unknown";
      const friendlyKeys: Record<string, string> = {
        Return: "Enter",
        BackSpace: "Backspace",
        Delete: "Delete",
        Escape: "Escape",
        Tab: "Tab",
        space: "Space",
        Up: "↑ Up",
        Down: "↓ Down",
        Left: "← Left",
        Right: "→ Right",
        ctrl: "Ctrl",
        alt: "Alt",
        shift: "Shift",
        meta: "⌘ Cmd",
      };
      return `Key: ${friendlyKeys[key] ?? key}`;
    }
    case "scroll": {
      const dir = event.data.scrollDirection ?? "down";
      const x = event.data.x ?? 0;
      const y = event.data.y ?? 0;
      return `Scroll ${dir} at (${x}, ${y})`;
    }
    default:
      return `Unknown event`;
  }
}

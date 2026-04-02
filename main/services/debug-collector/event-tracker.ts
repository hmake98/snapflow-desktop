/**
 * Debug Collector — Event Tracker
 *
 * Registers global mouse-click and keypress listeners via uiohook-napi.
 * Emits normalized DebugEvent objects to registered handlers.
 * Also maintains a rolling in-memory buffer for snapshot mode (last N seconds).
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import log from "electron-log";
import type { DebugEvent } from "./types";

// Rolling buffer window in milliseconds (for snapshot "recent_events")
const BUFFER_WINDOW_MS = 3000;

type EventHandler = (event: DebugEvent) => void;

export class EventTracker extends EventEmitter {
  private active = false;
  private buffer: DebugEvent[] = [];
  // uiohook is lazily required so the app still starts if the native
  // module failed to build (e.g. on first install before electron-rebuild).

  private uiohook: any = null;

  constructor() {
    super();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Start listening for global mouse and keyboard events. */
  start(): void {
    if (this.active) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { uIOhook, UiohookKey } = require("uiohook-napi");
      this.uiohook = uIOhook;

      uIOhook.on("mousedown", (e: { x: number; y: number; button: number }) => {
        // Only track primary button (1) and secondary button (2) clicks
        if (e.button !== 1 && e.button !== 2) return;
        this.handleEvent({
          id: randomUUID(),
          type: "click",
          timestamp: Date.now(),
          data: { x: e.x, y: e.y },
        });
      });

      uIOhook.on(
        "keydown",
        (e: {
          keycode: number;
          shiftKey: boolean;
          ctrlKey: boolean;
          altKey: boolean;
          metaKey: boolean;
        }) => {
          const keyName = this.resolveKeyName(e.keycode, UiohookKey);
          if (!keyName) return;
          this.handleEvent({
            id: randomUUID(),
            type: "keypress",
            timestamp: Date.now(),
            data: { key: keyName },
          });
        }
      );

      uIOhook.start();
      this.active = true;
      log.info("[EventTracker] Started (uiohook-napi)");
    } catch (err) {
      log.error("[EventTracker] Failed to start uiohook-napi:", err);
    }
  }

  /** Stop listening and clear internal state. */
  stop(): void {
    if (!this.active) return;
    try {
      this.uiohook?.stop();
    } catch (err) {
      log.warn("[EventTracker] Error stopping uiohook:", err);
    }
    this.uiohook = null;
    this.active = false;
    log.info("[EventTracker] Stopped");
  }

  /** Register a handler for every new event (used during a session). */
  onEvent(handler: EventHandler): void {
    this.on("event", handler);
  }

  /** Unregister a previously registered event handler. */
  offEvent(handler: EventHandler): void {
    this.off("event", handler);
  }

  /**
   * Return events from the rolling buffer that fall within the last
   * `windowMs` milliseconds.  Used by snapshot mode.
   */
  getRecentEvents(windowMs: number = BUFFER_WINDOW_MS): DebugEvent[] {
    const cutoff = Date.now() - windowMs;
    return this.buffer.filter((e) => e.timestamp >= cutoff);
  }

  isActive(): boolean {
    return this.active;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private handleEvent(event: DebugEvent): void {
    // Add to rolling buffer
    this.buffer.push(event);
    // Prune buffer to the last BUFFER_WINDOW_MS
    const cutoff = Date.now() - BUFFER_WINDOW_MS;
    this.buffer = this.buffer.filter((e) => e.timestamp >= cutoff);

    // Notify session-level listeners
    this.emit("event", event);
  }

  /**
   * Map uiohook numeric keycode to a human-readable key name.
   * Falls back to the raw keycode string if not found in the UiohookKey map.
   */

  private resolveKeyName(keycode: number, UiohookKey: any): string | null {
    if (!UiohookKey) return `key_${keycode}`;

    // UiohookKey is a name→code map; invert it to code→name
    for (const [name, code] of Object.entries(UiohookKey)) {
      if (code === keycode) return name as string;
    }

    return `key_${keycode}`;
  }
}

export const eventTracker = new EventTracker();

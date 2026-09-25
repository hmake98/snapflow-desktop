---
paths:
  - "main/services/debug-collector/**"
  - "renderer/pages/session-hud.tsx"
  - "renderer/pages/annotate-session.tsx"
---

# Debug-collector subsystem

The debug-collector captures a timeline of events, snapshots, and screenshots during a bug-report session — unrelated to a "Snap of type session" (a capture with multiple screenshots) and unrelated to an auth session. See `CONTEXT.md` § Common confusions before assuming which "session" a task means.

- Main-process code: `main/services/debug-collector/` (`session-manager.ts`, `event-tracker.ts`, `timeline-builder.ts`, `types.ts`).
- IPC surface: `collector:*` (6 channels) and `session:*` (5 channels) — full list in `main/docs/ipc-map.md`.
- Renderer: `session-hud.tsx` (live HUD during capture), `annotate-session.tsx` (post-capture annotation — **1500+ lines, read by range**, not whole).

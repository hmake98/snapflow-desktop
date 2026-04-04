import React, { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "../components/ui/Button";
import { useStore } from "../store/useStore";

// ── Data types (mirrors service layer) ────────────────────────────────────

interface DebugEvent {
  id: string;
  type: "click" | "keypress" | "scroll";
  timestamp: number;
  data: {
    x?: number;
    y?: number;
    key?: string;
    button?: number;
    scrollDirection?: "up" | "down";
    scrollAmount?: number;
  };
}

interface DebugScreenshot {
  id: string;
  timestamp: number;
  file_path: string;
  trigger: "manual" | "event";
}

interface SessionData {
  id: string;
  start_time: number;
  end_time: number | null;
  events: DebugEvent[];
  screenshots: DebugScreenshot[];
  timeline: Array<{
    timestamp: number;
    event: DebugEvent | null;
    screenshot: DebugScreenshot | null;
    description: string;
  }>;
}

interface LoadedScreenshot {
  id: string;
  dataUrl: string;
  timestamp: number;
}

// ── Grouped activity types ────────────────────────────────────────────────

type GroupedEntry =
  | { kind: "typed"; text: string; timestamp: number; endTimestamp: number; keyCount: number }
  | { kind: "click"; button: number; timestamp: number }
  | { kind: "shortcut"; combo: string; timestamp: number }
  | { kind: "screenshot"; id: string; timestamp: number; trigger: "manual" | "event" };

// ── Constants ─────────────────────────────────────────────────────────────

const MODIFIER_KEYS = new Set(["ctrl", "alt", "shift", "meta"]);
const MODIFIER_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "⌘",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(startMs: number, endMs: number | null): string {
  const diff = (endMs ?? Date.now()) - startMs;
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelative(ms: number, startMs: number): string {
  const diff = ms - startMs;
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `+${m}m ${sec}s`;
  return `+${sec}s`;
}

/**
 * Merge raw events and screenshots into human-readable grouped activity entries.
 *
 * Key rules:
 * - Consecutive keypresses → reconstructed "typed text" block (handles BackSpace)
 * - Shift + letter → uppercase character (not a "shortcut")
 * - Ctrl / Alt / Meta + any key → keyboard shortcut (e.g. "Ctrl+S")
 * - Scrolls → dropped (too noisy)
 * - Standalone Tab, arrows → dropped (navigation noise)
 * - Enter, Escape → shown as standalone shortcut entries
 * - Screenshots → always shown, clickable to jump to that frame
 */
function groupTimeline(session: SessionData): GroupedEntry[] {
  const groups: GroupedEntry[] = [];

  type RawItem =
    | { kind: "event"; timestamp: number; event: DebugEvent }
    | { kind: "shot"; timestamp: number; shot: DebugScreenshot };

  const raw: RawItem[] = [
    ...session.events.map((e) => ({ kind: "event" as const, timestamp: e.timestamp, event: e })),
    ...session.screenshots.map((s) => ({ kind: "shot" as const, timestamp: s.timestamp, shot: s })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  let typingChars: string[] = [];
  let typingStart: number | null = null;
  let typingEnd: number | null = null;
  let typingKeyCount = 0;

  function flushTyping() {
    const text = typingChars.join("").trim();
    // Require at least 2 meaningful characters — single chars are almost always
    // accidental keypresses or undetected shortcut components, not real input.
    if (text.length >= 2 && typingStart !== null) {
      groups.push({
        kind: "typed",
        text,
        timestamp: typingStart,
        endTimestamp: typingEnd ?? typingStart,
        keyCount: typingKeyCount,
      });
    }
    typingChars = [];
    typingStart = null;
    typingEnd = null;
    typingKeyCount = 0;
  }

  let i = 0;
  while (i < raw.length) {
    const item = raw[i];

    if (item.kind === "shot") {
      flushTyping();
      groups.push({
        kind: "screenshot",
        id: item.shot.id,
        timestamp: item.timestamp,
        trigger: item.shot.trigger,
      });
      i++;
      continue;
    }

    const ev = item.event;

    // Scrolls — too noisy, drop entirely
    if (ev.type === "scroll") {
      i++;
      continue;
    }

    if (ev.type === "click") {
      flushTyping();
      groups.push({ kind: "click", button: ev.data.button ?? 1, timestamp: ev.timestamp });
      i++;
      continue;
    }

    if (ev.type === "keypress") {
      const key = ev.data.key ?? "";

      // ── Modifier key logic ──────────────────────────────────────────────
      if (MODIFIER_KEYS.has(key)) {
        const next = i + 1 < raw.length ? raw[i + 1] : null;
        if (
          next?.kind === "event" &&
          next.event.type === "keypress" &&
          !MODIFIER_KEYS.has(next.event.data.key ?? "") &&
          next.event.timestamp - ev.timestamp < 500
        ) {
          const nextKey = next.event.data.key ?? "";
          // Shift + single letter → uppercase character in typing buffer
          if (key === "shift" && nextKey.length === 1 && /^[A-Za-z]$/.test(nextKey)) {
            if (typingStart === null) typingStart = ev.timestamp;
            typingChars.push(nextKey.toUpperCase());
            typingEnd = next.event.timestamp;
            typingKeyCount += 2;
            i += 2;
            continue;
          }
          // Any other modifier + key → keyboard shortcut
          flushTyping();
          const modLabel = MODIFIER_LABELS[key] ?? key.toUpperCase();
          const keyLabel = nextKey.length === 1 ? nextKey.toUpperCase() : nextKey;
          groups.push({
            kind: "shortcut",
            combo: `${modLabel}+${keyLabel}`,
            timestamp: next.event.timestamp,
          });
          i += 2;
          continue;
        }
        // Standalone modifier — skip (noise)
        i++;
        continue;
      }

      // ── BackSpace / Delete ──────────────────────────────────────────────
      if (key === "BackSpace" || key === "Delete") {
        if (typingChars.length > 0) {
          typingChars.pop();
          typingEnd = ev.timestamp;
          typingKeyCount++;
        }
        i++;
        continue;
      }

      // ── Enter / Return → flush typing, show as action ──────────────────
      if (key === "Return" || key === "Enter") {
        flushTyping();
        groups.push({ kind: "shortcut", combo: "Enter", timestamp: ev.timestamp });
        i++;
        continue;
      }

      // ── Escape → show as action ─────────────────────────────────────────
      if (key === "Escape") {
        flushTyping();
        groups.push({ kind: "shortcut", combo: "Escape", timestamp: ev.timestamp });
        i++;
        continue;
      }

      // ── Tab, arrows, function keys → drop (navigation noise) ───────────
      if (
        key === "Tab" ||
        key === "Up" || key === "Down" || key === "Left" || key === "Right" ||
        /^F\d{1,2}$/.test(key)
      ) {
        i++;
        continue;
      }

      // ── Space ───────────────────────────────────────────────────────────
      if (key === "space" || key === "Space") {
        if (typingStart === null) typingStart = ev.timestamp;
        typingChars.push(" ");
        typingEnd = ev.timestamp;
        typingKeyCount++;
        i++;
        continue;
      }

      // ── Single printable character ──────────────────────────────────────
      if (key.length === 1) {
        if (typingStart === null) typingStart = ev.timestamp;
        typingChars.push(key.toLowerCase());
        typingEnd = ev.timestamp;
        typingKeyCount++;
        i++;
        continue;
      }

      // Anything else (numpad names, media keys, etc.) — drop
      i++;
      continue;
    }

    i++;
  }

  flushTyping();
  return groups;
}

function generateDescription(_session: SessionData, groups: GroupedEntry[]): string {
  const typedGroups = groups.filter(
    (g): g is Extract<GroupedEntry, { kind: "typed" }> =>
      g.kind === "typed" && g.text.trim().length >= 2
  );
  const shortcuts = groups.filter(
    (g): g is Extract<GroupedEntry, { kind: "shortcut" }> => g.kind === "shortcut"
  );

  const parts: string[] = [];

  // Lead with typed content
  if (typedGroups.length === 1) {
    const text = typedGroups[0].text.slice(0, 80);
    const ellipsis = typedGroups[0].text.length > 80 ? "…" : "";
    const pressedEnter = shortcuts.some((s) => s.combo === "Enter");
    parts.push(pressedEnter ? `Typed "${text}${ellipsis}" and submitted` : `Typed "${text}${ellipsis}"`);
  } else if (typedGroups.length > 1) {
    const previews = typedGroups.map((g) => `"${g.text.slice(0, 40)}${g.text.length > 40 ? "…" : ""}"`);
    const pressedEnter = shortcuts.some((s) => s.combo === "Enter");
    parts.push(`Typed ${previews.join(", ")}${pressedEnter ? " and submitted" : ""}`);
  }

  // Notable shortcuts only (skip Enter — handled above, skip Tab/Escape noise)
  const notableShortcuts = Array.from(
    new Set(
      shortcuts
        .map((s) => s.combo)
        .filter((c) => c !== "Enter" && c !== "Tab" && c !== "Escape")
    )
  );
  if (notableShortcuts.length > 0) {
    parts.push(`used ${notableShortcuts.join(", ")}`);
  }

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] + ".";
  const last = parts.pop()!;
  return parts.join(", ") + ` and ${last}.`;
}

// ── Page component ────────────────────────────────────────────────────────

export default function AnnotateSessionPage() {
  const router = useRouter();
  const { activeWorkspace } = useStore();

  const [session, setSession] = useState<SessionData | null>(null);
  const [screenshots, setScreenshots] = useState<LoadedScreenshot[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [groupedEntries, setGroupedEntries] = useState<GroupedEntry[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.maximizeWindow?.().catch(() => {});
    loadSession();
  }, []);

  async function loadSession() {
    setLoading(true);
    try {
      const result = await window.api.getPendingSession();
      if (!result?.success || !result.data) {
        setError("No session data found.");
        return;
      }
      const data: SessionData = result.data;
      setSession(data);

      const groups = groupTimeline(data);
      setGroupedEntries(groups);

      const start = new Date(data.start_time);
      setTitle(
        `Session – ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      );

      // Set fallback description immediately, then try AI
      setDescription(generateDescription(data, groups));

      const loaded: LoadedScreenshot[] = [];
      for (const s of data.screenshots) {
        try {
          const imgResult = await window.api.readImageFile(s.file_path);
          if (imgResult?.success && imgResult.data) {
            loaded.push({ id: s.id, dataUrl: imgResult.data, timestamp: s.timestamp });
          }
        } catch {
          // skip unreadable screenshots
        }
      }
      setScreenshots(loaded);

      // Auto-generate with AI if API key is configured
      const configuredResult = await window.api.aiIsConfigured();
      if (configuredResult?.data) {
        generateWithAi(data, groups);
      }
    } catch {
      setError("Failed to load session data.");
    } finally {
      setLoading(false);
    }
  }

  async function generateWithAi(data?: SessionData, groups?: GroupedEntry[]) {
    const sessionData = data ?? session;
    const entryGroups = groups ?? groupedEntries;
    if (!sessionData) return;

    setAiGenerating(true);
    setAiError(null);

    try {
      const typedTexts = entryGroups
        .filter((g): g is Extract<GroupedEntry, { kind: "typed" }> => g.kind === "typed")
        .map((g) => g.text);
      const shortcuts = entryGroups
        .filter((g): g is Extract<GroupedEntry, { kind: "shortcut" }> => g.kind === "shortcut")
        .map((g) => g.combo);
      const clickCount = entryGroups.filter((g) => g.kind === "click").length;

      const result = await window.api.aiGenerateDescription({
        screenshotPaths: sessionData.screenshots.map((s) => s.file_path),
        typedTexts,
        shortcuts,
        clickCount,
        durationMs: (sessionData.end_time ?? Date.now()) - sessionData.start_time,
      });

      if (result?.success && result.data) {
        setDescription(result.data);
      } else {
        setAiError(result?.error ?? "AI generation failed.");
      }
    } catch {
      setAiError("Failed to reach AI service.");
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleSave() {
    if (!session || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await window.api.saveSessionSnap(
        title.trim(),
        description.trim() || undefined,
        activeWorkspace?.id ?? undefined
      );
      if (!result?.success) {
        setError(result?.error ?? "Failed to save session.");
        return;
      }
      router.push("/home");
    } catch {
      setError("Failed to save session.");
    } finally {
      setSaving(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading session…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-400">{error ?? "No session found."}</p>
        <Button variant="secondary" size="sm" onClick={() => router.push("/home")}>
          Go Home
        </Button>
      </div>
    );
  }

  const duration = formatDuration(session.start_time, session.end_time);
  // Left-clicks are hidden from the timeline (no context without accessibility APIs)
  const meaningfulCount = groupedEntries.filter(
    (g) =>
      g.kind === "typed" ||
      g.kind === "screenshot" ||
      g.kind === "shortcut" ||
      (g.kind === "click" && g.button !== 1)
  ).length;

  return (
    <>
      <Head>
        <title>Review Session – SnapFlow</title>
      </Head>

      <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div
          className="bg-gray-900 border-b border-gray-800 flex-shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="h-2 w-full" />
          <div
            className="flex items-center justify-between h-12 gap-4 pb-1"
            style={
              {
                WebkitAppRegion: "no-drag",
                paddingLeft: "88px",
                paddingRight: "16px",
              } as React.CSSProperties
            }
          >
            <div className="flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-blue-600/20 border border-blue-500/30 rounded flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8.5A1.5 1.5 0 014.5 7h8A1.5 1.5 0 0114 8.5v7A1.5 1.5 0 0112.5 17h-8A1.5 1.5 0 013 15.5v-7z" />
                  </svg>
                </div>
                <h1 className="text-sm font-semibold text-gray-100">Review Session</h1>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <StatPill icon="⏱" value={duration} />
                <StatPill
                  icon="📸"
                  value={`${session.screenshots.length} screenshot${session.screenshots.length !== 1 ? "s" : ""}`}
                />
                {meaningfulCount > 0 && (
                  <StatPill icon="⚡" value={`${meaningfulCount} action${meaningfulCount !== 1 ? "s" : ""}`} />
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={() => router.push("/home")}>
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={saving || !title.trim()}
                isLoading={saving}
                onClick={handleSave}
              >
                Save Session
              </Button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left: screenshot gallery */}
          <div className="w-[176px] flex-shrink-0 border-r border-gray-800 bg-gray-900/50 overflow-y-auto flex flex-col">
            <div className="px-3 pt-3 pb-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Screenshots ({screenshots.length})
              </p>
            </div>
            <div className="flex flex-col gap-2 px-3 pb-3">
              {screenshots.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                    <span className="text-xl">📷</span>
                  </div>
                  <p className="text-xs text-gray-500 text-center">No screenshots captured</p>
                </div>
              )}
              {screenshots.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedIdx(i)}
                  className={[
                    "relative rounded-lg overflow-hidden border-2 transition-all duration-150 text-left",
                    selectedIdx === i
                      ? "border-blue-500 shadow-lg shadow-blue-500/20"
                      : "border-gray-700/50 hover:border-gray-600",
                  ].join(" ")}
                >
                  <img src={s.dataUrl} alt={`Screenshot ${i + 1}`} className="w-full block" />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
                    <p className="text-[10px] text-gray-300 font-medium">#{i + 1}</p>
                    <p className="text-[9px] text-gray-400">{formatTime(s.timestamp)}</p>
                  </div>
                  {selectedIdx === i && (
                    <div className="absolute inset-0 ring-2 ring-blue-500/40 ring-inset rounded-lg pointer-events-none" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Center: screenshot viewer + metadata form */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* Screenshot preview */}
            <div className="flex-1 flex items-center justify-center bg-gray-950 relative overflow-hidden min-h-0 p-4">
              {screenshots.length > 0 && screenshots[selectedIdx] ? (
                <>
                  <img
                    src={screenshots[selectedIdx].dataUrl}
                    alt={`Screenshot ${selectedIdx + 1}`}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  />
                  {screenshots.length > 1 && (
                    <>
                      <button
                        onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
                        disabled={selectedIdx === 0}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-900/80 border border-gray-700/50 flex items-center justify-center text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setSelectedIdx((i) => Math.min(screenshots.length - 1, i + 1))}
                        disabled={selectedIdx === screenshots.length - 1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-900/80 border border-gray-700/50 flex items-center justify-center text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </>
                  )}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gray-900/80 border border-gray-700/50 text-xs text-gray-400">
                    {selectedIdx + 1} / {screenshots.length}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gray-800/50 border border-gray-700/50 flex items-center justify-center">
                    <span className="text-3xl">📷</span>
                  </div>
                  <p className="text-sm text-gray-500">No screenshots in this session</p>
                </div>
              )}
            </div>

            {/* Title + description */}
            <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/50 px-4 py-3 flex flex-col gap-2">
              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                  {error}
                </p>
              )}
              <input
                type="text"
                placeholder="Session title *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input text-sm"
              />

              {/* Description + AI controls */}
              <div className="relative">
                <textarea
                  placeholder="Describe what you were testing (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={aiGenerating}
                  className="input text-sm resize-none leading-relaxed w-full"
                />
                {aiGenerating && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-gray-900/80 rounded-lg">
                    <div className="w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-xs text-gray-400">Analysing with AI…</span>
                  </div>
                )}
              </div>

              {/* AI status row */}
              <div className="flex items-center justify-between">
                {aiError ? (
                  <p className="text-[11px] text-amber-500/70" title={aiError}>
                    AI unavailable · edit manually
                  </p>
                ) : aiGenerating ? null : (
                  <p className="text-[11px] text-gray-600">
                    {description ? "AI-generated · you can edit" : ""}
                  </p>
                )}
                <button
                  onClick={() => generateWithAi()}
                  disabled={aiGenerating}
                  className="ml-auto flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  {aiGenerating ? null : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Regenerate with AI
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: activity panel */}
          <div className="w-[264px] flex-shrink-0 border-l border-gray-800 bg-gray-900/50 flex flex-col overflow-hidden">

            <div className="px-4 pt-3 pb-2 border-b border-gray-800/50 flex-shrink-0">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Activity
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {meaningfulCount > 0
                  ? `${meaningfulCount} action${meaningfulCount !== 1 ? "s" : ""} recorded`
                  : "No activity recorded"}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {groupedEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                  <p className="text-xs text-gray-500">Nothing to show yet</p>
                  <p className="text-[10px] text-gray-600">Screenshots and typed text appear here</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical connector line */}
                  <div className="absolute left-[9px] top-4 bottom-4 w-px bg-gray-800/80" />

                  <div className="flex flex-col gap-0.5">
                    {/* Session start */}
                    <ActivityEntry
                      color="blue"
                      label="Session started"
                      time={formatTime(session.start_time)}
                      relative="+0s"
                    />

                    {groupedEntries.map((entry, i) => {
                      if (entry.kind === "screenshot") {
                        const shotIdx = screenshots.findIndex((s) => s.id === entry.id);
                        const thumb = shotIdx !== -1 ? screenshots[shotIdx].dataUrl : null;
                        return (
                          <ActivityEntry
                            key={i}
                            color="blue"
                            label={shotIdx !== -1 ? `Screenshot #${shotIdx + 1}` : "Screenshot"}
                            thumbnail={thumb}
                            time={formatTime(entry.timestamp)}
                            relative={formatRelative(entry.timestamp, session.start_time)}
                            onClick={shotIdx !== -1 ? () => setSelectedIdx(shotIdx) : undefined}
                            isActive={shotIdx !== -1 && shotIdx === selectedIdx}
                          />
                        );
                      }

                      if (entry.kind === "typed") {
                        const preview =
                          entry.text.length > 48
                            ? entry.text.slice(0, 48) + "…"
                            : entry.text;
                        return (
                          <ActivityEntry
                            key={i}
                            color="purple"
                            label="Typed"
                            typedText={preview}
                            sublabel={`${entry.keyCount} keystroke${entry.keyCount !== 1 ? "s" : ""}`}
                            time={formatTime(entry.timestamp)}
                            relative={formatRelative(entry.timestamp, session.start_time)}
                          />
                        );
                      }

                      // Left-clicks hidden — no context without accessibility APIs
                      if (entry.kind === "click" && entry.button === 1) return null;

                      if (entry.kind === "click") {
                        const label = entry.button === 2 ? "Right-click" : "Middle-click";
                        return (
                          <ActivityEntry
                            key={i}
                            color="orange"
                            label={label}
                            time={formatTime(entry.timestamp)}
                            relative={formatRelative(entry.timestamp, session.start_time)}
                          />
                        );
                      }

                      if (entry.kind === "shortcut") {
                        return (
                          <ActivityEntry
                            key={i}
                            color="gray"
                            label={entry.combo}
                            isShortcut
                            time={formatTime(entry.timestamp)}
                            relative={formatRelative(entry.timestamp, session.start_time)}
                          />
                        );
                      }

                      return null;
                    })}

                    {/* Session end */}
                    {session.end_time && (
                      <ActivityEntry
                        color="green"
                        label="Session ended"
                        time={formatTime(session.end_time)}
                        relative={formatRelative(session.end_time, session.start_time)}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatPill({ icon, value }: { icon: string; value: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px] text-gray-400">
      <span>{icon}</span>
      <span>{value}</span>
    </span>
  );
}

const DOT_COLORS = {
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
  green: "bg-green-500",
  gray: "bg-gray-600",
};

function ActivityEntry({
  color,
  label,
  sublabel,
  typedText,
  thumbnail,
  time,
  relative,
  onClick,
  badge,
  isActive,
  isShortcut,
}: {
  color: keyof typeof DOT_COLORS;
  label: string;
  sublabel?: string;
  typedText?: string;
  thumbnail?: string | null;
  time: string;
  relative: string;
  onClick?: () => void;
  badge?: string;
  isActive?: boolean;
  isShortcut?: boolean;
}) {
  return (
    <div
      className={[
        "flex gap-2.5 py-1.5 px-1.5 rounded-lg transition-all duration-150 relative",
        onClick ? "cursor-pointer hover:bg-gray-800/60" : "",
        isActive ? "bg-gray-800/60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {/* Dot */}
      <div className="flex flex-col items-center pt-[5px] flex-shrink-0">
        <div
          className={`w-2.5 h-2.5 rounded-full border-2 border-gray-950 ${DOT_COLORS[color]} z-10`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isShortcut ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700/60 text-[11px] font-mono text-gray-300 flex-shrink-0">
                {label}
              </span>
            ) : (
              <p className="text-xs text-gray-200 font-medium leading-snug truncate">{label}</p>
            )}
            {badge && (
              <span className="flex-shrink-0 text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-1 py-0.5 font-medium">
                {badge}
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-600 flex-shrink-0 mt-0.5">{relative}</p>
        </div>

        {/* Screenshot thumbnail */}
        {thumbnail && (
          <div className="mt-1.5 rounded-md overflow-hidden border border-gray-700/50">
            <img src={thumbnail} alt="Screenshot preview" className="w-full block" />
          </div>
        )}

        {/* Typed text block */}
        {typedText && (
          <div className="mt-1 px-2 py-1 rounded bg-gray-800/60 border border-gray-700/40">
            <p className="text-[11px] text-gray-300 font-mono leading-relaxed break-all">
              &ldquo;{typedText}&rdquo;
            </p>
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[10px] text-gray-600">{time}</p>
          {sublabel && (
            <>
              <span className="text-[9px] text-gray-700">·</span>
              <p className="text-[10px] text-gray-600">{sublabel}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

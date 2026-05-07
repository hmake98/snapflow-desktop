import React, { useEffect, useState, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "../components/ui/Button";
import { useStore } from "../store/useStore";
import {
  Dialog,
  DialogContent,
  DialogVisuallyHidden,
  DialogTitle,
} from "../components/ui/Dialog";
import {
  TimelineLayout,
  TimelineItem,
  TimelineContent,
  TimelineDescription,
} from "../components/ui/Timeline";

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

interface WindowMeta {
  appName: string;
  windowTitle: string;
  url?: string;
}

interface DebugScreenshot {
  id: string;
  timestamp: number;
  file_path: string;
  trigger: "manual" | "event";
  windowMeta?: WindowMeta;
}

/** Structured bug report returned by the AI service */
interface BugReport {
  title: string;
  summary: string;
  steps: string[];
  expected: string;
  actual: string;
  severity: "critical" | "high" | "medium" | "low";
}

interface SessionEnvironment {
  os: string;
  screen: string;
  appVersion: string;
}

interface SessionData {
  id: string;
  start_time: number;
  end_time: number | null;
  events: DebugEvent[];
  screenshots: DebugScreenshot[];
  environment?: SessionEnvironment;
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
  | {
      kind: "typed";
      text: string;
      timestamp: number;
      endTimestamp: number;
      keyCount: number;
    }
  | { kind: "click"; button: number; timestamp: number }
  | { kind: "shortcut"; combo: string; timestamp: number }
  | {
      kind: "screenshot";
      id: string;
      timestamp: number;
      trigger: "manual" | "event";
      windowMeta?: WindowMeta;
    }
  | {
      kind: "navigation";
      to: WindowMeta;
      timestamp: number;
    };

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
    ...session.events.map((e) => ({
      kind: "event" as const,
      timestamp: e.timestamp,
      event: e,
    })),
    ...session.screenshots.map((s) => ({
      kind: "shot" as const,
      timestamp: s.timestamp,
      shot: s,
    })),
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
      // Filter out shortcut leakage: repeated single character (e.g., "sss", "SSS")
      // This happens when modifier key detection misses a chord and the bare key
      // accumulates in the typing buffer instead of being recognized as a shortcut.
      const stripped = text.replace(/\s/g, "");
      const isRepeatedChar =
        stripped.length >= 2 && new Set(stripped.split("")).size === 1;
      if (!isRepeatedChar) {
        groups.push({
          kind: "typed",
          text,
          timestamp: typingStart,
          endTimestamp: typingEnd ?? typingStart,
          keyCount: typingKeyCount,
        });
      }
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
      // Navigation detection: emit a marker when the active window/app changes
      const meta = item.shot.windowMeta;
      if (meta) {
        const lastShot = [...groups]
          .reverse()
          .find((g): g is Extract<GroupedEntry, { kind: "screenshot" }> => g.kind === "screenshot");
        const lastMeta = lastShot?.windowMeta;
        const changed =
          !lastMeta ||
          lastMeta.appName !== meta.appName ||
          lastMeta.windowTitle !== meta.windowTitle;
        if (changed) {
          groups.push({
            kind: "navigation",
            to: meta,
            timestamp: item.timestamp,
          });
        }
      }
      groups.push({
        kind: "screenshot",
        id: item.shot.id,
        timestamp: item.timestamp,
        trigger: item.shot.trigger,
        windowMeta: item.shot.windowMeta,
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
      groups.push({
        kind: "click",
        button: ev.data.button ?? 1,
        timestamp: ev.timestamp,
      });
      i++;
      continue;
    }

    if (ev.type === "keypress") {
      const key = ev.data.key ?? "";

      // ── Modifier key logic ──────────────────────────────────────────────
      if (MODIFIER_KEYS.has(key)) {
        // Scan ahead past any consecutive modifier keys (e.g., Ctrl then Shift).
        // This correctly handles multi-modifier chords like Ctrl+Shift+S where
        // the original single-lookahead logic would drop `ctrl` (since the next
        // event is also a modifier) and then misread `shift+s` as uppercase typing.
        let j = i + 1;
        const mods: string[] = [key];
        while (j < raw.length) {
          const peek = raw[j];
          if (
            peek.kind === "event" &&
            peek.event.type === "keypress" &&
            MODIFIER_KEYS.has(peek.event.data.key ?? "") &&
            peek.event.timestamp - ev.timestamp < 500
          ) {
            mods.push(peek.event.data.key ?? "");
            j++;
          } else {
            break;
          }
        }

        const actualNext = j < raw.length ? raw[j] : null;
        if (
          actualNext?.kind === "event" &&
          actualNext.event.type === "keypress" &&
          !MODIFIER_KEYS.has(actualNext.event.data.key ?? "") &&
          actualNext.event.timestamp - ev.timestamp < 500
        ) {
          const nextKey = actualNext.event.data.key ?? "";

          // Pure Shift-only + single letter → uppercase character in typing buffer
          if (
            mods.length === 1 &&
            mods[0] === "shift" &&
            nextKey.length === 1 &&
            /^[A-Za-z]$/.test(nextKey)
          ) {
            if (typingStart === null) typingStart = ev.timestamp;
            typingChars.push(nextKey.toUpperCase());
            typingEnd = actualNext.event.timestamp;
            typingKeyCount += j - i + 1;
            i = j + 1;
            continue;
          }

          // Any multi-modifier chord or non-letter key → keyboard shortcut
          flushTyping();
          const uniqueMods = Array.from(new Set(mods));
          const modLabels = uniqueMods.map(
            (m) => MODIFIER_LABELS[m] ?? m.toUpperCase()
          );
          const keyLabel =
            nextKey.length === 1 ? nextKey.toUpperCase() : nextKey;
          groups.push({
            kind: "shortcut",
            combo: [...modLabels, keyLabel].join("+"),
            timestamp: actualNext.event.timestamp,
          });
          i = j + 1;
          continue;
        }

        // Standalone modifier(s) with no following key — skip all (noise)
        i = j;
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
        groups.push({
          kind: "shortcut",
          combo: "Enter",
          timestamp: ev.timestamp,
        });
        i++;
        continue;
      }

      // ── Escape → show as action ─────────────────────────────────────────
      if (key === "Escape") {
        flushTyping();
        groups.push({
          kind: "shortcut",
          combo: "Escape",
          timestamp: ev.timestamp,
        });
        i++;
        continue;
      }

      // ── Tab, arrows, function keys → drop (navigation noise) ───────────
      if (
        key === "Tab" ||
        key === "Up" ||
        key === "Down" ||
        key === "Left" ||
        key === "Right" ||
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

// ── Page component ────────────────────────────────────────────────────────

export default function AnnotateSessionPage() {
  const router = useRouter();
  const { activeWorkspace } = useStore();

  const [session, setSession] = useState<SessionData | null>(null);
  const [screenshots, setScreenshots] = useState<LoadedScreenshot[]>([]);
  const [groupedEntries, setGroupedEntries] = useState<GroupedEntry[]>([]);
  const [title, setTitle] = useState("");
  const [titleWasEdited, setTitleWasEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [bugReport, setBugReport] = useState<BugReport | null>(null);
  const [severity, setSeverity] = useState<BugReport["severity"] | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const navigatePreview = useCallback(
    (dir: 1 | -1) => {
      if (!session) return;
      setPreviewIndex((i) => {
        if (i === null) return null;
        const next = i + dir;
        if (next < 0 || next >= session.screenshots.length) return i;
        return next;
      });
    },
    [session]
  );

  useEffect(() => {
    if (previewIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") navigatePreview(1);
      if (e.key === "ArrowLeft") navigatePreview(-1);
      if (e.key === "Escape") setPreviewIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewIndex, navigatePreview]);

  useEffect(() => {
    // Ensure the window is maximized when this page mounts.
    // We must check isMaximized() first because window:maximize is a toggle —
    // calling it on an already-maximized window would unmaximize it (shrink to
    // the 1200×800 creation size).
    window.api
      .isMaximized?.()
      .then((already) => {
        if (!already) window.api.maximizeWindow?.().catch(() => {});
      })
      .catch(() => {});
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
        `Session ${start.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}`
      );

      const loaded: LoadedScreenshot[] = [];
      for (const s of data.screenshots) {
        try {
          const imgResult = await window.api.readImageFile(s.file_path);
          if (imgResult?.success && imgResult.data) {
            loaded.push({
              id: s.id,
              dataUrl: imgResult.data,
              timestamp: s.timestamp,
            });
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

  /** Format a BugReport into markdown for the description textarea */
  function formatBugReportMarkdown(report: BugReport): string {
    const lines: string[] = [];
    lines.push(`## Summary\n${report.summary}`);
    if (report.steps.length > 0) {
      lines.push(
        `\n## Steps to Reproduce\n${report.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      );
    }
    lines.push(`\n## Expected Behavior\n${report.expected}`);
    lines.push(`\n## Actual Behavior\n${report.actual}`);
    return lines.join("\n");
  }

  /** Build a plain-text narrative of the session for AI context */
  function buildTimelineNarrative(
    sessionData: SessionData,
    entryGroups: GroupedEntry[]
  ): string {
    const lines: string[] = [];
    const durationSec = Math.round(
      ((sessionData.end_time ?? Date.now()) - sessionData.start_time) / 1000
    );
    lines.push(
      `Session duration: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
    );
    if (sessionData.environment) {
      lines.push(
        `Environment: ${sessionData.environment.os} · ${sessionData.environment.screen} · App v${sessionData.environment.appVersion}`
      );
    }
    lines.push("---");
    for (const entry of entryGroups) {
      const t = formatRelative(entry.timestamp, sessionData.start_time);
      if (entry.kind === "navigation") {
        const loc = entry.to.url
          ? `${entry.to.appName} — ${entry.to.url}`
          : `${entry.to.appName} — "${entry.to.windowTitle}"`;
        lines.push(`${t}  ↳ Navigated to: ${loc}`);
      } else if (entry.kind === "typed") {
        lines.push(`${t}  ⌨ Typed: "${entry.text}"`);
      } else if (entry.kind === "click") {
        const btn =
          entry.button === 2
            ? "Right-clicked"
            : entry.button === 3
              ? "Middle-clicked"
              : "Left-clicked";
        lines.push(`${t}  🖱 ${btn}`);
      } else if (entry.kind === "shortcut") {
        lines.push(`${t}  ⌨ Key: ${entry.combo}`);
      } else if (entry.kind === "screenshot") {
        lines.push(`${t}  📸 Screenshot captured`);
      }
    }
    return lines.join("\n");
  }

  async function generateWithAi(data?: SessionData, groups?: GroupedEntry[]) {
    const sessionData = data ?? session;
    const entryGroups = groups ?? groupedEntries;
    if (!sessionData) return;

    setAiGenerating(true);
    setAiError(null);

    try {
      const typedTexts = entryGroups
        .filter(
          (g): g is Extract<GroupedEntry, { kind: "typed" }> =>
            g.kind === "typed"
        )
        .map((g) => g.text);
      const shortcuts = entryGroups
        .filter(
          (g): g is Extract<GroupedEntry, { kind: "shortcut" }> =>
            g.kind === "shortcut"
        )
        .map((g) => g.combo);
      const clickCount = entryGroups.filter((g) => g.kind === "click").length;

      // Collect per-screenshot window metadata
      const windowContexts = sessionData.screenshots
        .map((s) => s.windowMeta)
        .filter((m): m is WindowMeta => !!m);

      // Build a structured text narrative to be the primary AI context
      const timelineNarrative = buildTimelineNarrative(sessionData, entryGroups);

      const result = await window.api.aiGenerateDescription({
        screenshotPaths: sessionData.screenshots.map((s) => s.file_path),
        typedTexts,
        shortcuts,
        clickCount,
        durationMs:
          (sessionData.end_time ?? Date.now()) - sessionData.start_time,
        windowContexts: windowContexts.length > 0 ? windowContexts : undefined,
        timeline: timelineNarrative,
        environment: sessionData.environment,
      });

      if (result?.success && result.data) {
        const report = result.data as BugReport;
        setBugReport(report);
        setSeverity(report.severity);
        setDescription(formatBugReportMarkdown(report));
        // Pre-fill title only if the user hasn't edited it yet
        if (!titleWasEdited && report.title) {
          setTitle(report.title);
        }
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
      // Append severity to description so it survives in Zoho / GitHub
      let finalDescription = description.trim() || undefined;
      if (severity && finalDescription) {
        finalDescription = `${finalDescription}\n\n## Severity\n${severity.charAt(0).toUpperCase() + severity.slice(1)}`;
      } else if (severity && !finalDescription) {
        finalDescription = `## Severity\n${severity.charAt(0).toUpperCase() + severity.slice(1)}`;
      }

      const result = await window.api.saveSessionSnap(
        title.trim(),
        finalDescription,
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push("/home")}
        >
          Go Home
        </Button>
      </div>
    );
  }

  const duration = formatDuration(session.start_time, session.end_time);
  const screenshotCount = session.screenshots.length;

  const sessionDate = new Date(session.start_time).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <Head>
        <title>Review Session – SnapFlow</title>
      </Head>

      <div
        className="bg-gray-950 flex flex-col overflow-hidden pt-8"
        style={{ height: "100vh" }}
      >
        {/* ── App header bar ── */}
        <div className="bg-gray-900 border-b border-gray-800 flex-shrink-0 h-11 flex items-center px-4">
          <div className="flex items-center justify-between w-full gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-5 h-5 bg-blue-600/20 border border-blue-500/30 rounded flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-3 h-3 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8.5A1.5 1.5 0 014.5 7h8A1.5 1.5 0 0114 8.5v7A1.5 1.5 0 0112.5 17h-8A1.5 1.5 0 013 15.5v-7z"
                  />
                </svg>
              </div>
              <h1 className="text-xs font-semibold text-gray-200">
                Review Session
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/home")}
              >
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

        {/* ── Body: two-column ── */}
        <div className="flex flex-row-reverse flex-1 overflow-hidden min-h-0">
          {/* Form panel — visually on the right via flex-row-reverse */}
          <div className="w-[480px] flex-shrink-0 border-l border-gray-800 bg-gray-900/30 flex flex-col overflow-hidden">
            {/* Session meta — compact rows */}
            <div className="px-4 py-2.5 border-b border-gray-800/60 flex-shrink-0">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Session Info
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                <MetaRow
                  icon={
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                  label="Date"
                  value={sessionDate}
                />
                <MetaRow
                  icon={
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                  label="Duration"
                  value={duration}
                />
                <MetaRow
                  icon={
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                  label="Screenshots"
                  value={String(session.screenshots.length)}
                />
              </div>
              {/* Environment block */}
              {session.environment && (
                <div className="mt-2 pt-2 border-t border-gray-800/60 flex flex-wrap gap-x-4 gap-y-1">
                  <MetaRow
                    icon={
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                      </svg>
                    }
                    label="OS"
                    value={session.environment.os}
                  />
                  <MetaRow
                    icon={
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    }
                    label="Screen"
                    value={session.environment.screen}
                  />
                  <MetaRow
                    icon={
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    }
                    label="App"
                    value={`v${session.environment.appVersion}`}
                  />
                </div>
              )}
            </div>

            {/* Title + description form */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0">
              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Title */}
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                  Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Login flow – forgot password bug"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleWasEdited(true);
                  }}
                  className="input text-sm w-full"
                />
              </div>

              {/* Severity selector */}
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                  Severity
                </label>
                <div className="flex gap-1.5">
                  {(["critical", "high", "medium", "low"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeverity(s)}
                      className={[
                        "flex-1 py-1 rounded text-[11px] font-semibold capitalize transition-all border",
                        severity === s
                          ? s === "critical"
                            ? "bg-red-600/30 border-red-500/60 text-red-300"
                            : s === "high"
                              ? "bg-orange-600/30 border-orange-500/60 text-orange-300"
                              : s === "medium"
                                ? "bg-yellow-600/30 border-yellow-500/60 text-yellow-300"
                                : "bg-blue-600/20 border-blue-500/40 text-blue-300"
                          : "bg-transparent border-gray-700/60 text-gray-500 hover:border-gray-600 hover:text-gray-400",
                      ].join(" ")}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {bugReport && (
                  <p className="text-[10px] text-gray-600 mt-1">
                    AI suggested · click to change
                  </p>
                )}
              </div>

              {/* AI-generated structured sections (collapsible preview) */}
              {bugReport && (
                <div className="rounded-lg border border-gray-700/40 bg-gray-900/40 text-[11px] text-gray-400 divide-y divide-gray-800/60 flex-shrink-0">
                  {bugReport.steps.length > 0 && (
                    <div className="px-3 py-2">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Steps to Reproduce
                      </p>
                      <ol className="space-y-0.5 list-none">
                        {bugReport.steps.map((step, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-gray-600 flex-shrink-0 w-3.5 text-right">
                              {i + 1}.
                            </span>
                            <span className="text-gray-400 leading-snug">
                              {step}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  <div className="px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                        Expected
                      </p>
                      <p className="text-gray-400 leading-snug">
                        {bugReport.expected}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                        Actual
                      </p>
                      <p className="text-gray-400 leading-snug">
                        {bugReport.actual}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Description
                  </label>
                  <button
                    onClick={() => generateWithAi()}
                    disabled={aiGenerating}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    {aiGenerating ? (
                      <>
                        <svg
                          className="w-3 h-3 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Analysing…
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        {description ? "Regenerate" : "Generate with AI"}
                      </>
                    )}
                  </button>
                </div>
                <div className="relative flex-1 min-h-0">
                  <textarea
                    placeholder="Describe what was being tested, any bugs observed, or the purpose of this session…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={aiGenerating}
                    className="input text-sm resize-none leading-relaxed w-full h-full min-h-[140px]"
                    style={{ minHeight: "140px" }}
                  />
                  {aiGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-gray-900/80 rounded-lg">
                      <div className="w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      <span className="text-xs text-gray-400">
                        Analysing with AI…
                      </span>
                    </div>
                  )}
                </div>
                {aiError && (
                  <p className="text-[11px] text-amber-500/70" title={aiError}>
                    AI unavailable — edit manually
                  </p>
                )}
                {!aiError && !aiGenerating && description && (
                  <p className="text-[11px] text-gray-600">
                    AI-generated · you can edit freely
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Timeline panel — visually on the left via flex-row-reverse */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-gray-950/40">
            {/* Panel header */}
            <div className="px-4 pt-3 pb-2.5 border-b border-gray-800/60 flex-shrink-0 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Activity Timeline
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {groupedEntries.filter((g) => g.kind !== "navigation").length} steps ·{" "}
                  {screenshotCount} screenshot{screenshotCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Activity list */}
            <div className="flex-1 overflow-y-auto min-h-0 px-3">
              {groupedEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                  <div className="w-10 h-10 rounded-xl bg-gray-800/60 border border-gray-700/50 flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">No activity recorded</p>
                </div>
              ) : (
                <TimelineLayout animate size="sm" iconSize="sm">
                  {/* Session start */}
                  <TimelineItem
                    iconColor="primary"
                    icon={
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    }
                    title="Session started"
                    description={
                      <TimelineDescription>{formatTime(session.start_time)}</TimelineDescription>
                    }
                  />

                  {/* All activity entries — typed, click, shortcut, navigation, screenshot */}
                  {groupedEntries.map((entry, idx) => {
                    const relTime = formatRelative(entry.timestamp, session.start_time);

                    if (entry.kind === "navigation") {
                      const loc = entry.to.url
                        ? entry.to.url
                        : entry.to.windowTitle !== entry.to.appName
                          ? entry.to.windowTitle
                          : entry.to.appName;
                      return (
                        <TimelineItem
                          key={`nav-${idx}`}
                          iconColor="warning"
                          icon={
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          }
                          title={
                            <span className="text-amber-400/90 font-medium">
                              {entry.to.appName}
                            </span>
                          }
                          description={
                            <TimelineContent>
                              <TimelineDescription>
                                <span className="text-gray-600">{relTime}</span>
                              </TimelineDescription>
                              <p className="text-[10px] text-gray-500 truncate mt-0.5" title={loc}>{loc}</p>
                            </TimelineContent>
                          }
                        />
                      );
                    }

                    if (entry.kind === "typed") {
                      return (
                        <TimelineItem
                          key={`typed-${idx}`}
                          iconColor="secondary"
                          icon={
                            <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          }
                          title="Typed text"
                          description={
                            <TimelineContent>
                              <TimelineDescription>
                                <span className="text-gray-600">{relTime}</span>
                              </TimelineDescription>
                              <p className="text-xs font-mono text-emerald-400/80 bg-emerald-900/10 border border-emerald-800/20 rounded px-2 py-0.5 mt-1 break-all">
                                {entry.text}
                              </p>
                            </TimelineContent>
                          }
                        />
                      );
                    }

                    if (entry.kind === "click") {
                      const label =
                        entry.button === 2
                          ? "Right-click"
                          : entry.button === 3
                            ? "Middle-click"
                            : "Left-click";
                      return (
                        <TimelineItem
                          key={`click-${idx}`}
                          iconColor="secondary"
                          icon={
                            <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                            </svg>
                          }
                          title={label}
                          description={
                            <TimelineDescription>
                              <span className="text-gray-600">{relTime}</span>
                            </TimelineDescription>
                          }
                        />
                      );
                    }

                    if (entry.kind === "shortcut") {
                      return (
                        <TimelineItem
                          key={`shortcut-${idx}`}
                          iconColor="secondary"
                          icon={
                            <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                            </svg>
                          }
                          title={
                            <span className="font-mono text-xs text-blue-300/90 bg-blue-900/20 border border-blue-800/30 rounded px-1.5 py-0.5">
                              {entry.combo}
                            </span>
                          }
                          description={
                            <TimelineDescription>
                              <span className="text-gray-600">{relTime}</span>
                            </TimelineDescription>
                          }
                        />
                      );
                    }

                    if (entry.kind === "screenshot") {
                      const shotIndex = session.screenshots.findIndex((s) => s.id === entry.id);
                      const loaded = screenshots.find((s) => s.id === entry.id);
                      const displayIdx = shotIndex >= 0 ? shotIndex : idx;
                      return (
                        <TimelineItem
                          key={`shot-${entry.id}`}
                          iconColor="accent"
                          icon={
                            <span className="text-[9px] font-bold text-white leading-none">
                              {shotIndex + 1}
                            </span>
                          }
                          title={`Screenshot ${shotIndex + 1}`}
                          description={
                            <TimelineContent>
                              <TimelineDescription>
                                {formatTime(entry.timestamp)}
                                <span className="ml-2 text-gray-700">{relTime}</span>
                              </TimelineDescription>
                              {loaded?.dataUrl ? (
                                <button
                                  onClick={() => setPreviewIndex(displayIdx)}
                                  className="w-full rounded-lg overflow-hidden border border-gray-700/50 hover:border-indigo-500/60 transition-all group relative block cursor-zoom-in mt-1.5"
                                >
                                  <img
                                    src={loaded.dataUrl}
                                    alt={`Screenshot ${shotIndex + 1}`}
                                    className="w-full block"
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 rounded-full p-2.5 shadow-lg">
                                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                      </svg>
                                    </div>
                                  </div>
                                </button>
                              ) : (
                                <div className="w-full h-24 rounded-lg border border-gray-800/60 bg-gray-900/60 flex items-center justify-center mt-1.5">
                                  <div className="w-4 h-4 border-2 border-gray-700 border-t-gray-500 rounded-full animate-spin" />
                                </div>
                              )}
                            </TimelineContent>
                          }
                        />
                      );
                    }

                    return null;
                  })}

                  {/* Session end */}
                  {session.end_time && (
                    <TimelineItem
                      iconColor="secondary"
                      icon={
                        <svg className="w-3 h-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      }
                      title="Session ended"
                      description={
                        <TimelineDescription>{formatTime(session.end_time)}</TimelineDescription>
                      }
                    />
                  )}
                </TimelineLayout>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Screenshot preview dialog ── */}
      <Dialog
        open={previewIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewIndex(null);
        }}
      >
        <DialogContent
          className="max-w-5xl w-[90vw] bg-gray-950 border border-gray-800 rounded-xl p-0 overflow-hidden shadow-2xl"
          hideCloseButton
        >
          <DialogVisuallyHidden>
            <DialogTitle>Screenshot Preview</DialogTitle>
          </DialogVisuallyHidden>

          {previewIndex !== null &&
            (() => {
              const shot = session.screenshots[previewIndex];
              const loaded = screenshots.find((s) => s.id === shot?.id);
              const total = session.screenshots.length;
              return (
                <>
                  {/* Image */}
                  <div className="relative bg-black">
                    {loaded?.dataUrl ? (
                      <img
                        src={loaded.dataUrl}
                        alt={`Screenshot ${previewIndex + 1}`}
                        className="w-full block max-h-[80vh] object-contain"
                      />
                    ) : (
                      <div className="h-64 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
                      </div>
                    )}

                    {/* Prev button */}
                    {previewIndex > 0 && (
                      <button
                        onClick={() => navigatePreview(-1)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 flex items-center justify-center text-white transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                      </button>
                    )}

                    {/* Next button */}
                    {previewIndex < total - 1 && (
                      <button
                        onClick={() => navigatePreview(1)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 flex items-center justify-center text-white transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Footer bar */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-800 bg-gray-900/80">
                    <p className="text-xs font-medium text-gray-300">
                      Screenshot {previewIndex + 1}
                      <span className="text-gray-600 ml-1">
                        — {formatTime(shot.timestamp)}
                      </span>
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 tabular-nums">
                        {previewIndex + 1} / {total}
                      </span>
                      <button
                        onClick={() => setPreviewIndex(null)}
                        className="text-gray-500 hover:text-gray-200 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-gray-600 flex-shrink-0">{icon}</span>
      <span className="text-[11px] text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-[11px] text-gray-300 font-medium truncate">
        {value}
      </span>
    </div>
  );
}

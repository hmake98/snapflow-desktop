import React, { useEffect, useState, useCallback } from "react";

interface Display {
  id: number;
  label: string;
  bounds: {
    width: number;
    height: number;
    x: number;
    y: number;
  };
  scaleFactor: number;
  isPrimary: boolean;
}

export function DisplaysSection() {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [defaultScreenId, setDefaultScreenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [displaysResult, defaultResult] = await Promise.all([
        window.api.getAvailableDisplays(),
        window.api.getDefaultCaptureScreen(),
      ]);
      if (displaysResult.success) setDisplays(displaysResult.data || []);
      if (defaultResult.success) setDefaultScreenId(defaultResult.data ?? null);
    } catch {
      console.error("Failed to load display settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Live-reload when the OS reports a display change (plug / unplug / scale)
    const unsubChanged = window.api.onDisplaysChanged?.((data) => {
      setDisplays(data.displays);
    });

    // Auto-clear notification when a saved default display is removed
    const unsubCleared = window.api.onDisplayDefaultCleared?.((data) => {
      setDefaultScreenId(null);
      showToast(
        `Display #${data.removedDisplayId} was disconnected — captures will now follow your cursor automatically.`
      );
    });

    return () => {
      unsubChanged?.();
      unsubCleared?.();
    };
  }, [loadData, showToast]);

  const handleSetDefault = async (displayId: number) => {
    setSaving(displayId);
    try {
      const result = await window.api.setDefaultCaptureScreen(displayId);
      if (result.success) setDefaultScreenId(displayId);
    } catch {
      console.error("Failed to set default screen");
    } finally {
      setSaving(null);
    }
  };

  const handleClearDefault = async () => {
    setSaving(-1);
    try {
      const result = await window.api.clearDefaultCaptureScreen();
      if (result.success) setDefaultScreenId(null);
    } catch {
      console.error("Failed to clear default screen");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-blue-500 animate-spin"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span className="text-sm text-gray-400">Loading displays…</span>
        </div>
      </div>
    );
  }

  const isMulti = displays.length > 1;
  const hasDefault = defaultScreenId !== null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Multi-Screen Capture
        </span>
        {isMulti && hasDefault && (
          <button
            onClick={handleClearDefault}
            disabled={saving === -1}
            className="text-xs text-gray-500 hover:text-gray-200 disabled:opacity-40 transition-colors"
          >
            {saving === -1 ? "Clearing…" : "Switch to Auto"}
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Toast */}
        {toast && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-lg">
            <svg
              className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-xs text-amber-300">{toast}</span>
          </div>
        )}

        {/* Auto-mode callout */}
        {isMulti && !hasDefault && (
          <div className="flex items-start gap-2 px-3 py-2 bg-blue-500/8 border border-blue-500/20 rounded-lg">
            <svg
              className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"
              />
            </svg>
            <div>
              <p className="text-xs font-semibold text-blue-300">
                Auto mode active
              </p>
              <p className="text-2xs text-blue-400/70 mt-0.5">
                Captures whichever display your cursor is on. Pin a display
                below to always capture a specific screen.
              </p>
            </div>
          </div>
        )}

        {/* Display list */}
        {displays.length === 0 ? (
          <p className="text-xs text-gray-500 py-2 text-center">
            No displays detected.
          </p>
        ) : displays.length === 1 ? (
          <div className="flex items-center justify-between px-3 py-2.5 bg-gray-900/50 rounded-lg border border-blue-500/30">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-100">
                  {displays[0].label}
                </p>
                <p className="text-xs text-gray-400">
                  {displays[0].bounds.width} × {displays[0].bounds.height}
                  {displays[0].scaleFactor !== 1 &&
                    ` · ${displays[0].scaleFactor}× scale`}
                </p>
              </div>
            </div>
            <span className="text-2xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">
              Active
            </span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {displays.map((display) => {
              const isPinned = display.id === defaultScreenId;
              const isSaving = saving === display.id;
              return (
                <div
                  key={display.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${
                    isPinned
                      ? "bg-blue-500/5 border-blue-500/30"
                      : "bg-gray-900/50 border-gray-700/30"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        isPinned
                          ? "bg-blue-500"
                          : display.isPrimary
                            ? "bg-gray-400"
                            : "bg-gray-600"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-gray-100">
                          {display.label}
                        </span>
                        {isPinned && (
                          <span className="text-2xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                            Pinned
                          </span>
                        )}
                        {!isPinned && !hasDefault && (
                          <span className="text-2xs text-gray-500 bg-gray-700/40 border border-gray-700/50 px-1.5 py-0.5 rounded-full">
                            Auto
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {display.bounds.width} × {display.bounds.height}
                        {display.scaleFactor !== 1 &&
                          ` · ${display.scaleFactor}× scale`}
                        {(display.bounds.x !== 0 || display.bounds.y !== 0) && (
                          <span className="text-gray-600">
                            {" · offset "}
                            {display.bounds.x >= 0 ? "+" : ""}
                            {display.bounds.x},{" "}
                            {display.bounds.y >= 0 ? "+" : ""}
                            {display.bounds.y}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {!isPinned && (
                    <button
                      onClick={() => handleSetDefault(display.id)}
                      disabled={isSaving}
                      className="ml-3 flex-shrink-0 text-xs font-medium text-gray-300 hover:text-white bg-gray-700/70 hover:bg-gray-600 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {isSaving ? "Saving…" : "Pin"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Help text */}
        <div className="text-xs text-gray-500 space-y-0.5 pt-1">
          {isMulti ? (
            <>
              <p>
                • <span className="text-gray-400 font-medium">Auto mode</span>{" "}
                captures whichever display your cursor is on.
              </p>
              <p>
                •{" "}
                <span className="text-gray-400 font-medium">Pin a display</span>{" "}
                to always capture it regardless of cursor position.
              </p>
            </>
          ) : (
            <p>
              • Multi-screen options appear automatically when you connect an
              external display.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
  };

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
        <div className="flex items-center space-x-2">
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
          <span className="text-gray-400">Loading displays...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-100">
            Multi-Screen Capture
          </h3>
          <p className="text-sm text-gray-400">
            Manage and test multi-screen capture functionality
          </p>
        </div>
      </div>

      <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
        <div className="flex items-center space-x-2 mb-3">
          <svg
            className="w-5 h-5 text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <span className="font-medium text-gray-100">
            {displays.length === 1
              ? "Single Display Detected"
              : `${displays.length} Displays Detected`}
          </span>
        </div>

        {displays.length === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">
              Only one display is currently connected. Multi-screen capture
              options will appear when additional displays are connected.
            </p>
            <div
              key={displays[0].id}
              className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-blue-500/40"
            >
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <div>
                  <div className="text-sm font-medium text-gray-100">
                    {displays[0].label}
                  </div>
                  <div className="text-xs text-gray-400">
                    {displays[0].bounds.width} × {displays[0].bounds.height}
                    {displays[0].scaleFactor !== 1 &&
                      ` (${displays[0].scaleFactor}x)`}
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-1 rounded">
                Default
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Select a default screen for &quot;Capture Current App
                Screen&quot;. If none is selected, the screen under your cursor
                is used.
              </p>
              {defaultScreenId !== null && (
                <button
                  onClick={handleClearDefault}
                  disabled={saving === -1}
                  className="ml-4 shrink-0 text-xs text-gray-400 hover:text-gray-200 underline disabled:opacity-50 transition-colors"
                >
                  {saving === -1 ? "Clearing..." : "Clear default"}
                </button>
              )}
            </div>

            <div className="grid gap-3">
              {displays.map((display) => {
                const isDefault = display.id === defaultScreenId;
                const isSaving = saving === display.id;
                return (
                  <div
                    key={display.id}
                    className={`flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border transition-colors ${
                      isDefault ? "border-blue-500/40" : "border-gray-700/30"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          isDefault
                            ? "bg-blue-500"
                            : display.isPrimary
                              ? "bg-gray-400"
                              : "bg-gray-600"
                        }`}
                      />
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-100">
                            {display.label}
                          </span>
                          {isDefault && (
                            <span className="text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {display.bounds.width} × {display.bounds.height}
                          {display.scaleFactor !== 1 &&
                            ` (${display.scaleFactor}x)`}
                        </div>
                      </div>
                    </div>
                    {!isDefault && (
                      <button
                        onClick={() => handleSetDefault(display.id)}
                        disabled={isSaving}
                        className="text-xs font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                      >
                        {isSaving ? "Saving..." : "Set as Default"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <p>
          • Set a default screen to always use it for &quot;Capture Current App
          Screen&quot;
        </p>
        <p>• Without a default, the screen under your cursor is captured</p>
        <p>• Capture options are available from the system tray menu</p>
      </div>
    </div>
  );
}

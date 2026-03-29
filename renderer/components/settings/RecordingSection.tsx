import React, { useState, useEffect, useCallback } from "react";
import type { RecordingSource, SourcesWithDefaultPayload } from "../../types";

/**
 * RecordingSection - Settings component for managing default recording source.
 * Shows all currently active screens and windows with live thumbnails.
 * Users can set/clear the default recording source used by Ctrl+Shift+R.
 */
export function RecordingSection() {
  const [sources, setSources] = useState<RecordingSource[]>([]);
  const [validatedDefault, setValidatedDefault] =
    useState<RecordingSource | null>(null);
  const [defaultWasInvalid, setDefaultWasInvalid] = useState(false);
  const [invalidSourceName, setInvalidSourceName] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const loadSources = useCallback(async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const result = await window.api.getRecordingSourcesWithDefault();
      if (result.success && result.data) {
        const payload = result.data as SourcesWithDefaultPayload;
        setSources(payload.sources);
        setValidatedDefault(payload.validatedDefault);
        setDefaultWasInvalid(payload.defaultWasInvalid);
        setInvalidSourceName(payload.invalidSourceName);
      }
    } catch (err) {
      console.error("[RecordingSection] Failed to load sources:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSources(false);
  }, [loadSources]);

  const handleSetDefault = async (source: RecordingSource) => {
    setSettingId(source.id);
    try {
      await window.api.setDefaultRecordingSource({
        id: source.id,
        name: source.name,
        type: source.type,
        displayBounds: source.displayBounds ?? null,
      });
      setValidatedDefault(source);
      setDefaultWasInvalid(false);
      setInvalidSourceName(null);
    } catch (err) {
      console.error("[RecordingSection] Failed to set default source:", err);
    } finally {
      setSettingId(null);
    }
  };

  const handleClearDefault = async () => {
    setIsClearing(true);
    try {
      await window.api.clearDefaultRecordingSource();
      setValidatedDefault(null);
      setDefaultWasInvalid(false);
      setInvalidSourceName(null);
    } catch (err) {
      console.error("[RecordingSection] Failed to clear default source:", err);
    } finally {
      setIsClearing(false);
    }
  };

  const screenSources = sources.filter((s) => s.type === "screen");
  const windowSources = sources.filter((s) => s.type === "window");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-gray-400">
          <svg
            className="w-5 h-5 animate-spin"
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
          <span className="text-sm">Loading active sources...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-gray-100">
            Recording Sources
          </h2>
          <button
            onClick={() => loadSources(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors px-2 py-1.5 rounded hover:bg-gray-800 border border-gray-700"
          >
            <svg
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
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
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <p className="text-sm text-gray-400">
          Set a default source for one-click recording (
          <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-gray-300 text-xs font-mono">
            Ctrl+Shift+R
          </kbd>
          ). If the source is no longer active when you record, you&apos;ll be
          asked to select a new one.
        </p>
      </div>

      {/* Invalid default banner */}
      {defaultWasInvalid && invalidSourceName && (
        <div className="flex items-start gap-3 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-300">
          <svg
            className="w-4 h-4 mt-0.5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium">Default source unavailable</p>
            <p className="text-xs text-amber-400 mt-0.5">
              <strong>&quot;{invalidSourceName}&quot;</strong> is no longer
              active. Select a new default below or leave it unset to always
              show the picker.
            </p>
          </div>
          <button
            onClick={() => setDefaultWasInvalid(false)}
            className="text-amber-400 hover:text-amber-200 shrink-0"
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
      )}

      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4 bg-gray-900 rounded-lg border border-gray-800">
          <svg
            className="w-12 h-12 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <div className="text-center">
            <p className="text-gray-300 font-medium mb-1">
              No recording sources found
            </p>
            <p className="text-sm text-gray-500 max-w-xs">
              On macOS, grant Screen Recording permission in System Settings
              &gt; Privacy &amp; Security &gt; Screen Recording, then click
              Refresh.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Screens */}
          {screenSources.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">
                Screens
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {screenSources.map((source) => {
                  const isDefault =
                    validatedDefault?.id === source.id ||
                    (validatedDefault?.type === "screen" &&
                      validatedDefault?.name === source.name);
                  return (
                    <SettingsSourceCard
                      key={source.id}
                      source={source}
                      isDefault={isDefault}
                      isSetting={settingId === source.id}
                      onSetDefault={() => handleSetDefault(source)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Windows */}
          {windowSources.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">
                Windows
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {windowSources.map((source) => {
                  const isDefault =
                    validatedDefault?.id === source.id ||
                    (validatedDefault?.type === "window" &&
                      validatedDefault?.name === source.name);
                  return (
                    <SettingsSourceCard
                      key={source.id}
                      source={source}
                      isDefault={isDefault}
                      isSetting={settingId === source.id}
                      onSetDefault={() => handleSetDefault(source)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clear default */}
      {validatedDefault && (
        <div className="pt-2 border-t border-gray-800">
          <button
            onClick={handleClearDefault}
            disabled={isClearing}
            className="text-sm text-gray-400 hover:text-red-400 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <svg
              className="w-3.5 h-3.5"
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
            {isClearing ? "Clearing..." : "Clear default source"}
          </button>
          <p className="text-xs text-gray-600 mt-1">
            Next recording will always show the source picker
          </p>
        </div>
      )}
    </div>
  );
}

function SettingsSourceCard({
  source,
  isDefault,
  isSetting,
  onSetDefault,
}: {
  source: RecordingSource;
  isDefault: boolean;
  isSetting: boolean;
  onSetDefault: () => void;
}) {
  return (
    <div
      className={`bg-gray-800/60 border rounded-lg overflow-hidden transition-colors ${
        isDefault
          ? "border-blue-500 ring-1 ring-blue-500/30"
          : "border-gray-700"
      }`}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-900 relative overflow-hidden flex items-center justify-center">
        {source.thumbnail ? (
          <img
            src={source.thumbnail}
            alt={source.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-gray-600 text-center">
            <svg
              className="w-10 h-10 mx-auto mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <p className="text-xs">No preview</p>
          </div>
        )}
        {isDefault && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded font-medium">
            <svg
              className="w-2.5 h-2.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Default
          </div>
        )}
      </div>

      {/* Info + Action */}
      <div className="p-3 border-t border-gray-700">
        <p className="text-sm font-medium text-gray-100 truncate mb-0.5">
          {source.name}
        </p>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">
            {source.type === "screen" ? "Screen" : "Window"}
          </span>
          {source.resolution && (
            <>
              <span className="text-gray-600 text-xs">·</span>
              <span className="text-xs text-gray-500">{source.resolution}</span>
            </>
          )}
        </div>

        {isDefault ? (
          <div className="flex items-center gap-1.5 text-blue-400 text-xs font-medium">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Set as default
          </div>
        ) : (
          <button
            onClick={onSetDefault}
            disabled={isSetting}
            className="w-full text-xs text-center py-1.5 px-3 rounded border border-gray-600 text-gray-300 hover:border-blue-500 hover:text-blue-400 disabled:opacity-50 transition-colors"
          >
            {isSetting ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg
                  className="w-3 h-3 animate-spin"
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
                Setting...
              </span>
            ) : (
              "Set as Default"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

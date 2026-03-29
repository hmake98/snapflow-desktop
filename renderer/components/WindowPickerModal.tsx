import React, { useState, useEffect } from "react";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/Dialog";
import type { RecordingSource, ShowPickerPayload } from "../types";

interface WindowPickerModalProps {
  isOpen: boolean;
  initialPayload: ShowPickerPayload | null;
  onSelect: (
    source: RecordingSource,
    setAsDefault: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
}

/**
 * WindowPickerModal - Displays available screens and windows for recording.
 * Handles invalid-default notifications, refresh, and selection errors inline.
 */
export function WindowPickerModal({
  isOpen,
  initialPayload,
  onSelect,
  onCancel,
}: WindowPickerModalProps) {
  const [sources, setSources] = useState<RecordingSource[]>([]);
  const [validatedDefault, setValidatedDefault] =
    useState<RecordingSource | null>(null);
  const [defaultWasInvalid, setDefaultWasInvalid] = useState(false);
  const [invalidSourceName, setInvalidSourceName] = useState<string | null>(
    null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [defaultChecked, setDefaultChecked] = useState(true);

  // Initialize state from payload when modal opens
  useEffect(() => {
    if (isOpen && initialPayload) {
      setSources(initialPayload.sources);
      setValidatedDefault(initialPayload.validatedDefault);
      setDefaultWasInvalid(initialPayload.defaultWasInvalid);
      setInvalidSourceName(initialPayload.invalidSourceName);
      setSelectionError(null);
      // Pre-check "set as default" when no valid default exists
      setDefaultChecked(!initialPayload.validatedDefault);
    }
    if (!isOpen) {
      setSelectionError(null);
    }
  }, [isOpen, initialPayload]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSelectionError(null);
    try {
      const result = await window.api.getRecordingSourcesWithDefault();
      if (result.success && result.data) {
        setSources(result.data.sources);
        setValidatedDefault(result.data.validatedDefault);
        // Don't dismiss invalid-default banner on refresh — user dismisses it manually
      }
    } catch {
      // Silently fail on refresh error
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectSource = async (source: RecordingSource) => {
    if (isSelecting) return;
    setIsSelecting(true);
    setSelectionError(null);
    try {
      const result = await onSelect(source, defaultChecked);
      if (!result.success && result.error) {
        setSelectionError(result.error);
      }
      // On success, parent closes the modal
    } finally {
      setIsSelecting(false);
    }
  };

  const screenSources = sources.filter((s) => s.type === "screen");
  const windowSources = sources.filter((s) => s.type === "window");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between pr-8">
          <DialogTitle>Select Recording Source</DialogTitle>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isSelecting}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors px-2 py-1 rounded hover:bg-gray-800"
            title="Refresh sources"
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
        </DialogHeader>

        {/* Invalid default source banner */}
        {defaultWasInvalid && invalidSourceName && (
          <div className="flex items-start gap-3 p-3 mb-1 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-300">
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
            <p className="text-sm flex-1">
              <strong>&quot;{invalidSourceName}&quot;</strong> is no longer
              active. Please select a new recording source below.
            </p>
            <button
              onClick={() => setDefaultWasInvalid(false)}
              className="text-amber-400 hover:text-amber-200 shrink-0 mt-0.5"
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

        {/* Selection error banner */}
        {selectionError && (
          <div className="flex items-start gap-3 p-3 mb-1 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300">
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
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm flex-1">{selectionError}</p>
            <button
              onClick={() => setSelectionError(null)}
              className="text-red-400 hover:text-red-200 shrink-0 mt-0.5"
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
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="text-gray-400 text-center">
              <p className="font-medium mb-2">No recording sources available</p>
              <p className="text-sm text-gray-500 max-w-xs">
                If you&apos;re on macOS, please grant Screen Recording
                permission in System Settings &gt; Privacy &amp; Security &gt;
                Screen Recording, then restart the app.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Screens Section */}
            {screenSources.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">
                  Screens
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {screenSources.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      isSelecting={isSelecting}
                      isDefault={
                        validatedDefault?.id === source.id ||
                        (validatedDefault?.type === "screen" &&
                          validatedDefault?.name === source.name)
                      }
                      onSelect={() => handleSelectSource(source)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Windows Section */}
            {windowSources.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">
                  Windows
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {windowSources.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      isSelecting={isSelecting}
                      isDefault={
                        validatedDefault?.id === source.id ||
                        (validatedDefault?.type === "window" &&
                          validatedDefault?.name === source.name)
                      }
                      onSelect={() => handleSelectSource(source)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-gray-700 pt-4 mt-4 space-y-4">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={defaultChecked}
                  onChange={(e) => setDefaultChecked(e.target.checked)}
                  disabled={isSelecting}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 cursor-pointer disabled:opacity-50"
                />
                <span>Remember this selection for next time</span>
              </label>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={onCancel}
                  disabled={isSelecting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SourceCard({
  source,
  isSelecting,
  isDefault,
  onSelect,
}: {
  source: RecordingSource;
  isSelecting: boolean;
  isDefault: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={isSelecting}
      className={`group relative bg-gray-800 border rounded-lg overflow-hidden hover:border-blue-500 transition-colors disabled:opacity-50 ${
        isDefault
          ? "border-blue-500 ring-1 ring-blue-500/50"
          : "border-gray-700"
      }`}
    >
      {/* Default badge */}
      {isDefault && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded font-medium">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Default
        </div>
      )}

      {/* Thumbnail */}
      <div className="aspect-video bg-gray-900 relative overflow-hidden flex items-center justify-center">
        {source.thumbnail ? (
          <img
            src={source.thumbnail}
            alt={source.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="text-gray-500 text-center">
            <svg
              className="w-12 h-12 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-xs">Preview unavailable</p>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </div>

      {/* Label */}
      <div className="p-3 border-t border-gray-700">
        <p className="text-sm font-medium text-gray-100 truncate">
          {source.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-gray-500">
            {source.type === "screen" ? "Screen" : "Window"}
          </p>
          {source.resolution && (
            <>
              <span className="text-gray-600 text-xs">·</span>
              <p className="text-xs text-gray-500">{source.resolution}</p>
            </>
          )}
        </div>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="text-white font-medium bg-blue-600/80 px-3 py-1.5 rounded-lg text-sm">
          Select
        </div>
      </div>
    </button>
  );
}

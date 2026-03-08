import React, { useState } from "react";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/Dialog";

interface RecordingSource {
  id: string;
  name: string;
  type: "screen" | "window";
  thumbnail: string;
  displayBounds?: { x: number; y: number; width: number; height: number };
}

interface WindowPickerModalProps {
  isOpen: boolean;
  sources: RecordingSource[];
  onSelect: (source: RecordingSource, setAsDefault: boolean) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * WindowPickerModal - Displays available screens and windows for recording
 * Used as a modal dialog within the main window
 */
export function WindowPickerModal({
  isOpen,
  sources,
  onSelect,
  onCancel,
  isLoading = false,
}: WindowPickerModalProps) {
  const [defaultChecked, setDefaultChecked] = useState(true); // Auto-check by default
  const [isSelecting, setIsSelecting] = useState(false);

  const handleSelectSource = async (source: RecordingSource) => {
    setIsSelecting(true);
    try {
      await onSelect(source, defaultChecked);
    } finally {
      setIsSelecting(false);
    }
  };

  const screenSources = (sources || []).filter((s) => s.type === "screen");
  const windowSources = (sources || []).filter((s) => s.type === "window");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Recording Source</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-400">Loading available sources...</div>
          </div>
        ) : !sources || sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="text-gray-400 text-center">
              <p className="font-medium mb-2">No recording sources available</p>
              <p className="text-sm text-gray-500 max-w-xs">
                If you're on macOS, please grant Screen Recording permission in
                System Settings &gt; Privacy &amp; Security &gt; Screen
                Recording, then restart the app.
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
                      onSelect={() => handleSelectSource(source)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-gray-700 pt-4 mt-4 space-y-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={defaultChecked}
                  onChange={(e) => setDefaultChecked(e.target.checked)}
                  disabled={isSelecting}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 cursor-pointer disabled:opacity-50"
                />
                <span>Use as default recording source</span>
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
  onSelect,
}: {
  source: RecordingSource;
  isSelecting: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={isSelecting}
      className="group relative bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-blue-500 transition-colors disabled:opacity-50"
    >
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
        <p className="text-xs text-gray-500 mt-1">
          {source.type === "screen" ? "Screen" : "Window"}
        </p>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="text-white font-medium">Select</div>
      </div>
    </button>
  );
}

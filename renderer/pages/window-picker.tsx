import React, { useEffect, useState } from "react";
import Head from "next/head";
import { Button } from "../components/ui/Button";

interface RecordingSource {
  id: string;
  name: string;
  type: "screen" | "window";
  thumbnail: string;
  displayBounds?: { x: number; y: number; width: number; height: number };
}

export default function WindowPicker() {
  const [sources, setSources] = useState<RecordingSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultChecked, setDefaultChecked] = useState(false);

  useEffect(() => {
    // Listen for sources from main process
    const unsubscribe = window.ipc.on(
      "recording:sources",
      (_event, sourcesData: unknown) => {
        setSources(sourcesData as RecordingSource[]);
        setLoading(false);
      }
    );

    // Clean up listener on unmount
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleSelectSource = async (source: RecordingSource) => {
    // Call IPC to start recording with this source
    const result = await window.api.startRecordingWithSource({
      sourceId: source.id,
      sourceName: source.name,
      displayBounds: source.displayBounds || null,
      setAsDefault: defaultChecked,
    });

    if (!result.success) {
      alert(`Failed to start recording: ${result.error}`);
    }
  };

  const screenSources = sources.filter((s) => s.type === "screen");
  const windowSources = sources.filter((s) => s.type === "window");

  return (
    <>
      <Head>
        <title>Select Recording Source - SnapFlow</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-800 px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-100">
            Select Recording Source
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Choose a screen or window to record
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">Loading sources...</div>
            </div>
          ) : sources.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">No sources available</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Screens Section */}
              {screenSources.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-300 mb-3">
                    Screens
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    {screenSources.map((source) => (
                      <SourceCard
                        key={source.id}
                        source={source}
                        onSelect={handleSelectSource}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Windows Section */}
              {windowSources.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-300 mb-3">
                    Windows
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    {windowSources.map((source) => (
                      <SourceCard
                        key={source.id}
                        source={source}
                        onSelect={handleSelectSource}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 bg-gray-900/50 px-6 py-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={defaultChecked}
              onChange={(e) => setDefaultChecked(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 cursor-pointer"
            />
            <span>Set as default recording source</span>
          </label>
          <Button
            variant="ghost"
            onClick={() => window.api.cancelRecording?.()}
          >
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}

function SourceCard({
  source,
  onSelect,
}: {
  source: RecordingSource;
  onSelect: (source: RecordingSource) => void;
}) {
  return (
    <button
      onClick={() => onSelect(source)}
      className="group relative bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-blue-500 transition-colors"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-900 relative overflow-hidden">
        <img
          src={source.thumbnail}
          alt={source.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        />
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

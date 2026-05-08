import React, { useEffect, useState } from "react";
import Head from "next/head";

interface WindowSource {
  id: string;
  name: string;
  thumbnail?: string;
}

export default function WindowCapture() {
  const [windows, setWindows] = useState<WindowSource[]>([]);
  const [hoveredWindowId, setHoveredWindowId] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for available windows from main process
    const unsubscribeWindows = window.api.onAvailableWindows(
      (availableWindows) => {
        setWindows(availableWindows);
      }
    );

    // Listen for background screenshot
    const unsubscribeScreenshot = window.api.onBackgroundScreenshot(
      (data: { dataUrl: string }) => {
        setBackgroundImage(data.dataUrl);
        setIsLoading(false);
      }
    );

    // Handle escape key to cancel
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.api.cancelWindowSelect();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unsubscribeWindows();
      unsubscribeScreenshot();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleWindowClick = async (windowId: string) => {
    try {
      await window.api.selectWindow(windowId);
    } catch (error) {
      console.error("Failed to capture window:", error);
    }
  };

  return (
    <>
      <Head>
        <title>Select Window - SnapFlow</title>
      </Head>
      <style jsx global>{`
        html,
        body {
          background-color: transparent !important;
        }
      `}</style>
      <div
        className="fixed inset-0 cursor-pointer"
        style={{
          backgroundColor: "transparent",
          backgroundImage: backgroundImage
            ? `url(${backgroundImage})`
            : undefined,
          backgroundSize: "100% 100%",
          backgroundPosition: "top left",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-50">
            <div className="text-white text-lg">
              Loading available windows...
            </div>
          </div>
        )}

        {/* Semi-transparent overlay */}
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />

        {/* Instructions */}
        {!isLoading && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="bg-gray-900/90 backdrop-blur-md border border-gray-700/50 rounded-lg px-5 py-2.5 shadow-2xl">
              <p className="text-white text-sm font-medium text-center">
                Click on a window below to capture it
              </p>
              <p className="text-gray-400 text-xs mt-0.5 text-center">
                Press ESC to cancel
              </p>
            </div>
          </div>
        )}

        {/* Window list - Centered vertical list */}
        {!isLoading && windows.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
            <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto pointer-events-auto">
              <div className="space-y-3 p-6">
                {windows.map((window) => (
                  <div
                    key={window.id}
                    className={`group relative rounded-xl border-2 transition-all duration-200 cursor-pointer overflow-hidden backdrop-blur-sm ${
                      hoveredWindowId === window.id
                        ? "border-blue-500 bg-blue-500/20 scale-[1.02] shadow-2xl shadow-blue-500/50"
                        : "border-white/30 bg-gray-900/60 hover:border-white/50 hover:bg-gray-900/80"
                    }`}
                    onMouseEnter={() => setHoveredWindowId(window.id)}
                    onMouseLeave={() => setHoveredWindowId(null)}
                    onClick={() => handleWindowClick(window.id)}
                  >
                    <div className="flex items-center gap-4 p-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-gray-800/50 border border-white/10">
                        <img
                          src={window.thumbnail}
                          alt={window.name}
                          className="w-full h-full object-contain"
                        />
                      </div>

                      {/* Window Name */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-base font-medium truncate transition-colors ${
                            hoveredWindowId === window.id
                              ? "text-white"
                              : "text-gray-200"
                          }`}
                        >
                          {window.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Click to capture this window
                        </p>
                      </div>

                      {/* Arrow indicator */}
                      <div
                        className={`flex-shrink-0 transition-all duration-200 ${
                          hoveredWindowId === window.id
                            ? "translate-x-1 text-blue-400"
                            : "text-gray-500"
                        }`}
                      >
                        <svg
                          className="w-6 h-6"
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
                      </div>
                    </div>

                    {/* Hover glow effect */}
                    {hoveredWindowId === window.id && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-blue-500/10 animate-pulse" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No windows found */}
        {!isLoading && windows.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-40">
            <div className="bg-gray-900/90 backdrop-blur-md border border-gray-700/50 rounded-lg px-6 py-4 shadow-2xl">
              <p className="text-white text-base font-medium text-center">
                No windows available to capture
              </p>
              <p className="text-gray-400 text-sm mt-2 text-center">
                Press ESC to cancel
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

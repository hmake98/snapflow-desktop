import React, { useEffect, useState, useRef } from "react";
import Head from "next/head";

interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | null;

export default function AreaSelector() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [_isResizing, _setIsResizing] = useState(false);
  const [_resizeHandle, _setResizeHandle] = useState<ResizeHandle>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [_selection, _setSelection] = useState<SelectionBounds | null>(null);

  const handleCancel = async () => {
    try {
      await window.api.cancelRecording();
    } catch (error) {
      console.error("[Area Selector] Failed to cancel:", error);
    }
  };

  useEffect(() => {
    // Handle escape key to cancel
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const getMousePosition = (e: React.MouseEvent): { x: number; y: number } => {
    return {
      x: e.clientX,
      y: e.clientY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getMousePosition(e);
    setIsSelecting(true);
    setStartPos(pos);
    setCurrentPos(pos);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSelecting && startPos) {
      e.preventDefault();
      const pos = getMousePosition(e);
      setCurrentPos(pos);
    }
  };

  const handleMouseUp = async () => {
    if (isSelecting && startPos && currentPos) {
      // Calculate selection bounds
      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);

      // Only proceed if there's a meaningful selection (at least 50x50 pixels)
      if (width >= 50 && height >= 50) {
        try {
          // Scale bounds for high DPI displays
          const scaleFactor = window.devicePixelRatio;
          const scaledBounds = {
            x: Math.round(x * scaleFactor),
            y: Math.round(y * scaleFactor),
            width: Math.round(width * scaleFactor),
            height: Math.round(height * scaleFactor),
          };

          await window.api.recordingAreaSelected(scaledBounds);
        } catch (error) {
          console.error(
            "[Area Selector] Failed to process area selection:",
            error
          );
        }
      }

      // Reset selection
      setIsSelecting(false);
      setStartPos(null);
      setCurrentPos(null);
    }
  };

  // Calculate selection rectangle for display
  const getSelectionRect = (): SelectionBounds | null => {
    if (!startPos || !currentPos) return null;

    return {
      x: Math.min(startPos.x, currentPos.x),
      y: Math.min(startPos.y, currentPos.y),
      width: Math.abs(currentPos.x - startPos.x),
      height: Math.abs(currentPos.y - startPos.y),
    };
  };

  const selectionRect = getSelectionRect();

  return (
    <>
      <Head>
        <title>Select Recording Area - SnapFlow</title>
        <style>{`
          body {
            background: transparent !important;
            overflow: hidden;
          }
          html {
            background: transparent !important;
          }
        `}</style>
      </Head>
      <div
        ref={containerRef}
        className="relative w-screen h-screen overflow-hidden cursor-crosshair"
        style={{ background: "transparent" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Instructions */}
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-gray-900/90 backdrop-blur-sm text-white px-6 py-3 rounded-lg shadow-2xl border border-gray-700">
            <div className="text-center">
              <div className="text-sm font-semibold mb-1">
                Select Recording Area
              </div>
              <div className="text-xs text-gray-400">
                Click and drag to select • Press{" "}
                <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">
                  Esc
                </kbd>{" "}
                to cancel
              </div>
            </div>
          </div>
        </div>

        {/* Selection rectangle */}
        {selectionRect && (
          <>
            {/* Darkened overlay everywhere except selection */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: 0,
                top: 0,
                width: "100vw",
                height: "100vh",
                boxShadow: `0 0 0 ${selectionRect.x}px rgba(0,0,0,0.5) inset,
                           0 0 0 ${selectionRect.y}px rgba(0,0,0,0.5) inset`,
              }}
            />

            {/* Clear area (selected region) */}
            <div
              className="absolute border-3 border-blue-500"
              style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.width,
                height: selectionRect.height,
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
                borderWidth: "3px",
              }}
            >
              {/* Dimension indicator */}
              <div className="absolute -top-8 left-0 bg-blue-600 text-white text-xs px-2 py-1 rounded font-mono">
                {Math.round(selectionRect.width)} ×{" "}
                {Math.round(selectionRect.height)}
              </div>

              {/* Corner handles */}
              <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full"></div>
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
              <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-500 rounded-full"></div>
              <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

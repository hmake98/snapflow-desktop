import React, { useEffect, useState, useRef } from "react";
import Head from "next/head";

interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function AreaCapture() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [selection, setSelection] = useState<SelectionBounds | null>(null);
  const [originOffset, setOriginOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  useEffect(() => {
    // Listen for area capture ready event
    const unsubscribe = window.ipc.on(
      "area-capture-ready",
      (data: { originOffset?: { x: number; y: number } }) => {
        if (data.originOffset) setOriginOffset(data.originOffset);
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
      unsubscribe();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const getMousePosition = (e: React.MouseEvent): { x: number; y: number } => {
    // Use clientX/clientY which are relative to the viewport (overlay window)
    // Since overlay window is positioned at the display origin, these should be screen coords
    const x = e.clientX;
    const y = e.clientY;

    return { x, y };
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
      // Calculate selection bounds in CSS pixels (relative to overlay window)
      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);

      // Only capture if there's a meaningful selection (at least 10x10 pixels)
      if (width >= 10 && height >= 10) {
        const bounds = { x, y, width, height };
        setSelection(bounds);

        try {
          // Use window.devicePixelRatio for accurate scaling on this device
          // This is more reliable than the scaleFactor from main process
          const actualScaleFactor = window.devicePixelRatio;

          // Convert CSS pixels to physical pixels
          const captureParams = {
            x: Math.round(x * actualScaleFactor),
            y: Math.round(y * actualScaleFactor),
            width: Math.round(width * actualScaleFactor),
            height: Math.round(height * actualScaleFactor),
          };


          // Capture screenshot with these coordinates
          await window.api.captureScreenshot({
            mode: "region",
            bounds: captureParams,
            originOffset,
          });
        } catch (error) {
          console.error("Failed to capture area:", error);
        }
      }
    }

    setIsSelecting(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  // Calculate selection rectangle
  const getSelectionStyle = () => {
    if (!startPos || !currentPos) return {};

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const width = Math.abs(currentPos.x - startPos.x);
    const height = Math.abs(currentPos.y - startPos.y);

    return {
      left: x,
      top: y,
      width,
      height,
    };
  };

  const selectionStyle = getSelectionStyle();

  return (
    <>
      <Head>
        <title>Select Area - SnapFlow</title>
      </Head>
      <style jsx global>{`
        html,
        body {
          background-color: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
      <div
        ref={containerRef}
        className="fixed inset-0 cursor-crosshair overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.2)", // Semi-transparent dark overlay
        }}
      >
        {/* Instructions */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-gray-900/90 backdrop-blur-md border border-gray-700/50 rounded-lg px-5 py-2.5 shadow-2xl">
            <p className="text-white text-sm font-medium text-center">
              Click and drag to select an area
            </p>
            <p className="text-gray-400 text-xs mt-0.5 text-center">
              Press ESC to cancel
            </p>
          </div>
        </div>

        {/* Selection rectangle */}
        {(isSelecting || selection) && startPos && currentPos && (
          <>
            {/* Selection border - using box-shadow to avoid affecting bounds */}
            <div
              className="absolute bg-transparent pointer-events-none"
              style={{
                ...selectionStyle,
                boxShadow: "0 0 0 2px #3b82f6 inset",
              }}
            />

            {/* Darken everything except selection */}
            <div className="absolute inset-0 pointer-events-none">
              <svg width="100%" height="100%" className="absolute inset-0">
                <defs>
                  <mask id="selection-mask">
                    <rect width="100%" height="100%" fill="white" />
                    <rect
                      x={selectionStyle.left}
                      y={selectionStyle.top}
                      width={selectionStyle.width}
                      height={selectionStyle.height}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill="rgba(0, 0, 0, 0.5)"
                  mask="url(#selection-mask)"
                />
              </svg>
            </div>
          </>
        )}
      </div>
    </>
  );
}

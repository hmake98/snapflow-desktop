import React, { useEffect, useState, useRef, useCallback } from "react";
import Head from "next/head";

interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeHandle =
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "e"
  | "w"
  | "move"
  | null;

const MIN_SIZE = 100;

export default function RecordingAreaSelector() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [selection, setSelection] = useState<SelectionBounds | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  );
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );

  const handleCancel = useCallback(async () => {
    console.log("[Recording Area Selector] Cancel requested");
    try {
      await window.api.cancelRecording();
      console.log("[Recording Area Selector] Cancel successful");
    } catch (error) {
      console.error("[Recording Area Selector] Failed to cancel:", error);
    }
  }, []);

  const handleMaximize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("[Recording Area Selector] Maximize clicked");
    setSelection({
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    });
    setIsSelecting(false);
    setIsResizing(false);
    setIsDragging(false);
  }, []);

  const handleConfirm = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!selection) return;

      console.log("[Recording Area Selector] Confirming selection:", selection);

      // Don't scale bounds - getUserMedia expects logical pixels, not physical pixels
      // The recording service will handle any necessary scaling internally
      const bounds = {
        x: Math.round(selection.x),
        y: Math.round(selection.y),
        width: Math.round(selection.width),
        height: Math.round(selection.height),
      };

      console.log("[Recording Area Selector] Sending bounds:", bounds);

      try {
        await window.api.recordingAreaSelected(bounds);
        console.log(
          "[Recording Area Selector] Area selection sent successfully"
        );
      } catch (error) {
        console.error(
          "[Recording Area Selector] Failed to process area selection:",
          error
        );
      }
    },
    [selection]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      } else if (e.key === "Enter" && selection) {
        handleConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCancel, handleConfirm, selection]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't handle events on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.closest("button")) {
      return;
    }

    e.preventDefault();
    const pos = { x: e.clientX, y: e.clientY };

    // If we have a valid selection, check if clicking on it
    if (selection && isValidSelection) {
      const handle = getResizeHandle(pos, selection);

      if (handle === "move") {
        // Clicking inside selection - start dragging
        setIsDragging(true);
        setDragOffset({
          x: pos.x - selection.x,
          y: pos.y - selection.y,
        });
        return;
      } else if (handle) {
        // Clicking on a resize handle
        setIsResizing(true);
        setResizeHandle(handle);
        setStartPos(pos);
        return;
      }

      // If clicking outside the selection, start a new selection
      if (
        pos.x < selection.x ||
        pos.x > selection.x + selection.width ||
        pos.y < selection.y ||
        pos.y > selection.y + selection.height
      ) {
        setIsSelecting(true);
        setStartPos(pos);
        setSelection({
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
        });
      }
      return;
    }

    // No valid selection exists - start new selection
    setIsSelecting(true);
    setStartPos(pos);
    setSelection({
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = { x: e.clientX, y: e.clientY };
    setMousePos(pos);

    if (isDragging && selection && dragOffset) {
      // Move selection
      const newX = Math.max(
        0,
        Math.min(pos.x - dragOffset.x, window.innerWidth - selection.width)
      );
      const newY = Math.max(
        0,
        Math.min(pos.y - dragOffset.y, window.innerHeight - selection.height)
      );

      setSelection({
        ...selection,
        x: newX,
        y: newY,
      });
    } else if (isResizing && resizeHandle && startPos && selection) {
      // Resize selection
      const newSelection = resizeSelection(
        selection,
        resizeHandle,
        pos,
        startPos
      );
      setSelection(newSelection);
      setStartPos(pos);
    } else if (isSelecting && startPos) {
      // Update selection while dragging
      const x = Math.min(startPos.x, pos.x);
      const y = Math.min(startPos.y, pos.y);
      const width = Math.abs(pos.x - startPos.x);
      const height = Math.abs(pos.y - startPos.y);

      setSelection({ x, y, width, height });
    }
  };

  const handleMouseUp = () => {
    // When finishing a selection, if it's valid, keep the selection
    // This allows the user to immediately move or resize it
    if (
      isSelecting &&
      selection &&
      selection.width >= MIN_SIZE &&
      selection.height >= MIN_SIZE
    ) {
      // Valid selection completed - stay in move/resize mode
      setIsSelecting(false);
    } else if (isSelecting) {
      // Invalid selection - clear it
      setIsSelecting(false);
      setSelection(null);
    } else {
      // Finish resizing/dragging
      setIsResizing(false);
      setIsDragging(false);
      setResizeHandle(null);
      setDragOffset(null);
    }
  };

  const getResizeHandle = (
    pos: { x: number; y: number },
    sel: SelectionBounds
  ): ResizeHandle => {
    const threshold = 10;

    // Check if inside selection (for moving)
    if (
      pos.x > sel.x + threshold &&
      pos.x < sel.x + sel.width - threshold &&
      pos.y > sel.y + threshold &&
      pos.y < sel.y + sel.height - threshold
    ) {
      return "move";
    }

    // Check corners
    if (
      Math.abs(pos.x - sel.x) < threshold &&
      Math.abs(pos.y - sel.y) < threshold
    )
      return "nw";
    if (
      Math.abs(pos.x - (sel.x + sel.width)) < threshold &&
      Math.abs(pos.y - sel.y) < threshold
    )
      return "ne";
    if (
      Math.abs(pos.x - sel.x) < threshold &&
      Math.abs(pos.y - (sel.y + sel.height)) < threshold
    )
      return "sw";
    if (
      Math.abs(pos.x - (sel.x + sel.width)) < threshold &&
      Math.abs(pos.y - (sel.y + sel.height)) < threshold
    )
      return "se";

    // Check edges
    if (
      Math.abs(pos.y - sel.y) < threshold &&
      pos.x > sel.x &&
      pos.x < sel.x + sel.width
    )
      return "n";
    if (
      Math.abs(pos.y - (sel.y + sel.height)) < threshold &&
      pos.x > sel.x &&
      pos.x < sel.x + sel.width
    )
      return "s";
    if (
      Math.abs(pos.x - sel.x) < threshold &&
      pos.y > sel.y &&
      pos.y < sel.y + sel.height
    )
      return "w";
    if (
      Math.abs(pos.x - (sel.x + sel.width)) < threshold &&
      pos.y > sel.y &&
      pos.y < sel.y + sel.height
    )
      return "e";

    return null;
  };

  const resizeSelection = (
    sel: SelectionBounds,
    handle: ResizeHandle,
    currentPos: { x: number; y: number },
    prevPos: { x: number; y: number }
  ): SelectionBounds => {
    const dx = currentPos.x - prevPos.x;
    const dy = currentPos.y - prevPos.y;

    let { x, y, width, height } = sel;

    switch (handle) {
      case "nw":
        x += dx;
        y += dy;
        width -= dx;
        height -= dy;
        break;
      case "ne":
        y += dy;
        width += dx;
        height -= dy;
        break;
      case "sw":
        x += dx;
        width -= dx;
        height += dy;
        break;
      case "se":
        width += dx;
        height += dy;
        break;
      case "n":
        y += dy;
        height -= dy;
        break;
      case "s":
        height += dy;
        break;
      case "w":
        x += dx;
        width -= dx;
        break;
      case "e":
        width += dx;
        break;
    }

    // Enforce minimum size
    if (width < MIN_SIZE) {
      if (handle?.includes("w")) x = sel.x + sel.width - MIN_SIZE;
      width = MIN_SIZE;
    }
    if (height < MIN_SIZE) {
      if (handle?.includes("n")) y = sel.y + sel.height - MIN_SIZE;
      height = MIN_SIZE;
    }

    // Keep within bounds
    x = Math.max(0, Math.min(x, window.innerWidth - width));
    y = Math.max(0, Math.min(y, window.innerHeight - height));

    return { x, y, width, height };
  };

  const getCursor = (pos?: { x: number; y: number }): string => {
    if (isDragging) return "move";
    if (isResizing) {
      if (resizeHandle === "nw" || resizeHandle === "se") return "nwse-resize";
      if (resizeHandle === "ne" || resizeHandle === "sw") return "nesw-resize";
      if (resizeHandle === "n" || resizeHandle === "s") return "ns-resize";
      if (resizeHandle === "e" || resizeHandle === "w") return "ew-resize";
    }
    if (!selection || !isValidSelection) return "crosshair";

    if (pos) {
      const handle = getResizeHandle(pos, selection);
      if (handle === "move") return "move";
      if (handle === "nw" || handle === "se") return "nwse-resize";
      if (handle === "ne" || handle === "sw") return "nesw-resize";
      if (handle === "n" || handle === "s") return "ns-resize";
      if (handle === "e" || handle === "w") return "ew-resize";
    }

    return "default";
  };

  const isValidSelection =
    selection && selection.width >= MIN_SIZE && selection.height >= MIN_SIZE;

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
        className="relative w-screen h-screen overflow-hidden"
        style={{
          background: "transparent",
          cursor: getCursor(mousePos || undefined),
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Instructions */}
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-gray-900/90 backdrop-blur-sm text-white px-6 py-3 rounded-lg shadow-2xl border border-gray-700">
            <div className="text-center">
              <div className="text-sm font-semibold mb-1">
                {!selection || !isValidSelection
                  ? "Select Recording Area"
                  : "Adjust Recording Area"}
              </div>
              <div className="text-xs text-gray-400">
                {!selection || !isValidSelection ? (
                  <>Click and drag to select area</>
                ) : (
                  <>
                    Drag to move • Resize edges/corners • Click outside to
                    reselect
                  </>
                )}
                {" • Press "}
                {isValidSelection && (
                  <>
                    <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">
                      Enter
                    </kbd>
                    {" to confirm • "}
                  </>
                )}
                <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-xs">
                  Esc
                </kbd>{" "}
                to cancel
              </div>
            </div>
          </div>
        </div>

        {/* Selection overlay */}
        {selection && (
          <>
            {/* Selection box with darkened overlay */}
            <div
              className={`absolute border-3 ${
                isValidSelection ? "border-blue-500" : "border-yellow-500"
              }`}
              style={{
                left: selection.x,
                top: selection.y,
                width: selection.width,
                height: selection.height,
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
                borderWidth: "3px",
              }}
            >
              {/* Dimension indicator */}
              <div
                className={`absolute -top-8 left-0 ${
                  isValidSelection ? "bg-blue-600" : "bg-yellow-600"
                } text-white text-xs px-2 py-1 rounded font-mono pointer-events-none`}
              >
                {Math.round(selection.width)} × {Math.round(selection.height)}
                {!isValidSelection && (
                  <span className="ml-1 text-yellow-200">
                    (min {MIN_SIZE}×{MIN_SIZE})
                  </span>
                )}
              </div>

              {/* Maximize button */}
              {isValidSelection && (
                <button
                  onClick={handleMaximize}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="absolute -top-10 right-0 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded shadow-lg transition-colors pointer-events-auto"
                  title="Maximize to full screen"
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
                      d="M4 8V4m0 0h4M4 4l5 5m11-5v4m0-4h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                </button>
              )}

              {/* Resize handles - Corners */}
              {isValidSelection && (
                <>
                  <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-full cursor-nw-resize pointer-events-auto"></div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-ne-resize pointer-events-auto"></div>
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 rounded-full cursor-sw-resize pointer-events-auto"></div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-se-resize pointer-events-auto"></div>

                  {/* Resize handles - Edges */}
                  <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full cursor-n-resize pointer-events-auto"></div>
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full cursor-s-resize pointer-events-auto"></div>
                  <div className="absolute -left-1 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full cursor-w-resize pointer-events-auto"></div>
                  <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full cursor-e-resize pointer-events-auto"></div>
                </>
              )}
            </div>

            {/* Confirm button */}
            {isValidSelection && !isSelecting && !isResizing && !isDragging && (
              <div className="absolute left-1/2 bottom-8 transform -translate-x-1/2 z-50 pointer-events-auto">
                <button
                  onClick={handleConfirm}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg shadow-2xl transition-colors flex items-center space-x-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <circle cx="10" cy="10" r="6" />
                  </svg>
                  <span>Start Recording</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

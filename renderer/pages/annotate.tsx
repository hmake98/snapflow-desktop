import React, { useEffect, useState, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { WindowControls } from "../components/ui/WindowControls";

export default function AnnotatePage() {
  const router = useRouter();
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Konva state
  const [Stage, setStage] = useState<any>(null);
  const [Layer, setLayer] = useState<any>(null);
  const [KonvaImage, setKonvaImage] = useState<any>(null);
  const [Line, setLine] = useState<any>(null);
  const [Rect, setRect] = useState<any>(null);
  const [Circle, setCircle] = useState<any>(null);
  const [Arrow, setArrow] = useState<any>(null);
  const [Text, setText] = useState<any>(null);
  const [Transformer, setTransformer] = useState<any>(null);

  const [tool, setTool] = useState<
    "select" | "pen" | "arrow" | "rectangle" | "circle" | "text"
  >("select");
  const [color, setColor] = useState("#EF4444");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fillOpacity, setFillOpacity] = useState(0);

  // Color presets
  const colorPresets = [
    { name: "Red", value: "#EF4444" },
    { name: "Orange", value: "#F97316" },
    { name: "Yellow", value: "#EAB308" },
    { name: "Green", value: "#22C55E" },
    { name: "Blue", value: "#3B82F6" },
    { name: "Purple", value: "#A855F7" },
    { name: "Pink", value: "#EC4899" },
    { name: "White", value: "#FFFFFF" },
    { name: "Black", value: "#000000" },
  ];
  const [shapes, setShapes] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<any>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Text editing state
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");

  // Run once on mount: load user, load Konva, fetch pending screenshot, set up IPC listener
  useEffect(() => {
    console.log("[Annotate] Component mounted, initializing...");

    // Load user first - this is critical for saving screenshots
    loadUser();

    // Dynamically load react-konva to avoid SSR issues
    let mounted = true;

    import("react-konva")
      .then((konvaModule) => {
        if (!mounted) return;
        setStage(konvaModule.Stage);
        setLayer(konvaModule.Layer);
        setKonvaImage(konvaModule.Image);
        setLine(konvaModule.Line);
        setRect(konvaModule.Rect);
        setCircle(konvaModule.Circle);
        setArrow(konvaModule.Arrow);
        setText(konvaModule.Text);
        setTransformer(konvaModule.Transformer);
      })
      .catch((err) => {
        console.error("Failed to load Konva:", err);
        toast.error("Failed to load image editor");
      });

    // Listen for screenshot captured via IPC event (sent by main process after
    // navigating to this page — acts as the primary delivery mechanism)
    console.log("[Annotate] Setting up screenshot listener...");
    const cleanup = window.api.onScreenshotCaptured((data: any) => {
      console.log("[Annotate] Screenshot received via IPC event!", {
        hasDataUrl: !!data?.dataUrl,
        dataUrlLength: data?.dataUrl?.length || 0,
        mode: data?.mode,
      });
      setScreenshot(data.dataUrl);
    });

    // Also poll getPendingScreenshot as a fallback in case the IPC event
    // was missed (e.g., page loaded before event was sent)
    const checkPendingScreenshot = async () => {
      console.log("[Annotate] Checking for pending screenshot...");
      try {
        const result = await window.api.getPendingScreenshot();
        if (result.success && result.data) {
          console.log("[Annotate] Found pending screenshot!", {
            dataUrlLength: result.data.dataUrl?.length || 0,
            mode: result.data.mode,
          });
          setScreenshot(result.data.dataUrl);
        } else {
          console.log("[Annotate] No pending screenshot found");
        }
      } catch (error) {
        console.error("[Annotate] Error getting pending screenshot:", error);
      }
    };
    checkPendingScreenshot();

    // Set up global function for direct injection (backup method)
    (window as any).__setScreenshot = (data: any) => {
      console.log("[Annotate] Screenshot set via direct injection!", {
        hasDataUrl: !!data?.dataUrl,
      });
      setScreenshot(data.dataUrl);
    };

    return () => {
      mounted = false;
      cleanup();
      delete (window as any).__setScreenshot;
    };
  }, []);

  // Separate effect for keyboard shortcuts that depend on current state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return;

      // Check if user is typing in an input field or textarea
      const target = e.target as HTMLElement;
      const isInputField =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (e.key === "Delete" || e.key === "Backspace") {
        // Only prevent default and delete shape if NOT in an input field
        if (!isInputField) {
          e.preventDefault();
          handleDelete();
        }
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        // Only prevent undo if NOT in an input field
        if (!isInputField) {
          e.preventDefault();
          handleUndo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingTextId, selectedId, shapes]);

  // Load image when screenshot changes
  useEffect(() => {
    if (!screenshot) return;

    const img = new Image();
    img.onload = () => {
      setImage(img);

      // Calculate dimensions to fit viewport
      // Account for: titlebar (36px), header (56-64px), toolbar (~100-120px), bottom panel (~52-64px)
      // Plus padding and borders
      const containerWidth = containerRef.current?.clientWidth || 1200;
      const containerHeight = containerRef.current?.clientHeight || 800;

      // More conservative padding to ensure screenshot fits well
      const paddingX = 64; // horizontal padding
      const paddingY = 64; // vertical padding

      const maxWidth = Math.max(containerWidth - paddingX, 400);
      const maxHeight = Math.max(containerHeight - paddingY, 300);

      // Account for device pixel ratio - the image is captured at native resolution
      // but should be displayed at CSS pixel dimensions
      const devicePixelRatio = window.devicePixelRatio || 1;
      const cssWidth = img.width / devicePixelRatio;
      const cssHeight = img.height / devicePixelRatio;

      console.log("[Annotate] Image loaded:", {
        imageWidth: img.width,
        imageHeight: img.height,
        devicePixelRatio,
        cssWidth,
        cssHeight,
        containerWidth,
        containerHeight,
        maxWidth,
        maxHeight,
      });

      const scaleX = maxWidth / cssWidth;
      const scaleY = maxHeight / cssHeight;
      const scale = Math.min(scaleX, scaleY, 1);

      console.log("[Annotate] Calculated dimensions:", {
        scaleX,
        scaleY,
        scale,
        finalWidth: cssWidth * scale,
        finalHeight: cssHeight * scale,
      });

      setDimensions({
        width: Math.floor(cssWidth * scale),
        height: Math.floor(cssHeight * scale),
      });
    };
    img.src = screenshot;
  }, [screenshot]);

  // Handle window resize separately
  useEffect(() => {
    if (!image) return;

    const handleResize = () => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      const paddingX = 64;
      const paddingY = 64;

      const maxWidth = Math.max(containerWidth - paddingX, 400);
      const maxHeight = Math.max(containerHeight - paddingY, 300);

      const devicePixelRatio = window.devicePixelRatio || 1;
      const cssWidth = image.width / devicePixelRatio;
      const cssHeight = image.height / devicePixelRatio;

      const scaleX = maxWidth / cssWidth;
      const scaleY = maxHeight / cssHeight;
      const scale = Math.min(scaleX, scaleY, 1);

      setDimensions({
        width: Math.floor(cssWidth * scale),
        height: Math.floor(cssHeight * scale),
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [image]);

  const loadUser = async () => {
    try {
      const result = await window.api.getUser();
      if (result.success && result.data) {
        setCurrentUser(result.data);
      } else {
        console.warn("[Annotate] Failed to load user:", result.error);
        // Don't redirect immediately - user might still be logged in
        // Only redirect on save if currentUser is still null
      }
    } catch (error) {
      console.error("[Annotate] Error loading user:", error);
    }
  };

  const handleMouseDown = (e: any) => {
    // Check if clicked on empty area (background)
    const clickedOnEmpty =
      e.target === e.target.getStage() || e.target.getClassName() === "Image";

    if (clickedOnEmpty && tool === "select") {
      // Deselect when clicking on empty area in select mode
      setSelectedId(null);
      return;
    }

    if (tool === "select") return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    if (tool === "pen") {
      setIsDrawing(true);
      const newShape = {
        id: `shape-${Date.now()}`,
        type: "line",
        points: [point.x, point.y],
        stroke: color,
        strokeWidth: strokeWidth,
        tension: 0.5,
        lineCap: "round",
        lineJoin: "round",
      };
      setCurrentShape(newShape);
    } else if (tool === "arrow") {
      const newShape = {
        id: `shape-${Date.now()}`,
        type: "arrow",
        points: [point.x, point.y, point.x, point.y],
        stroke: color,
        strokeWidth: strokeWidth,
        fill: color,
        pointerLength: 10,
        pointerWidth: 10,
      };
      setCurrentShape(newShape);
      setIsDrawing(true);
    } else if (tool === "rectangle") {
      const fillColor = fillOpacity > 0 ? color : "transparent";
      const newShape = {
        id: `shape-${Date.now()}`,
        type: "rect",
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        stroke: color,
        strokeWidth: strokeWidth,
        fill: fillColor,
        opacity: fillOpacity > 0 ? fillOpacity : 1,
      };
      setCurrentShape(newShape);
      setIsDrawing(true);
    } else if (tool === "circle") {
      const fillColor = fillOpacity > 0 ? color : "transparent";
      const newShape = {
        id: `shape-${Date.now()}`,
        type: "circle",
        x: point.x,
        y: point.y,
        radius: 0,
        stroke: color,
        strokeWidth: strokeWidth,
        fill: fillColor,
        opacity: fillOpacity > 0 ? fillOpacity : 1,
      };
      setCurrentShape(newShape);
      setIsDrawing(true);
    } else if (tool === "text") {
      const newShape = {
        id: `shape-${Date.now()}`,
        type: "text",
        x: point.x,
        y: point.y,
        text: "Double click to edit",
        fontSize: 24,
        fill: color,
        fontFamily: "Inter, sans-serif",
      };
      setShapes([...shapes, newShape]);
      setSelectedId(null); // Don't auto-select the newly created text
      setTool("select");
    }
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing || !currentShape) return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    if (tool === "pen" && currentShape.type === "line") {
      const updatedShape = {
        ...currentShape,
        points: [...currentShape.points, point.x, point.y],
      };
      setCurrentShape(updatedShape);
    } else if (tool === "arrow" && currentShape.type === "arrow") {
      const startX = currentShape.points[0];
      const startY = currentShape.points[1];
      const updatedShape = {
        ...currentShape,
        points: [startX, startY, point.x, point.y],
      };
      setCurrentShape(updatedShape);
    } else if (tool === "rectangle" && currentShape.type === "rect") {
      const updatedShape = {
        ...currentShape,
        width: point.x - currentShape.x,
        height: point.y - currentShape.y,
      };
      setCurrentShape(updatedShape);
    } else if (tool === "circle" && currentShape.type === "circle") {
      const radius = Math.sqrt(
        Math.pow(point.x - currentShape.x, 2) +
          Math.pow(point.y - currentShape.y, 2)
      );
      const updatedShape = {
        ...currentShape,
        radius,
      };
      setCurrentShape(updatedShape);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentShape) return;

    setShapes([...shapes, currentShape]);
    setCurrentShape(null);
    setIsDrawing(false);
    setSelectedId(null); // Don't auto-select the newly drawn shape
    setTool("select");
  };

  const handleDelete = () => {
    if (!selectedId) return;
    setShapes(shapes.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  };

  const handleUndo = () => {
    if (shapes.length === 0) return;
    setShapes(shapes.slice(0, -1));
    setSelectedId(null);
  };

  const handleClearAll = () => {
    if (shapes.length === 0) return;
    if (confirm("Are you sure you want to clear all annotations?")) {
      setShapes([]);
      setSelectedId(null);
    }
  };

  const handleTextDblClick = (id: string) => {
    const shape = shapes.find((s) => s.id === id);
    if (!shape || shape.type !== "text") return;

    setEditingTextId(id);
    setEditingTextValue(shape.text);
  };

  const handleTextEditSave = () => {
    if (editingTextId && editingTextValue.trim()) {
      setShapes(
        shapes.map((s) =>
          s.id === editingTextId ? { ...s, text: editingTextValue } : s
        )
      );
    }
    setEditingTextId(null);
    setEditingTextValue("");
  };

  const handleTextEditCancel = () => {
    setEditingTextId(null);
    setEditingTextValue("");
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    if (!currentUser) {
      console.error(
        "[Annotate] Cannot save - no current user. Redirecting to auth."
      );
      toast.error("User not found. Please login again.");
      router.push("/auth");
      return;
    }

    console.log("[Annotate] Saving screenshot with user:", currentUser.id);

    if (!stageRef.current) {
      toast.error("Editor not ready");
      return;
    }

    setSaving(true);

    try {
      const stage = stageRef.current;
      const dataUrl = stage.toDataURL({
        mimeType: "image/png",
        quality: 1,
        pixelRatio: 2,
      });

      // Convert base64 data URL to ArrayBuffer without using fetch()
      // (fetch() on data: URLs is blocked by Electron's CSP)
      const base64Data = dataUrl.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      const tempId = `SF-${Date.now()}`;

      const saveResult = await window.api.saveCapture(tempId, arrayBuffer);
      if (!saveResult.success) {
        toast.error(`Failed to save screenshot: ${saveResult.error}`);
        setSaving(false);
        return;
      }

      const issueResult = await window.api.createIssue(
        currentUser.id,
        title,
        "screenshot",
        saveResult.data.filePath,
        description || undefined,
        saveResult.data.thumbnailPath
      );

      if (issueResult.success) {
        toast.success("Screenshot saved successfully");
        router.push("/home");
      } else {
        toast.error(`Failed to create issue: ${issueResult.error}`);
      }

      setSaving(false);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("An error occurred while saving");
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push("/home");
  };

  const renderShape = (shape: any) => {
    const commonProps = {
      id: shape.id,
      onClick: () => setSelectedId(shape.id),
      onTap: () => setSelectedId(shape.id),
      draggable: tool === "select",
      onDragEnd: (e: any) => {
        const newShapes = shapes.map((s) => {
          if (s.id === shape.id) {
            return {
              ...s,
              x: e.target.x(),
              y: e.target.y(),
            };
          }
          return s;
        });
        setShapes(newShapes);
      },
    };

    switch (shape.type) {
      case "line":
        return Line && <Line key={shape.id} {...commonProps} {...shape} />;
      case "arrow":
        return Arrow && <Arrow key={shape.id} {...commonProps} {...shape} />;
      case "rect":
        return Rect && <Rect key={shape.id} {...commonProps} {...shape} />;
      case "circle":
        return Circle && <Circle key={shape.id} {...commonProps} {...shape} />;
      case "text":
        return (
          Text && (
            <Text
              key={shape.id}
              {...commonProps}
              {...shape}
              onDblClick={() => handleTextDblClick(shape.id)}
              onDblTap={() => handleTextDblClick(shape.id)}
            />
          )
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <title>Annotate Screenshot - SnapFlow</title>
      </Head>
      <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
        {/* Titlebar with Window Controls - Draggable */}
        <div
          className="glass-strong border-b border-white/5 flex-shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="flex items-center justify-end h-9 pl-4">
            <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
              <WindowControls />
            </div>
          </div>
        </div>

        {/* Unified Toolbar */}
        <div className="bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center h-12 px-3 gap-2 overflow-x-auto">
            {/* Context label */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-6 h-6 bg-blue-600/20 border border-blue-500/30 rounded-md flex items-center justify-center">
                <svg
                  className="w-3 h-3 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-400 hidden sm:block">
                Annotate
              </span>
            </div>

            <div className="w-px h-5 bg-gray-700/80 flex-shrink-0" />

            {/* Color swatches */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {colorPresets.slice(0, 6).map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setColor(preset.value)}
                  className={`w-5 h-5 rounded transition-all flex-shrink-0 ring-offset-1 ring-offset-gray-900 ${
                    color === preset.value
                      ? "ring-2 ring-blue-400 scale-110"
                      : "hover:scale-110 opacity-80 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: preset.value }}
                  title={preset.name}
                />
              ))}
              <div className="hidden lg:flex items-center gap-1">
                {colorPresets.slice(6).map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setColor(preset.value)}
                    className={`w-5 h-5 rounded transition-all flex-shrink-0 ring-offset-1 ring-offset-gray-900 ${
                      color === preset.value
                        ? "ring-2 ring-blue-400 scale-110"
                        : "hover:scale-110 opacity-80 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: preset.value }}
                    title={preset.name}
                  />
                ))}
              </div>
              <div className="w-px h-4 bg-gray-700 mx-0.5 flex-shrink-0" />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-5 h-5 rounded border border-gray-700 cursor-pointer bg-transparent flex-shrink-0"
                title="Custom color"
              />
            </div>

            <div className="w-px h-5 bg-gray-700/80 flex-shrink-0" />

            {/* Stroke width */}
            <select
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="h-7 px-2 rounded-md border border-gray-700 bg-gray-800 text-gray-200 text-xs cursor-pointer hover:border-gray-600 focus:border-blue-500 outline-none flex-shrink-0"
              title="Stroke width"
            >
              <option value={1}>1px</option>
              <option value={2}>2px</option>
              <option value={3}>3px</option>
              <option value={5}>5px</option>
              <option value={8}>8px</option>
            </select>

            {/* Fill (rect / circle only) */}
            {(tool === "rectangle" || tool === "circle") && (
              <>
                <div className="w-px h-5 bg-gray-700/80 flex-shrink-0" />
                <select
                  value={fillOpacity}
                  onChange={(e) => setFillOpacity(Number(e.target.value))}
                  className="h-7 px-2 rounded-md border border-gray-700 bg-gray-800 text-gray-200 text-xs cursor-pointer hover:border-gray-600 focus:border-blue-500 outline-none flex-shrink-0"
                  title="Fill opacity"
                >
                  <option value={0}>No fill</option>
                  <option value={0.2}>Fill 20%</option>
                  <option value={0.5}>Fill 50%</option>
                  <option value={1}>Fill 100%</option>
                </select>
              </>
            )}

            <div className="flex-1 min-w-0" />

            {/* Edit actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={handleUndo}
                disabled={shapes.length === 0}
                title="Undo (⌘Z)"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
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
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
              </button>
              <button
                onClick={handleDelete}
                disabled={!selectedId}
                title="Delete selected (Del)"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
              <button
                onClick={handleClearAll}
                disabled={shapes.length === 0}
                title="Clear all annotations"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
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

            <div className="w-px h-5 bg-gray-700/80 flex-shrink-0" />

            {/* Save / Cancel */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                variant="ghost"
                onClick={handleCancel}
                className="h-8 px-3 text-sm"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving}
                className="h-8 px-4 text-sm font-semibold"
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden bg-gray-950">
          {/* Left Tools */}
          <div className="w-14 bg-gray-900/40 border-r border-gray-800/70 flex-shrink-0">
            <div className="flex flex-col gap-1 p-2 pt-3">
              {(
                [
                  {
                    id: "select",
                    label: "Select",
                    title: "Select & move",
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"
                      />
                    ),
                  },
                  {
                    id: "pen",
                    label: "Pen",
                    title: "Freehand draw",
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    ),
                  },
                  {
                    id: "arrow",
                    label: "Arrow",
                    title: "Draw arrow",
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    ),
                  },
                  {
                    id: "rectangle",
                    label: "Box",
                    title: "Draw rectangle",
                    icon: (
                      <rect
                        x="4"
                        y="4"
                        width="16"
                        height="16"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ),
                  },
                  {
                    id: "circle",
                    label: "Circle",
                    title: "Draw circle",
                    icon: (
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ),
                  },
                  {
                    id: "text",
                    label: "Text",
                    title: "Add text",
                    icon: (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 7h16M12 7v13m-4 0h8"
                      />
                    ),
                  },
                ] as {
                  id:
                    | "select"
                    | "pen"
                    | "arrow"
                    | "rectangle"
                    | "circle"
                    | "text";
                  label: string;
                  title: string;
                  icon: React.ReactNode;
                }[]
              ).map(({ id, label, title, icon }) => (
                <button
                  key={id}
                  onClick={() => setTool(id)}
                  title={title}
                  className={`flex flex-col items-center justify-center w-full py-2 rounded-lg gap-0.5 transition-colors ${
                    tool === id
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/80"
                  }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {icon}
                  </svg>
                  <span className="text-[9px] font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Canvas Area */}
          <div
            className="flex-1 overflow-hidden bg-gray-950"
            ref={containerRef}
          >
            <div className="w-full h-full flex items-center justify-center p-3 sm:p-6">
              {screenshot && Stage && Layer && image ? (
                <div className="shadow-2xl rounded-lg overflow-hidden ring-1 ring-white/5">
                  <Stage
                    ref={stageRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={handleMouseUp}
                  >
                    <Layer>
                      {KonvaImage && (
                        <KonvaImage
                          image={image}
                          width={dimensions.width}
                          height={dimensions.height}
                        />
                      )}

                      {shapes.map((shape) => renderShape(shape))}
                      {currentShape && renderShape(currentShape)}

                      {Transformer && selectedId && tool === "select" && (
                        <Transformer
                          ref={(node: any) => {
                            if (node) {
                              const stage = node.getStage();
                              const selectedNode = stage.findOne(
                                `#${selectedId}`
                              );
                              if (selectedNode) {
                                node.nodes([selectedNode]);
                                node.getLayer().batchDraw();
                              }
                            }
                          }}
                        />
                      )}
                    </Layer>
                  </Stage>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 bg-gray-900 border border-gray-800 rounded-2xl flex items-center justify-center">
                    <svg
                      className="w-7 h-7 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-400">
                      Waiting for screenshot
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Capture a screenshot to start annotating
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel — Issue Details */}
          <div className="w-64 bg-gray-900/40 border-l border-gray-800/70 flex-shrink-0 flex flex-col overflow-y-auto">
            <div className="flex flex-col gap-5 p-4 h-full">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mt-0.5">
                Issue Details
              </p>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  Title <span className="text-red-400">*</span>
                </label>
                <Input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Issue title"
                  maxLength={100}
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-1 text-right">
                  {title.length}/100
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  Description{" "}
                  <span className="text-gray-600 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add notes or context..."
                  rows={6}
                  maxLength={500}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors hover:border-gray-600 placeholder:text-gray-600"
                />
                <p className="text-[10px] text-gray-500 mt-1 text-right">
                  {description.length}/500
                </p>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="mt-auto pt-4 border-t border-gray-800/70">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  Shortcuts
                </p>
                <div className="space-y-2">
                  {(
                    [
                      ["Deselect", "Esc"],
                      ["Undo", "⌘Z"],
                      ["Delete", "Del"],
                    ] as [string, string][]
                  ).map(([label, key]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between"
                    >
                      <span className="text-[11px] text-gray-500">{label}</span>
                      <kbd className="text-[10px] bg-gray-800 border border-gray-700/80 text-gray-400 px-1.5 py-0.5 rounded font-mono leading-none">
                        {key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Text Edit Dialog */}
        {editingTextId && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-96 shadow-2xl">
              <h3 className="text-lg font-semibold text-gray-100 mb-4">
                Edit Text
              </h3>
              <Input
                type="text"
                value={editingTextValue}
                onChange={(e) => setEditingTextValue(e.target.value)}
                placeholder="Enter text"
                className="w-full mb-4"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleTextEditSave();
                  } else if (e.key === "Escape") {
                    handleTextEditCancel();
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTextEditCancel}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleTextEditSave}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

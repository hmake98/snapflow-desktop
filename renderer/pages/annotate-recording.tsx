import React, { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useStore } from "../store/useStore";

export default function AnnotateRecording() {
  const router = useRouter();
  const { activeWorkspace } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoPath, setVideoPath] = useState("");
  const [duration, setDuration] = useState(0);
  const [thumbnailPath, setThumbnailPath] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const loadRecording = async () => {
      try {
        const result = await window.api.getPendingRecording();
        if (result.success && result.data) {
          setVideoPath(result.data.dataUrl);
          setDuration(result.data.duration || 0);
          setThumbnailPath(result.data.thumbnailPath);

          const now = new Date();
          setTitle(
            `Recording ${now.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}`
          );
        } else {
          router.push("/home");
        }
      } catch {
        router.push("/home");
      }
    };

    loadRecording();
  }, [router]);

  const handleSave = async () => {
    if (!title.trim()) {
      window.api.showNotification("Validation Error", "Please enter a title");
      return;
    }

    setIsSaving(true);

    try {
      const user = await window.api.getUser();
      if (!user.success || !user.data) {
        router.push("/auth");
        return;
      }

      const userId = user.data.id;

      let workspaceId = activeWorkspace?.id;
      if (!workspaceId) {
        const activeResult = await window.api.getActiveWorkspaceId();
        if (activeResult.success && activeResult.data) {
          workspaceId = activeResult.data;
        } else {
          const wsResult = await window.api.getUserWorkspaces();
          if (wsResult.success && wsResult.data?.length) {
            workspaceId = wsResult.data[0].id;
          }
        }
      }

      const result = await window.api.createIssue(
        userId,
        title,
        "recording",
        videoPath,
        description || undefined,
        thumbnailPath,
        workspaceId
      );

      if (result.success) {
        router.push("/home");
      } else {
        window.api.showNotification(
          "Save Failed",
          result.error || "Failed to save recording"
        );
      }
    } catch {
      window.api.showNotification("Save Failed", "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.push("/home");
  };

  const [isCopyingBug, setIsCopyingBug] = useState(false);

  const handleCopyBug = async () => {
    if (!title.trim()) {
      window.api.showNotification(
        "Error",
        "Please enter a title before copying"
      );
      return;
    }
    setIsCopyingBug(true);
    try {
      const result = await window.api.copyBugData({
        title,
        description: description || undefined,
        type: "recording",
      });
      if (result.success) {
        window.api.showNotification(
          "Copied",
          "Bug report copied to clipboard (save and sync to include media link)"
        );
      } else {
        window.api.showNotification(
          "Copy Failed",
          result.error || "Failed to copy bug report"
        );
      }
    } finally {
      setIsCopyingBug(false);
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <Head>
        <title>Save Recording - SnapFlow</title>
      </Head>
      <div className="h-screen flex flex-col bg-gray-950 overflow-hidden">
        {/* Toolbar */}
        <div
          className="bg-gray-900 border-b border-gray-800 flex-shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div
            className="flex items-center h-12 gap-2"
            style={
              {
                WebkitAppRegion: "no-drag",
                paddingLeft: "84px",
                paddingRight: "12px",
              } as React.CSSProperties
            }
          >
            {/* Context label */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-5 h-5 bg-red-600/20 border border-red-500/30 rounded flex items-center justify-center">
                <svg
                  className="w-2.5 h-2.5 text-red-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <circle cx="10" cy="10" r="6" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-400">
                Save Recording
              </span>
              {duration > 0 && (
                <span className="px-1.5 py-0.5 bg-gray-800 border border-gray-700/50 rounded text-xs font-mono text-gray-500">
                  {formatDuration(duration)}
                </span>
              )}
            </div>

            <div className="w-px h-4 bg-gray-700/80 flex-shrink-0" />

            {/* Title input */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Recording title..."
              className="flex-1 min-w-0 h-7 px-2.5 rounded-md border border-gray-700 bg-gray-800/60 text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500/60 focus:bg-gray-800 transition-colors"
              maxLength={100}
            />

            <div className="w-px h-4 bg-gray-700/80 flex-shrink-0" />

            {/* Notes toggle */}
            <button
              onClick={() => setShowDetails((v) => !v)}
              title="Toggle notes"
              className={`h-7 w-7 flex items-center justify-center rounded transition-colors ${
                showDetails
                  ? "text-blue-400 bg-blue-500/10"
                  : "text-gray-500 hover:text-gray-200 hover:bg-gray-800"
              }`}
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
                  d="M4 6h16M4 12h16M4 18h7"
                />
              </svg>
            </button>

            <div className="w-px h-4 bg-gray-700/80 flex-shrink-0" />

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleCopyBug}
                disabled={isCopyingBug}
                title={isCopyingBug ? "Copying..." : "Copy bug report"}
                className="h-7 px-2.5 flex items-center gap-1.5 rounded text-xs text-gray-500 hover:text-gray-200 hover:bg-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
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
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span className="hidden sm:inline">Copy Bug</span>
              </button>
              <button
                onClick={handleCancel}
                className="h-7 px-3 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !title.trim()}
                className="h-7 px-3 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* Video + notes overlay container */}
        <div className="flex-1 relative overflow-hidden">
          {/* Notes — absolute overlay, doesn't affect video layout */}
          {showDetails && (
            <div className="absolute top-0 left-0 right-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes about this recording..."
                rows={2}
                autoFocus
                className="w-full px-4 py-2.5 bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none resize-none"
                maxLength={500}
              />
            </div>
          )}

          {/* Video — always fills full area */}
          {videoPath ? (
            <video
              ref={videoRef}
              src={`snapflow://${videoPath}`}
              controls
              className="w-full h-full"
              style={{ background: "#000" }}
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
              <svg
                className="w-14 h-14 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm">Loading recording...</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

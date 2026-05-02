import React, { useState, useEffect } from "react";

interface UpdateProgress {
  percent: number;
  speed: string;
  downloaded: string;
  totalSize: string;
}

export function UpdatesSection() {
  const [isChecking, setIsChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    type:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "upToDate"
      | "error";
    message?: string;
    version?: string;
    currentVersion?: string;
  }>({ type: "idle" });
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress>({
    percent: 0,
    speed: "0 KB/s",
    downloaded: "0 MB",
    totalSize: "0 MB",
  });

  useEffect(() => {
    // Listen for update status events from main process
    const removeListener = window.api.onUpdateStatus((status) => {
      console.log("[UpdatesSection] Received update status:", status);

      switch (status.event) {
        case "checking-for-update":
          setUpdateStatus({
            type: "checking",
            message: "Checking for updates...",
          });
          break;

        case "update-available":
          {
            const data = status.data as {
              version: string;
              currentVersion: string;
            };
            setUpdateStatus({
              type: "available",
              message: `Update ${data.version} is available`,
              version: data.version,
              currentVersion: data.currentVersion,
            });
            // Automatically transition to downloading state
            setTimeout(() => {
              setUpdateStatus({
                type: "downloading",
                message: `Downloading version ${data.version}...`,
                version: data.version,
              });
            }, 1000);
          }
          break;

        case "download-progress":
          {
            const data = status.data as {
              percent: number;
              speed: string;
              downloaded: string;
              totalSize: string;
            };
            setDownloadProgress(data);
            setUpdateStatus({
              type: "downloading",
              message: `Downloading update... ${Math.round(data.percent)}%`,
            });
          }
          break;

        case "update-downloaded":
          {
            const data = status.data as { version: string };
            setUpdateStatus({
              type: "downloaded",
              message: `Version ${data.version} is ready to install`,
              version: data.version,
            });
            setDownloadProgress({
              percent: 100,
              speed: "0 KB/s",
              downloaded: "Complete",
              totalSize: "Complete",
            });
          }
          break;

        case "update-not-available":
          {
            const data = status.data as { currentVersion: string };
            setUpdateStatus({
              type: "upToDate",
              message: `You're running the latest version`,
              currentVersion: data.currentVersion,
            });
          }
          break;

        case "update-error":
          {
            const data = status.data as { message: string };
            setUpdateStatus({
              type: "error",
              message: data.message || "Failed to check for updates",
            });
          }
          break;
      }
    });

    return () => {
      removeListener();
    };
  }, []);

  const checkForUpdates = async () => {
    setIsChecking(true);
    setUpdateStatus({ type: "checking", message: "Checking for updates..." });
    setDownloadProgress({
      percent: 0,
      speed: "0 KB/s",
      downloaded: "0 MB",
      totalSize: "0 MB",
    });

    try {
      const result = await window.api.checkForUpdatesManual();

      if (result.success) {
        if (result.data.updateAvailable) {
          setUpdateStatus({
            type: "available",
            message: `Update available: Version ${result.data.version}`,
            version: result.data.version,
          });
        } else {
          setUpdateStatus({
            type: "upToDate",
            message: `You're running the latest version`,
            currentVersion: result.data.currentVersion,
          });
        }
      } else {
        setUpdateStatus({
          type: "error",
          message: result.error || "Failed to check for updates",
        });
      }
    } catch (_error) {
      setUpdateStatus({
        type: "error",
        message: "Network error. Please check your internet connection.",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusIcon = () => {
    switch (updateStatus.type) {
      case "checking":
        return (
          <svg
            className="w-5 h-5 text-blue-500 animate-spin"
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
        );
      case "available":
        return (
          <svg
            className="w-5 h-5 text-yellow-500"
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
        );
      case "downloading":
        return (
          <svg
            className="w-5 h-5 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
            />
          </svg>
        );
      case "downloaded":
        return (
          <svg
            className="w-5 h-5 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case "upToDate":
        return (
          <svg
            className="w-5 h-5 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case "error":
        return (
          <svg
            className="w-5 h-5 text-red-500"
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
        );
      default:
        return (
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        );
    }
  };

  const getStatusColor = () => {
    switch (updateStatus.type) {
      case "checking":
        return "text-blue-400";
      case "available":
        return "text-yellow-400";
      case "downloading":
        return "text-blue-400";
      case "downloaded":
        return "text-green-400";
      case "upToDate":
        return "text-green-400";
      case "error":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/40">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Software Updates
        </span>
        <button
          onClick={checkForUpdates}
          disabled={
            isChecking ||
            updateStatus.type === "downloading" ||
            updateStatus.type === "downloaded"
          }
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isChecking || updateStatus.type === "checking" ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Checking…
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Check for Updates
            </>
          )}
        </button>
      </div>

      {/* Status row */}
      {updateStatus.type === "idle" ? (
        <div className="px-4 py-3">
          <p className="text-xs text-gray-500">
            Updates are checked automatically when the app starts. You can also check manually above.
          </p>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-2.5">
            {getStatusIcon()}
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium ${getStatusColor()}`}>
                {updateStatus.message}
              </span>
              {updateStatus.currentVersion && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Current version: {updateStatus.currentVersion}
                </p>
              )}
            </div>
          </div>

          {/* Download progress */}
          {updateStatus.type === "downloading" && (
            <div className="space-y-1.5">
              <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{downloadProgress.downloaded} / {downloadProgress.totalSize}</span>
                <span>{downloadProgress.speed}</span>
              </div>
            </div>
          )}

          {updateStatus.type === "available" && (
            <p className="text-xs text-gray-500">
              The update will be downloaded automatically in the background.
            </p>
          )}

          {updateStatus.type === "downloaded" && (
            <p className="text-xs text-green-400">
              ✓ Will be installed automatically when you quit the app.
            </p>
          )}

          {updateStatus.type === "upToDate" && updateStatus.currentVersion && (
            <p className="text-xs text-gray-500">
              You're running version {updateStatus.currentVersion}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

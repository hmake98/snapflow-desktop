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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-100">
            Software Updates
          </h3>
          <p className="text-sm text-gray-400">
            Keep SnapFlow up to date with the latest features and security
            improvements
          </p>
        </div>
        <button
          onClick={checkForUpdates}
          disabled={
            isChecking ||
            updateStatus.type === "downloading" ||
            updateStatus.type === "downloaded"
          }
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2"
        >
          {isChecking || updateStatus.type === "checking" ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
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
              <span>Checking...</span>
            </>
          ) : (
            <>
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Check for Updates</span>
            </>
          )}
        </button>
      </div>

      {updateStatus.type !== "idle" && (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <div className="flex-1">
              <span className={`text-sm font-medium ${getStatusColor()}`}>
                {updateStatus.message}
              </span>
              {updateStatus.currentVersion && (
                <p className="text-xs text-gray-500 mt-1">
                  Current version: {updateStatus.currentVersion}
                </p>
              )}
            </div>
          </div>

          {/* Download Progress Bar */}
          {updateStatus.type === "downloading" && (
            <div className="mt-4 space-y-2">
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress.percent}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>
                  {downloadProgress.downloaded} / {downloadProgress.totalSize}
                </span>
                <span>{downloadProgress.speed}</span>
              </div>
            </div>
          )}

          {/* Update Available Info */}
          {updateStatus.type === "available" && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <p className="text-xs text-gray-400">
                The update will be downloaded automatically in the background.
              </p>
            </div>
          )}

          {/* Update Downloaded Info */}
          {updateStatus.type === "downloaded" && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2">
              <p className="text-xs text-gray-400">
                The update has been downloaded and is ready to install. You will
                be prompted to restart the application.
              </p>
              <p className="text-xs text-green-400 font-medium">
                ✓ The update will be automatically installed when you quit the
                app
              </p>
            </div>
          )}

          {/* Up to Date Info */}
          {updateStatus.type === "upToDate" && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <p className="text-xs text-gray-400">
                You're running version {updateStatus.currentVersion}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <p>• Updates are checked automatically when the app starts</p>
        <p>• You can also check for updates from the system tray menu</p>
        <p>• All updates are verified and signed for security</p>
        <p>• Updates are downloaded in the background automatically</p>
      </div>
    </div>
  );
}

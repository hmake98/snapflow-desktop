import React, { useState, useEffect } from "react";

interface UpdateStatus {
  event: string;
  data?: {
    percent?: number;
    speed?: string;
    downloaded?: string;
    totalSize?: string;
    version?: string;
    currentVersion?: string;
    message?: string;
    isSignatureError?: boolean;
    downloadUrl?: string;
    isMacOS?: boolean;
  };
}

export function UpdateBanner() {
  const [status, setStatus] = useState<{
    type:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "error"
      | "upToDate";
    message?: string;
    version?: string;
    percent?: number;
    speed?: string;
    downloaded?: string;
    totalSize?: string;
    downloadUrl?: string;
    isMacOS?: boolean;
  }>({ type: "idle" });

  const [dismissed, setDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Guard: API might not be available on initial render
    if (!window.api?.onUpdateStatus) {
      return;
    }

    const removeListener = window.api.onUpdateStatus(
      (updateStatus: UpdateStatus) => {
        const { event, data } = updateStatus;

        let newStatus: typeof status = { type: "idle" };

        switch (event) {
          case "checking-for-update":
            // Don't show checking state - it's a background operation
            break;

          case "update-available":
            newStatus = {
              type: "available",
              message: data?.isMacOS
                ? `Update ${data?.version} available`
                : `Update ${data?.version} available — downloading...`,
              version: data?.version,
              downloadUrl: data?.downloadUrl,
              isMacOS: data?.isMacOS,
            };
            setDismissed(false); // Re-show banner if dismissed
            break;

          case "download-progress":
            newStatus = {
              type: "downloading",
              message: `Downloading update...`,
              percent: data?.percent,
              speed: data?.speed,
              downloaded: data?.downloaded,
              totalSize: data?.totalSize,
            };
            break;

          case "update-downloaded":
            newStatus = {
              type: "downloaded",
              message: `Update ${data?.version} ready to install`,
              version: data?.version,
            };
            setDismissed(false); // Cannot dismiss downloaded state
            break;

          case "update-error":
            newStatus = {
              type: "error",
              message: data?.message || "Failed to update",
            };
            setDismissed(false); // Re-show errors
            break;

          case "update-not-available":
            newStatus = { type: "upToDate" };
            break;
        }

        setStatus(newStatus);

        // Show banner if there's a meaningful state
        if (
          newStatus.type !== "idle" &&
          newStatus.type !== "checking" &&
          newStatus.type !== "upToDate"
        ) {
          setIsVisible(true);
        }
      }
    );

    return () => {
      removeListener();
    };
  }, []);

  // Determine if banner should be shown
  const shouldShow =
    isVisible &&
    !dismissed &&
    status.type !== "idle" &&
    status.type !== "checking" &&
    status.type !== "upToDate";

  const getStatusColor = () => {
    switch (status.type) {
      case "available":
        return "bg-amber-900/20 border-amber-700/50 text-amber-100";
      case "downloading":
        return "bg-blue-900/20 border-blue-700/50 text-blue-100";
      case "downloaded":
        return "bg-green-900/20 border-green-700/50 text-green-100";
      case "error":
        return "bg-red-900/20 border-red-700/50 text-red-100";
      default:
        return "bg-gray-800/50 border-gray-700/50 text-gray-100";
    }
  };

  const getStatusIcon = () => {
    switch (status.type) {
      case "available":
        return (
          <svg
            className="w-5 h-5 text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case "downloading":
        return (
          <svg
            className="w-5 h-5 text-blue-400 animate-spin"
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
      case "downloaded":
        return (
          <svg
            className="w-5 h-5 text-green-400"
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
      case "error":
        return (
          <svg
            className="w-5 h-5 text-red-400"
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
        return null;
    }
  };

  const handleRestartNow = async () => {
    await window.api.installUpdate();
  };

  const handleDownloadMacOS = () => {
    if (status.downloadUrl) {
      window.api.openExternalUrl(status.downloadUrl);
    }
  };

  const handleDismiss = () => {
    if (status.type !== "downloaded") {
      setDismissed(true);
      setIsVisible(false);
    }
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <div
      className={`fixed left-0 right-0 z-40 border-b transition-all duration-300 animate-in slide-in-from-top-2 ${getStatusColor()}`}
      style={{ top: "80px" }}
    >
      <div className="max-w-full mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Icon and content section */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0">{getStatusIcon()}</div>

            <div className="flex-1 min-w-0">
              {/* Main message */}
              <div className="text-sm font-semibold leading-tight">
                {status.message}
              </div>

              {/* Version info for available/downloaded states */}
              {(status.type === "available" || status.type === "downloaded") &&
                status.version && (
                  <div className="text-xs opacity-75 mt-0.5">
                    Version {status.version}
                  </div>
                )}

              {/* Progress bar for downloading state */}
              {status.type === "downloading" &&
                status.percent !== undefined && (
                  <div className="mt-3 space-y-2">
                    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden backdrop-blur-sm">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          status.percent === 100
                            ? "bg-gradient-to-r from-green-400 to-green-500"
                            : "bg-gradient-to-r from-blue-400 to-blue-500"
                        }`}
                        style={{ width: `${Math.min(status.percent, 100)}%` }}
                      ></div>
                    </div>

                    {/* Progress details */}
                    <div className="flex justify-between text-xs opacity-75 font-medium">
                      <span className="tabular-nums font-semibold">
                        {Math.round(status.percent)}%
                      </span>
                      <span>
                        {status.downloaded} / {status.totalSize}
                      </span>
                      <span>{status.speed}</span>
                    </div>
                  </div>
                )}

              {/* Error message details */}
              {status.type === "error" && status.message && (
                <div className="text-xs opacity-75 mt-1">{status.message}</div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {status.type === "available" && status.isMacOS && (
              <button
                onClick={handleDownloadMacOS}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 whitespace-nowrap"
              >
                Download Now
              </button>
            )}

            {status.type === "downloaded" && (
              <button
                onClick={handleRestartNow}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 whitespace-nowrap"
              >
                Restart Now
              </button>
            )}

            {status.type !== "downloaded" && !status.isMacOS && (
              <button
                onClick={handleDismiss}
                className="text-gray-300 hover:text-white active:text-gray-200 transition-colors p-1.5 hover:bg-white/10 rounded-lg"
                title="Dismiss"
                aria-label="Dismiss update notification"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}

            {status.type !== "downloaded" && status.isMacOS && (
              <button
                onClick={handleDismiss}
                className="text-gray-300 hover:text-white active:text-gray-200 transition-colors p-1.5 hover:bg-white/10 rounded-lg"
                title="Dismiss"
                aria-label="Dismiss update notification"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { Button } from "../ui/Button";
import { SkeletonSyncCard } from "../ui/Skeleton";

interface SyncStatus {
  isSyncing: boolean;
  lastSync: number | null;
  syncCount: number;
  error: string | null;
}

interface SyncHistory {
  id: string;
  user_id: string;
  sync_type: "push" | "pull" | "full";
  status: "in_progress" | "completed" | "failed";
  synced_count: number;
  failed_count: number;
  total_count: number;
  errors: string[];
  started_at: string;
  completed_at: string | null;
}

export function CloudSyncIndicator({ userId }: { userId: string }) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSync: null,
    syncCount: 0,
    error: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [autoSync, setAutoSyncState] = useState(false);
  const [loadingAutoSync, setLoadingAutoSync] = useState(true);

  useEffect(() => {
    loadSyncHistory();
    loadAutoSyncSetting();
  }, [userId]);

  const loadAutoSyncSetting = async () => {
    try {
      setLoadingAutoSync(true);
      const result = await window.api.getAutoSync();
      if (result.success) {
        setAutoSyncState(result.data);
      }
    } catch (error) {
      console.error("Failed to load auto-sync setting:", error);
    } finally {
      setLoadingAutoSync(false);
    }
  };

  const handleAutoSyncToggle = async () => {
    try {
      const newValue = !autoSync;
      const result = await window.api.setAutoSync(newValue);
      if (result.success) {
        setAutoSyncState(newValue);
      }
    } catch (error) {
      console.error("Failed to update auto-sync setting:", error);
    }
  };

  const loadSyncHistory = async () => {
    try {
      setIsLoading(true);
      const result = await window.api.getSyncHistory(userId);
      if (result.success && result.data) {
        const history: SyncHistory = result.data;

        // Only update if not currently syncing
        if (!syncStatus.isSyncing) {
          setSyncStatus({
            isSyncing: history.status === "in_progress",
            lastSync: history.completed_at
              ? new Date(history.completed_at).getTime()
              : null,
            syncCount: history.synced_count,
            error:
              history.status === "failed" && history.errors.length > 0
                ? history.errors[0]
                : null,
          });
        }
      }
    } catch (error) {
      console.error("Failed to load sync history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncStatus((prev) => ({ ...prev, isSyncing: true, error: null }));
    try {
      const result = await window.api.syncToCloud(userId);
      if (result.success) {
        setSyncStatus({
          isSyncing: false,
          lastSync: Date.now(),
          syncCount: result.data.syncedCount,
          error: null,
        });

        // Reload sync history after successful sync
        setTimeout(() => loadSyncHistory(), 1000);
      } else {
        setSyncStatus((prev) => ({
          ...prev,
          isSyncing: false,
          error: result.data?.errors?.[0] || "Sync failed",
        }));

        // Reload sync history after failed sync
        setTimeout(() => loadSyncHistory(), 1000);
      }
    } catch (error) {
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : "Sync failed",
      }));

      // Reload sync history after error
      setTimeout(() => loadSyncHistory(), 1000);
    }
  };

  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return "Never";

    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (isLoading) {
    return <SkeletonSyncCard />;
  }

  return (
    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-2xl p-8 hover:border-gray-600/50 transition-all duration-300 backdrop-blur-sm max-w-4xl">
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600/20 to-blue-700/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
              <svg
                className="w-8 h-8 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                />
              </svg>
            </div>

            <div>
              <h3 className="text-2xl font-bold text-gray-100 mb-1">
                Cloud Sync
              </h3>
              <p className="text-sm text-gray-400">
                Back up all your screenshots and recordings to the cloud
              </p>
            </div>
          </div>

          <div
            className={`inline-flex items-center px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 ${
              syncStatus.isSyncing
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : syncStatus.error
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : syncStatus.lastSync
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full mr-2 ${
                syncStatus.isSyncing
                  ? "bg-blue-400 animate-pulse"
                  : syncStatus.error
                    ? "bg-red-400"
                    : syncStatus.lastSync
                      ? "bg-green-400"
                      : "bg-gray-400"
              }`}
            ></div>
            {syncStatus.isSyncing
              ? "Syncing..."
              : syncStatus.error
                ? "Error"
                : syncStatus.lastSync
                  ? "Synced"
                  : "Not Synced"}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
            <div className="flex items-center space-x-2 mb-1">
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Last Sync
              </span>
            </div>
            <p className="text-lg font-semibold text-gray-100">
              {formatLastSync(syncStatus.lastSync)}
            </p>
          </div>

          <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
            <div className="flex items-center space-x-2 mb-1">
              <svg
                className="w-4 h-4 text-gray-400"
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
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Items Synced
              </span>
            </div>
            <p className="text-lg font-semibold text-gray-100">
              {syncStatus.lastSync ? syncStatus.syncCount : "-"}
            </p>
          </div>
        </div>

        {/* Auto-Sync Toggle */}
        {!loadingAutoSync && (
          <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30 flex items-center justify-between">
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-gray-100">
                Auto-sync on capture
              </h4>
              <p className="text-xs text-gray-400 mt-1">
                Automatically back up to cloud when a screenshot is captured
              </p>
            </div>
            <button
              onClick={handleAutoSyncToggle}
              className={`relative w-12 h-6 rounded-full transition-colors ml-4 flex-shrink-0 ${
                autoSync ? "bg-blue-600" : "bg-gray-600"
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  autoSync ? "translate-x-6" : ""
                }`}
              />
            </button>
          </div>
        )}

        {/* Error Message */}
        {syncStatus.error && (
          <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4">
            <div className="flex items-start space-x-3">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
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
              <div>
                <h4 className="text-sm font-semibold text-red-300 mb-1">
                  Sync Error
                </h4>
                <p className="text-sm text-red-400">{syncStatus.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Info Message */}
        <div className="bg-blue-900/10 border border-blue-800/20 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <svg
              className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-300 mb-1">
                What gets synced?
              </h4>
              <ul className="text-sm text-blue-300/80 space-y-1">
                <li>• All screenshots and recordings with their files</li>
                <li>• Titles, descriptions, and tags</li>
                <li>• Public shareable links for all media files</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Sync Button */}
        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSync}
            disabled={syncStatus.isSyncing}
            isLoading={syncStatus.isSyncing}
            leftIcon={
              !syncStatus.isSyncing && (
                <svg
                  className="w-5 h-5"
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
              )
            }
            className="px-8"
          >
            {syncStatus.isSyncing
              ? "Syncing All Resources..."
              : "Sync All to Cloud"}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../store/useStore";

/**
 * Provides offline-aware sync wrappers and auto-processes the queue when
 * the app comes back online. Mount once in home.tsx.
 */
export function useSyncQueue(
  onQueueItemProcessed: () => void // callback to refresh data after each item
) {
  const isOnline = useStore((s) => s.isOnline);
  const syncQueue = useStore((s) => s.syncQueue);
  const addToSyncQueue = useStore((s) => s.addToSyncQueue);
  const removeFromSyncQueue = useStore((s) => s.removeFromSyncQueue);
  const updateIssue = useStore((s) => s.updateIssue);

  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    const queue = useStore.getState().syncQueue;
    if (queue.length === 0) return;

    processingRef.current = true;
    try {
      for (const item of queue) {
        // Stop processing if we went offline again
        if (!useStore.getState().isOnline) break;

        try {
          if (item.type === "syncIssue") {
            const r = await window.api.syncIssue(
              item.params.issueId,
              item.params.connectorId
            );
            if (r.success) {
              removeFromSyncQueue(item.id);
              onQueueItemProcessed();
            }
          } else if (item.type === "syncToCloud") {
            const r = await window.api.syncToCloud(
              item.params.userId,
              item.params.workspaceId
            );
            if (r.success) {
              removeFromSyncQueue(item.id);
              onQueueItemProcessed();
            }
          } else if (item.type === "syncIssueToZoho") {
            const r = await window.api.syncIssueToZoho(
              item.params.issueId,
              item.params.connectorId
            );
            if (r.success) {
              removeFromSyncQueue(item.id);
              onQueueItemProcessed();
            }
          }
        } catch {
          // Leave item in queue on error; will retry next time online
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [removeFromSyncQueue, onQueueItemProcessed]);

  // Process queue when coming back online
  useEffect(() => {
    if (isOnline && syncQueue.length > 0) {
      processQueue();
    }
  }, [isOnline, syncQueue.length, processQueue]);

  /**
   * Offline-aware sync for a single issue to a connector (GitHub).
   * Returns true if synced immediately, false if queued.
   */
  const syncIssue = useCallback(
    async (issueId: string, connectorId: string): Promise<boolean> => {
      if (!isOnline) {
        updateIssue(issueId, { syncStatus: "syncing" });
        addToSyncQueue({ type: "syncIssue", params: { issueId, connectorId } });
        window.api.showNotification(
          "Queued",
          "You are offline. Sync will run when you reconnect."
        );
        return false;
      }
      return true; // caller handles the actual API call when online
    },
    [isOnline, addToSyncQueue, updateIssue]
  );

  /**
   * Offline-aware sync to cloud.
   * Returns true if should proceed online, false if queued.
   */
  const syncToCloud = useCallback(
    async (userId: string, workspaceId: string): Promise<boolean> => {
      if (!isOnline) {
        addToSyncQueue({
          type: "syncToCloud",
          params: { userId, workspaceId },
        });
        window.api.showNotification(
          "Queued",
          "You are offline. Cloud sync will run when you reconnect."
        );
        return false;
      }
      return true;
    },
    [isOnline, addToSyncQueue]
  );

  /**
   * Offline-aware Zoho sync.
   * Returns true if should proceed online, false if queued.
   */
  const syncIssueToZoho = useCallback(
    async (issueId: string, connectorId: string): Promise<boolean> => {
      if (!isOnline) {
        updateIssue(issueId, { syncStatus: "syncing" });
        addToSyncQueue({
          type: "syncIssueToZoho",
          params: { issueId, connectorId },
        });
        window.api.showNotification(
          "Queued",
          "You are offline. Zoho sync will run when you reconnect."
        );
        return false;
      }
      return true;
    },
    [isOnline, addToSyncQueue, updateIssue]
  );

  return { syncIssue, syncToCloud, syncIssueToZoho };
}

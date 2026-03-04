import Store from "electron-store";
import { generateIssueId } from "../utils/id-generator";
import { storageManager } from "../utils/storage";
import log from "electron-log";

interface Snap {
  id: string;
  title: string;
  description?: string;
  type: "screenshot" | "recording";
  timestamp: string;
  filePath: string;
  thumbnailPath?: string;
  cloudFileUrl?: string;
  cloudThumbnailUrl?: string;
  syncStatus: "local" | "synced" | "syncing" | "failed";
  syncedTo?: {
    platform: string;
    externalId: string;
    url?: string;
    connectorId?: string;
  }[];
  userId: string;
  tags?: string[];
  [key: string]: unknown;
}

// Backwards compatibility alias
type Issue = Snap;

const store = new Store<{ snaps: Snap[] }>({
  name: "snapflow-snaps",
  defaults: {
    snaps: [],
  },
});

export class SnapService {
  async createSnap(
    userId: string,
    title: string,
    type: "screenshot" | "recording",
    filePath: string,
    description?: string,
    thumbnailPath?: string
  ): Promise<Snap> {
    log.info("[Snap Service] === CREATE SNAP START ===");
    log.info("[Snap Service] User ID:", userId);
    log.info("[Snap Service] Title:", title);
    log.info("[Snap Service] Type:", type);
    log.info("[Snap Service] File path:", filePath);

    const snap: Snap = {
      id: generateIssueId(),
      title,
      description,
      type,
      timestamp: new Date().toISOString(),
      filePath,
      thumbnailPath,
      syncStatus: "local",
      syncedTo: [],
      userId,
    };

    log.info("[Snap Service] Generated snap ID:", snap.id);

    const snaps = (store as any).get("snaps");
    snaps.push(snap);

    (store as any).set("snaps", snaps);
    log.info("[Snap Service] Saved to store, total snaps:", snaps.length);

    // Save metadata to file system
    log.info("[Snap Service] Saving metadata to file system...");
    await storageManager.saveMetadata(snap.id, snap);

    log.info("[Snap Service] ✓ Snap created successfully");
    log.info("[Snap Service] === CREATE SNAP END ===");
    return snap;
  }

  getSnaps(userId?: string): Snap[] {
    log.info("[Snap Service] Getting snaps for user:", userId || "all");

    const snaps = (store as any).get("snaps");
    if (userId) {
      const filtered = snaps.filter((snap) => snap.userId === userId);
      log.info("[Snap Service] Found", filtered.length, "snaps for user");
      return filtered;
    }
    log.info("[Snap Service] Found", snaps.length, "total snaps");
    return snaps;
  }

  getSnapById(snapId: string): Snap | undefined {
    const snaps = (store as any).get("snaps");
    return snaps.find((snap) => snap.id === snapId);
  }

  async updateSnap(snapId: string, updates: Partial<Snap>): Promise<Snap> {
    log.info("[Snap Service] === UPDATE SNAP START ===");
    log.info("[Snap Service] Snap ID:", snapId);
    log.info("[Snap Service] Updates:", JSON.stringify(updates));

    const snaps = (store as any).get("snaps");
    const index = snaps.findIndex((snap) => snap.id === snapId);

    if (index === -1) {
      log.error("[Snap Service] ✗ Snap not found");
      throw new Error("Snap not found");
    }

    const updatedSnap = {
      ...snaps[index],
      ...updates,
      id: snapId, // Ensure ID doesn't change
    };

    snaps[index] = updatedSnap;

    (store as any).set("snaps", snaps);
    log.info("[Snap Service] Saved to store");

    // Update metadata in file system
    log.info("[Snap Service] Updating metadata in file system...");
    await storageManager.saveMetadata(snapId, updatedSnap);

    log.info("[Snap Service] ✓ Snap updated successfully");
    log.info("[Snap Service] === UPDATE SNAP END ===");
    return updatedSnap;
  }

  async deleteSnap(snapId: string): Promise<void> {
    log.info("[Snap Service] === DELETE SNAP START ===");
    log.info("[Snap Service] Snap ID:", snapId);

    const snaps = (store as any).get("snaps");
    const filteredSnaps = snaps.filter((snap) => snap.id !== snapId);

    (store as any).set("snaps", filteredSnaps);
    log.info("[Snap Service] Removed from store");

    // Delete from file system
    log.info("[Snap Service] Deleting from file system...");
    await storageManager.deleteIssue(snapId);

    log.info("[Snap Service] ✓ Snap deleted successfully");
    log.info("[Snap Service] === DELETE SNAP END ===");
  }

  async updateSyncStatus(
    snapId: string,
    status: "local" | "synced" | "syncing" | "failed",
    syncInfo?: {
      platform: string;
      externalId: string;
      url?: string;
      connectorId?: string;
    }
  ): Promise<Snap> {
    const snaps = (store as any).get("snaps");
    const index = snaps.findIndex((snap) => snap.id === snapId);

    if (index === -1) {
      throw new Error("Snap not found");
    }

    snaps[index].syncStatus = status;

    if (syncInfo) {
      if (!snaps[index].syncedTo) {
        snaps[index].syncedTo = [];
      }
      // Check if platform already exists
      const existingIndex = snaps[index].syncedTo!.findIndex(
        (sync) => sync.platform === syncInfo.platform
      );
      if (existingIndex !== -1) {
        snaps[index].syncedTo![existingIndex] = syncInfo;
      } else {
        snaps[index].syncedTo!.push(syncInfo);
      }
    }

    (store as any).set("snaps", snaps);

    // Update metadata in file system
    await storageManager.saveMetadata(snapId, snaps[index]);

    return snaps[index];
  }

  getSnapsByDateRange(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Snap[] {
    const snaps = this.getSnaps(userId);
    return snaps.filter((snap) => {
      const snapDate = new Date(snap.timestamp);
      return snapDate >= startDate && snapDate <= endDate;
    });
  }

  searchSnaps(query: string, userId?: string): Snap[] {
    const snaps = this.getSnaps(userId);
    const lowerQuery = query.toLowerCase();

    return snaps.filter(
      (snap) =>
        snap.title.toLowerCase().includes(lowerQuery) ||
        snap.description?.toLowerCase().includes(lowerQuery) ||
        snap.id.toLowerCase().includes(lowerQuery)
    );
  }
}

// Backwards compatibility: IssueService is an alias for SnapService
export class IssueService extends SnapService {
  async createIssue(
    userId: string,
    title: string,
    type: "screenshot" | "recording",
    filePath: string,
    description?: string,
    thumbnailPath?: string
  ): Promise<Issue> {
    return this.createSnap(userId, title, type, filePath, description, thumbnailPath);
  }

  getIssues(userId?: string): Issue[] {
    return this.getSnaps(userId);
  }

  getIssueById(issueId: string): Issue | undefined {
    return this.getSnapById(issueId);
  }

  async updateIssue(issueId: string, updates: Partial<Issue>): Promise<Issue> {
    return this.updateSnap(issueId, updates);
  }

  async deleteIssue(issueId: string): Promise<void> {
    return this.deleteSnap(issueId);
  }

  getIssuesByDateRange(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Issue[] {
    return this.getSnapsByDateRange(startDate, endDate, userId);
  }

  searchIssues(query: string, userId?: string): Issue[] {
    return this.searchSnaps(query, userId);
  }
}

export const snapService = new SnapService();
export const issueService = new IssueService();

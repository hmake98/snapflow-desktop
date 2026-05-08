import Store from "electron-store";
import { generateIssueId } from "../utils/id-generator";
import { storageManager } from "../utils/storage";
import log from "electron-log";

interface SessionSnapData {
  sessionId: string;
  duration: number; // ms
  screenshotCount: number;
  eventCount: number;
  screenshotPaths: string[];
  /** Cloud storage URLs for each screenshot, populated after Supabase sync */
  cloudScreenshotUrls?: string[];
  timeline: unknown[];
  /** Per-screenshot active window/app metadata (parallel to screenshotPaths) */
  windowContexts?: Array<{
    appName: string;
    windowTitle: string;
    url?: string;
  }>;
}

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
  workspaceId?: string;
  tags?: string[];
  sessionData?: SessionSnapData;
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
  async createSessionSnap(
    userId: string,
    title: string,
    sessionData: SessionSnapData,
    description?: string,
    workspaceId?: string
  ): Promise<Snap> {
    const firstScreenshot = sessionData.screenshotPaths[0] ?? "";
    const snap: Snap = {
      id: generateIssueId(),
      title,
      description,
      type: "screenshot",
      timestamp: new Date().toISOString(),
      filePath: firstScreenshot,
      thumbnailPath: firstScreenshot,
      syncStatus: "local",
      syncedTo: [],
      userId,
      workspaceId,
      sessionData,
    };

    const snaps = (store as any).get("snaps");
    snaps.push(snap);
    (store as any).set("snaps", snaps);
    await storageManager.saveMetadata(snap.id, snap);

    return snap;
  }

  async createSnap(
    userId: string,
    title: string,
    type: "screenshot" | "recording",
    filePath: string,
    description?: string,
    thumbnailPath?: string,
    workspaceId?: string
  ): Promise<Snap> {

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
      workspaceId,
    };


    const snaps = (store as any).get("snaps");
    snaps.push(snap);

    (store as any).set("snaps", snaps);

    // Save metadata to file system
    await storageManager.saveMetadata(snap.id, snap);

    return snap;
  }

  getSnaps(userId?: string, workspaceId?: string): Snap[] {

    const snaps = (store as any).get("snaps");
    let filtered = userId
      ? snaps.filter((snap) => snap.userId === userId)
      : snaps;

    if (workspaceId) {
      filtered = filtered.filter(
        (snap: Snap) => snap.workspaceId === workspaceId
      );
    }

    return filtered;
  }

  getSnapById(snapId: string): Snap | undefined {
    const snaps = (store as any).get("snaps");
    return snaps.find((snap) => snap.id === snapId);
  }

  async updateSnap(snapId: string, updates: Partial<Snap>): Promise<Snap> {

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

    // Update metadata in file system
    await storageManager.saveMetadata(snapId, updatedSnap);

    return updatedSnap;
  }

  async deleteSnap(snapId: string): Promise<void> {

    const snaps = (store as any).get("snaps");
    const filteredSnaps = snaps.filter((snap) => snap.id !== snapId);

    (store as any).set("snaps", filteredSnaps);

    // Delete from file system
    await storageManager.deleteIssue(snapId);

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

  getSnapsByDateRange(startDate: Date, endDate: Date, userId?: string): Snap[] {
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
    thumbnailPath?: string,
    workspaceId?: string
  ): Promise<Issue> {
    return this.createSnap(
      userId,
      title,
      type,
      filePath,
      description,
      thumbnailPath,
      workspaceId
    );
  }

  getIssues(userId?: string, workspaceId?: string): Issue[] {
    return this.getSnaps(userId, workspaceId);
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

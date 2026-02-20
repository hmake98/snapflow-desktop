import Store from "electron-store";
import { generateIssueId } from "../utils/id-generator";
import { storageManager } from "../utils/storage";
import log from "electron-log";

interface Issue {
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

const store = new Store<{ issues: Issue[] }>({
  name: "snapflow-issues",
  defaults: {
    issues: [],
  },
});

export class IssueService {
  async createIssue(
    userId: string,
    title: string,
    type: "screenshot" | "recording",
    filePath: string,
    description?: string,
    thumbnailPath?: string
  ): Promise<Issue> {
    log.info("[Issue Service] === CREATE ISSUE START ===");
    log.info("[Issue Service] User ID:", userId);
    log.info("[Issue Service] Title:", title);
    log.info("[Issue Service] Type:", type);
    log.info("[Issue Service] File path:", filePath);

    const issue: Issue = {
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

    log.info("[Issue Service] Generated issue ID:", issue.id);

    const issues = store.get("issues");
    issues.push(issue);
    store.set("issues", issues);
    log.info("[Issue Service] Saved to store, total issues:", issues.length);

    // Save metadata to file system
    log.info("[Issue Service] Saving metadata to file system...");
    await storageManager.saveMetadata(issue.id, issue);

    log.info("[Issue Service] ✓ Issue created successfully");
    log.info("[Issue Service] === CREATE ISSUE END ===");
    return issue;
  }

  getIssues(userId?: string): Issue[] {
    log.info("[Issue Service] Getting issues for user:", userId || "all");
    const issues = store.get("issues");
    if (userId) {
      const filtered = issues.filter((issue) => issue.userId === userId);
      log.info("[Issue Service] Found", filtered.length, "issues for user");
      return filtered;
    }
    log.info("[Issue Service] Found", issues.length, "total issues");
    return issues;
  }

  getIssueById(issueId: string): Issue | undefined {
    const issues = store.get("issues");
    return issues.find((issue) => issue.id === issueId);
  }

  async updateIssue(issueId: string, updates: Partial<Issue>): Promise<Issue> {
    log.info("[Issue Service] === UPDATE ISSUE START ===");
    log.info("[Issue Service] Issue ID:", issueId);
    log.info("[Issue Service] Updates:", JSON.stringify(updates));

    const issues = store.get("issues");
    const index = issues.findIndex((issue) => issue.id === issueId);

    if (index === -1) {
      log.error("[Issue Service] ✗ Issue not found");
      throw new Error("Issue not found");
    }

    const updatedIssue = {
      ...issues[index],
      ...updates,
      id: issueId, // Ensure ID doesn't change
    };

    issues[index] = updatedIssue;
    store.set("issues", issues);
    log.info("[Issue Service] Saved to store");

    // Update metadata in file system
    log.info("[Issue Service] Updating metadata in file system...");
    await storageManager.saveMetadata(issueId, updatedIssue);

    log.info("[Issue Service] ✓ Issue updated successfully");
    log.info("[Issue Service] === UPDATE ISSUE END ===");
    return updatedIssue;
  }

  async deleteIssue(issueId: string): Promise<void> {
    log.info("[Issue Service] === DELETE ISSUE START ===");
    log.info("[Issue Service] Issue ID:", issueId);

    const issues = store.get("issues");
    const filteredIssues = issues.filter((issue) => issue.id !== issueId);
    store.set("issues", filteredIssues);
    log.info("[Issue Service] Removed from store");

    // Delete from file system
    log.info("[Issue Service] Deleting from file system...");
    await storageManager.deleteIssue(issueId);

    log.info("[Issue Service] ✓ Issue deleted successfully");
    log.info("[Issue Service] === DELETE ISSUE END ===");
  }

  async updateSyncStatus(
    issueId: string,
    status: "local" | "synced" | "syncing" | "failed",
    syncInfo?: {
      platform: string;
      externalId: string;
      url?: string;
      connectorId?: string;
    }
  ): Promise<Issue> {
    const issues = store.get("issues");
    const index = issues.findIndex((issue) => issue.id === issueId);

    if (index === -1) {
      throw new Error("Issue not found");
    }

    issues[index].syncStatus = status;

    if (syncInfo) {
      if (!issues[index].syncedTo) {
        issues[index].syncedTo = [];
      }
      // Check if platform already exists
      const existingIndex = issues[index].syncedTo!.findIndex(
        (sync) => sync.platform === syncInfo.platform
      );
      if (existingIndex !== -1) {
        issues[index].syncedTo![existingIndex] = syncInfo;
      } else {
        issues[index].syncedTo!.push(syncInfo);
      }
    }

    store.set("issues", issues);

    // Update metadata in file system
    await storageManager.saveMetadata(issueId, issues[index]);

    return issues[index];
  }

  getIssuesByDateRange(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Issue[] {
    const issues = this.getIssues(userId);
    return issues.filter((issue) => {
      const issueDate = new Date(issue.timestamp);
      return issueDate >= startDate && issueDate <= endDate;
    });
  }

  searchIssues(query: string, userId?: string): Issue[] {
    const issues = this.getIssues(userId);
    const lowerQuery = query.toLowerCase();

    return issues.filter(
      (issue) =>
        issue.title.toLowerCase().includes(lowerQuery) ||
        issue.description?.toLowerCase().includes(lowerQuery) ||
        issue.id.toLowerCase().includes(lowerQuery)
    );
  }
}

export const issueService = new IssueService();

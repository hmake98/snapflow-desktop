import { getSupabase } from "../utils/supabase";
import { issueService } from "./issues";
import { tenantService } from "./tenant";
import { workspaceService } from "./workspace";
import fs from "fs/promises";
import path from "path";
import log from "electron-log";

interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: string[];
  syncHistoryId?: string;
}

interface SyncHistory {
  id: string;
  initiated_by: string;
  sync_type: "push" | "pull" | "full";
  status: "in_progress" | "completed" | "failed";
  synced_count: number;
  failed_count: number;
  total_count: number;
  errors: string[];
  started_at: string;
  completed_at: string | null;
}

const BUCKET_NAME = "snapflow-public-bucket";

export class SyncService {
  /**
   * Check if the storage bucket exists by attempting to access it
   */
  private async ensureBucketExists(): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Sync] Supabase client not initialized");
      return false;
    }

    try {
      // Instead of listing buckets (which requires admin permissions),
      // try to list files in the bucket to verify it exists and is accessible
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .list("", { limit: 1 });

      if (error) {
        // Check if it's a "bucket not found" error
        if (
          error.message?.includes("not found") ||
          error.message?.includes("does not exist")
        ) {
          log.error("[Sync] Storage bucket does not exist:", BUCKET_NAME);
          log.error(
            "[Sync] Please create the bucket manually in Supabase Dashboard:"
          );
          log.error("[Sync]   1. Go to Supabase Dashboard > Storage");
          log.error("[Sync]   2. Create a bucket named:", BUCKET_NAME);
          log.error(
            "[Sync]   3. Configure as Public with 50MB file size limit"
          );
          log.error("[Sync]   4. Set allowed MIME types: image/*, video/*");
          return false;
        }

        // If it's a different error, log it but assume bucket exists
        log.warn(
          "[Sync] Bucket verification returned error (bucket may still exist):",
          error
        );
        return true;
      }

      return true;
    } catch (error) {
      log.error("[Sync] Error checking bucket:", error);
      // Assume bucket exists if we get an unexpected error
      return true;
    }
  }

  /**
   * Create a sync history record
   */
  private async createSyncHistory(
    userId: string,
    syncType: "push" | "pull" | "full",
    totalCount: number,
    workspaceId?: string
  ): Promise<string | null> {
    const supabase = getSupabase();
    if (!supabase) {
      return null;
    }

    try {
      // Get workspace ID if not provided
      let wsId = workspaceId;
      if (!wsId) {
        wsId = await this.getWorkspaceIdForUser(userId);
        if (!wsId) {
          log.warn("[Sync] Could not determine workspace for sync history");
          return null;
        }
      }

      const { data, error } = await supabase
        .from("sync_history")
        .insert({
          workspace_id: wsId,
          initiated_by: userId,
          sync_type: syncType,
          status: "in_progress",
          synced_count: 0,
          failed_count: 0,
          total_count: totalCount,
          errors: [],
        })
        .select("id")
        .single();

      if (error) {
        log.error("[Sync] Failed to create sync history:", error);
        return null;
      }

      return data.id;
    } catch (error) {
      log.error("[Sync] Error creating sync history:", error);
      return null;
    }
  }

  /**
   * Update sync history record
   */
  private async updateSyncHistory(
    syncHistoryId: string,
    updates: {
      status?: "in_progress" | "completed" | "failed";
      synced_count?: number;
      failed_count?: number;
      errors?: string[];
    }
  ): Promise<void> {
    const supabase = getSupabase();
    if (!supabase || !syncHistoryId) {
      return;
    }

    try {
      const updateData: Record<string, unknown> = { ...updates };

      if (updates.status === "completed" || updates.status === "failed") {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("sync_history")
        .update(updateData)
        .eq("id", syncHistoryId);

      if (error) {
        log.error("[Sync] Failed to update sync history:", error);
      } else {
      }
    } catch (error) {
      log.error("[Sync] Error updating sync history:", error);
    }
  }

  /**
   * Get latest sync history for a user
   */
  async getLatestSyncHistory(userId: string): Promise<SyncHistory | null> {
    const supabase = getSupabase();
    if (!supabase) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("sync_history")
        .select("*")
        .eq("initiated_by", userId)
        .order("started_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows found
          return null;
        }
        log.error("[Sync] Failed to get latest sync history:", error);
        return null;
      }

      return data as SyncHistory;
    } catch (error) {
      log.error("[Sync] Error getting latest sync history:", error);
      return null;
    }
  }

  /**
   * Upload a file to Supabase storage and return the public URL
   */
  private async uploadFileToStorage(
    filePath: string,
    userId: string,
    issueId: string
  ): Promise<string | null> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Sync] Supabase client not initialized");
      return null;
    }

    try {
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        log.error(`[Sync] File does not exist: ${filePath}`);
        return null;
      }

      // Read the file
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const fileExt = path.extname(fileName);

      // Create a unique path in the bucket: userId/issueId/filename
      const storagePath = `${userId}/${issueId}/${fileName}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: this.getContentType(fileExt),
          upsert: true, // Overwrite if exists
        });

      if (error) {
        log.error(`[Sync] Failed to upload file ${fileName}:`, error);
        log.error(`[Sync] Error details:`, JSON.stringify(error, null, 2));
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);

      return urlData.publicUrl;
    } catch (error) {
      log.error("[Sync] File upload error:", error);
      if (error instanceof Error) {
        log.error("[Sync] Error stack:", error.stack);
      }
      return null;
    }
  }

  /**
   * Get MIME content type based on file extension
   */
  private getContentType(extension: string): string {
    const contentTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
    };
    return contentTypes[extension.toLowerCase()] || "application/octet-stream";
  }

  /**
   * Get the workspace ID for a user (MVP: each user has 1 workspace)
   */
  private async getWorkspaceIdForUser(userId: string): Promise<string | null> {
    try {
      // Get user's tenant
      const tenant = await tenantService.getTenantByOwner(userId);
      if (!tenant) {
        log.warn(`[Sync] No tenant found for user ${userId}`);
        return null;
      }

      // Get workspaces for tenant
      const workspaces = await workspaceService.listWorkspaces(tenant.id);
      if (!workspaces || workspaces.length === 0) {
        log.warn(`[Sync] No workspaces found for tenant ${tenant.id}`);
        return null;
      }

      // Return first workspace ID (MVP: single workspace per tenant)
      return workspaces[0].id;
    } catch (error) {
      log.error(`[Sync] Error getting workspace for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Download a file from cloud storage URL to local storage
   */
  private async downloadFileFromCloud(
    cloudUrl: string,
    issueId: string,
    fileName: string
  ): Promise<string | null> {
    try {
      // Fetch file from URL
      const response = await fetch(cloudUrl);
      if (!response.ok) {
        log.error(
          `[Sync] Failed to download file: ${response.status} ${response.statusText}`
        );
        return null;
      }

      // Get file data as buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Import storage manager to save the file
      const { storageManager } = await import("../utils/storage");

      // Save to local storage
      const filePath = await storageManager.saveCapture(
        issueId,
        fileName,
        buffer
      );

      return filePath;
    } catch (error) {
      log.error("[Sync] Error downloading file from cloud:", error);
      return null;
    }
  }

  /**
   * Delete a snap from cloud storage and Supabase database
   */
  async deleteFromCloud(userId: string, issueId: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Sync] Supabase client not initialized");
      return;
    }

    try {
      // Get workspace ID
      const wsId = await this.getWorkspaceIdForUser(userId);
      if (!wsId) {
        log.warn("[Sync] No workspace found, skipping cloud delete");
        return;
      }

      // Delete from Supabase database
      const { error: dbError } = await supabase
        .from("snaps")
        .delete()
        .eq("id", issueId)
        .eq("workspace_id", wsId);

      if (dbError) {
        log.error("[Sync] Failed to delete from database:", dbError);
      } else {
      }

      // Delete from Supabase storage
      const storagePath = `${userId}/${issueId}`;

      // List all files under this path
      const { data: files, error: listError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(storagePath);

      if (listError) {
        log.warn("[Sync] Failed to list storage files:", listError);
      } else if (files && files.length > 0) {
        // Build full paths for deletion
        const filePaths = files
          .filter((f) => f.name !== ".emptyFolderPlaceholder") // Skip placeholder files
          .map((f) => `${storagePath}/${f.name}`);

        if (filePaths.length > 0) {
          const { error: deleteError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove(filePaths);

          if (deleteError) {
            log.warn("[Sync] Failed to delete from storage:", deleteError);
          } else {
          }
        }
      }
    } catch (error) {
      log.error("[Sync] Error deleting from cloud:", error);
      // Fail gracefully - log the error but don't throw
    }
  }

  /**
   * Sync all local issues to Supabase
   */
  async syncAllToCloud(
    userId: string,
    workspaceId?: string
  ): Promise<SyncResult> {
    const supabase = getSupabase();
    if (!supabase) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        errors: ["Supabase is not configured"],
      };
    }

    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    };

    // Ensure storage bucket exists

    const bucketReady = await this.ensureBucketExists();
    if (!bucketReady) {
      const error =
        "Storage bucket is not available. Please check Supabase configuration.";
      log.error("[Sync]", error);
      result.success = false;
      result.errors.push(error);
      return result;
    }

    // Get workspace ID — use provided value or derive from user
    const resolvedWorkspaceId =
      workspaceId || (await this.getWorkspaceIdForUser(userId));
    if (!resolvedWorkspaceId) {
      const error =
        "No workspace found for user. Please complete onboarding first.";
      log.error("[Sync]", error);
      result.success = false;
      result.errors.push(error);
      return result;
    }

    // Get all local issues scoped to this workspace
    const localIssues = issueService.getIssues(userId, resolvedWorkspaceId);

    // Create sync history record
    const syncHistoryId = await this.createSyncHistory(
      userId,
      "push",
      localIssues.length,
      resolvedWorkspaceId
    );
    result.syncHistoryId = syncHistoryId || undefined;

    try {
      if (localIssues.length === 0) {
        // Update sync history as completed with no items
        if (syncHistoryId) {
          await this.updateSyncHistory(syncHistoryId, {
            status: "completed",
            synced_count: 0,
            failed_count: 0,
          });
        }
        return result;
      }

      // Upload each issue to Supabase
      for (const issue of localIssues) {
        try {
          // Upload file to storage and get public URL
          let cloudFileUrl: string | null = null;
          let cloudThumbnailUrl: string | null = null;
          const cloudScreenshotUrls: string[] = [];

          try {
            // Upload main file
            if (issue.filePath) {
              cloudFileUrl = await this.uploadFileToStorage(
                issue.filePath,
                userId,
                issue.id
              );
              if (cloudFileUrl) {
              } else {
                log.warn(
                  `[Sync] Main file upload returned null for issue ${issue.id}`
                );
              }
            }

            // Upload thumbnail if exists
            if (issue.thumbnailPath) {
              cloudThumbnailUrl = await this.uploadFileToStorage(
                issue.thumbnailPath,
                userId,
                `${issue.id}_thumbnail`
              );
              if (cloudThumbnailUrl) {
              } else {
                log.warn(
                  `[Sync] Thumbnail upload returned null for issue ${issue.id}`
                );
              }
            }

            // For session snaps: upload all screenshots and collect cloud URLs
            const sessionData = (issue as any).sessionData as
              | {
                  screenshotPaths?: string[];
                  cloudScreenshotUrls?: string[];
                }
              | undefined;

            if (sessionData?.screenshotPaths?.length) {
              for (let i = 0; i < sessionData.screenshotPaths.length; i++) {
                const screenshotPath = sessionData.screenshotPaths[i];
                const url = await this.uploadFileToStorage(
                  screenshotPath,
                  userId,
                  `${issue.id}_screenshot_${i}`
                );
                if (url) {
                  cloudScreenshotUrls.push(url);
                } else {
                  log.warn(`[Sync] Session screenshot ${i + 1} upload failed`);
                }
              }
            }
          } catch (uploadError) {
            log.error(
              `[Sync] File upload error for issue ${issue.id}:`,
              uploadError
            );
            // Continue with sync even if file upload fails
          }

          // Check if issue already exists in Supabase
          const { data: existingIssue } = await supabase
            .from("snaps")
            .select("id, cloud_file_url, cloud_thumbnail_url")
            .eq("id", issue.id)
            .eq("created_by", userId)
            .single();

          // Build session_data with cloud URLs merged in (if this is a session snap)
          let sessionDataForDb: unknown = null;
          const rawSessionData = (issue as any).sessionData as
            | {
                screenshotPaths?: string[];
                cloudScreenshotUrls?: string[];
                [key: string]: unknown;
              }
            | undefined;
          if (rawSessionData) {
            sessionDataForDb = {
              ...rawSessionData,
              cloudScreenshotUrls:
                cloudScreenshotUrls.length > 0
                  ? cloudScreenshotUrls
                  : (rawSessionData.cloudScreenshotUrls ?? []),
            };
          }

          const issueData = {
            id: issue.id,
            workspace_id: resolvedWorkspaceId,
            created_by: userId,
            title: issue.title,
            description: issue.description || null,
            type: issue.type,
            timestamp: issue.timestamp,
            file_path: issue.filePath,
            thumbnail_path: issue.thumbnailPath || null,
            cloud_file_url:
              cloudFileUrl || existingIssue?.cloud_file_url || null,
            cloud_thumbnail_url:
              cloudThumbnailUrl || existingIssue?.cloud_thumbnail_url || null,
            sync_status: "synced",
            synced_to: issue.syncedTo || [],
            tags: issue.tags || [],
            session_data: sessionDataForDb,
          };

          if (existingIssue) {
            // Update existing issue
            const { error } = await supabase
              .from("snaps")
              .update(issueData)
              .eq("id", issue.id)
              .eq("created_by", userId);

            if (error) {
              log.error(
                `[Sync] Database update error for issue ${issue.id}:`,
                error
              );
              throw error;
            }
          } else {
            // Insert new issue
            const { error } = await supabase.from("snaps").insert(issueData);

            if (error) {
              log.error(
                `[Sync] Database insert error for issue ${issue.id}:`,
                error
              );
              throw error;
            }
          }

          // Update local sync status and cloud URLs
          const localUpdateData: Record<string, unknown> = {
            syncStatus: "synced",
          };
          if (cloudFileUrl) {
            localUpdateData.cloudFileUrl = cloudFileUrl;
          }
          if (cloudThumbnailUrl) {
            localUpdateData.cloudThumbnailUrl = cloudThumbnailUrl;
          }
          // Persist cloudScreenshotUrls back into sessionData locally
          if (cloudScreenshotUrls.length > 0 && rawSessionData) {
            localUpdateData.sessionData = {
              ...rawSessionData,
              cloudScreenshotUrls,
            };
          }

          const updatedSnap = await issueService.updateIssue(
            issue.id,
            localUpdateData
          );
          result.syncedCount++;
        } catch (error) {
          result.failedCount++;
          result.errors.push(
            `Failed to sync issue ${issue.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          log.error(`Failed to sync issue ${issue.id}:`, error);
        }
      }

      result.success = result.failedCount === 0;

      // Update sync history as completed
      if (syncHistoryId) {
        await this.updateSyncHistory(syncHistoryId, {
          status: result.success ? "completed" : "failed",
          synced_count: result.syncedCount,
          failed_count: result.failedCount,
          errors: result.errors,
        });
      }
    } catch (error) {
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : String(error)
      );
      log.error("Sync error:", error);

      // Update sync history as failed
      if (syncHistoryId) {
        await this.updateSyncHistory(syncHistoryId, {
          status: "failed",
          synced_count: result.syncedCount,
          failed_count: result.failedCount,
          errors: result.errors,
        });
      }
    }

    return result;
  }

  /**
   * Fetch issues from Supabase cloud and merge with local data
   * Downloads files from cloud if they don't exist locally
   *
   * `onProgress` is called at start (with total), per-item (with current),
   * and at completion (with syncedCount/failedCount). Used by the UI to
   * show a "Syncing X of Y snaps from cloud" indicator.
   */
  async fetchFromCloud(
    userId: string,
    workspaceId?: string,
    onProgress?: (event: {
      phase: "start" | "progress" | "complete";
      current?: number;
      total?: number;
      syncedCount?: number;
      failedCount?: number;
    }) => void
  ): Promise<SyncResult> {
    const supabase = getSupabase();
    if (!supabase) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        errors: ["Supabase is not configured"],
      };
    }

    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    };

    // Get workspace ID — use provided value or derive from user
    const resolvedWorkspaceId =
      workspaceId || (await this.getWorkspaceIdForUser(userId));
    if (!resolvedWorkspaceId) {
      log.warn("[Sync] No workspace found for user, skipping fetch");
      return result;
    }

    // Create sync history record
    const syncHistoryId = await this.createSyncHistory(
      userId,
      "pull",
      0,
      resolvedWorkspaceId
    );
    result.syncHistoryId = syncHistoryId || undefined;

    try {
      // Fetch all issues from Supabase for this user's workspace
      const { data: cloudIssues, error } = await supabase
        .from("snaps")
        .select("*")
        .eq("workspace_id", resolvedWorkspaceId)
        .eq("created_by", userId)
        .order("timestamp", { ascending: false });

      if (error) {
        throw error;
      }

      if (!cloudIssues || cloudIssues.length === 0) {
        onProgress?.({
          phase: "complete",
          syncedCount: 0,
          failedCount: 0,
        });
        // Update sync history
        if (syncHistoryId) {
          await this.updateSyncHistory(syncHistoryId, {
            status: "completed",
            synced_count: 0,
            failed_count: 0,
          });
        }
        return result;
      }

      onProgress?.({
        phase: "start",
        total: cloudIssues.length,
        current: 0,
      });

      // Update total count in sync history
      if (syncHistoryId) {
        await this.updateSyncHistory(syncHistoryId, {
          synced_count: 0,
          failed_count: 0,
        });
      }

      // Get local issues to check for conflicts
      const localIssues = issueService.getIssues(userId);
      const localIssueIds = new Set(localIssues.map((i) => i.id));

      // Merge cloud issues with local data
      for (const cloudIssue of cloudIssues) {
        try {
          let localFilePath = cloudIssue.file_path;
          let localThumbnailPath = cloudIssue.thumbnail_path;
          // For session snaps: rebuild the screenshotPaths array against the
          // new device's filesystem after downloading each screenshot.
          let resolvedSessionData = cloudIssue.session_data || undefined;

          // Check if this is a cloud-only issue (not in local storage)
          if (!localIssueIds.has(cloudIssue.id)) {
            // Download main file from cloud if available
            if (cloudIssue.cloud_file_url) {
              const fileName = path.basename(
                cloudIssue.file_path || "screenshot.png"
              );
              const downloadedPath = await this.downloadFileFromCloud(
                cloudIssue.cloud_file_url,
                cloudIssue.id,
                fileName
              );
              if (downloadedPath) {
                localFilePath = downloadedPath;
              } else {
                log.warn(
                  `[Sync] Failed to download main file for issue ${cloudIssue.id}`
                );
                // Skip this issue if we can't download the main file
                result.failedCount++;
                result.errors.push(
                  `Failed to download main file for issue ${cloudIssue.id}`
                );
                continue;
              }
            } else if (
              !(cloudIssue.session_data as { cloudScreenshotUrls?: string[] })
                ?.cloudScreenshotUrls?.length
            ) {
              // Allow session snaps with no main file as long as they have
              // cloud screenshots to fall back on.
              log.warn(
                `[Sync] No cloud URL for issue ${cloudIssue.id}, skipping`
              );
              continue;
            }

            // Download thumbnail if available
            if (cloudIssue.cloud_thumbnail_url) {
              const thumbnailFileName = path.basename(
                cloudIssue.thumbnail_path || "thumbnail.png"
              );
              const downloadedThumbnail = await this.downloadFileFromCloud(
                cloudIssue.cloud_thumbnail_url,
                cloudIssue.id,
                thumbnailFileName
              );
              if (downloadedThumbnail) {
                localThumbnailPath = downloadedThumbnail;
              }
            }

            // Download session screenshots (if any). Each screenshot is
            // rewritten to a local path; the cloud URL array is preserved as
            // the LocalImage cloud-fallback source while downloads complete.
            const sessionData = cloudIssue.session_data as
              | {
                  screenshotPaths?: string[];
                  cloudScreenshotUrls?: string[];
                  [key: string]: unknown;
                }
              | undefined;
            if (sessionData?.cloudScreenshotUrls?.length) {
              const downloadedPaths: string[] = [];
              for (let i = 0; i < sessionData.cloudScreenshotUrls.length; i++) {
                const cloudUrl = sessionData.cloudScreenshotUrls[i];
                const originalName = path.basename(
                  sessionData.screenshotPaths?.[i] || `screenshot_${i}.png`
                );
                const downloaded = await this.downloadFileFromCloud(
                  cloudUrl,
                  `${cloudIssue.id}_screenshot_${i}`,
                  originalName
                );
                if (downloaded) {
                  downloadedPaths.push(downloaded);
                } else {
                  // Keep the slot aligned with cloudScreenshotUrls so index
                  // lookups still work against the cloud fallback array.
                  downloadedPaths.push("");
                  log.warn(
                    `[Sync] Failed to download session screenshot ${i + 1} for ${cloudIssue.id}`
                  );
                }
              }
              resolvedSessionData = {
                ...sessionData,
                screenshotPaths: downloadedPaths,
              };

              // For session snaps, the snap's filePath/thumbnailPath usually
              // mirrors the first screenshot. Repoint them so the home grid
              // thumbnail resolves locally.
              if (downloadedPaths[0]) {
                if (
                  !localFilePath ||
                  localFilePath === sessionData.screenshotPaths?.[0]
                ) {
                  localFilePath = downloadedPaths[0];
                }
                if (
                  !localThumbnailPath ||
                  localThumbnailPath === sessionData.screenshotPaths?.[0]
                ) {
                  localThumbnailPath = downloadedPaths[0];
                }
              }
            }
          }

          const issueData: Record<string, unknown> = {
            id: cloudIssue.id,
            title: cloudIssue.title,
            description: cloudIssue.description,
            type: cloudIssue.type as "screenshot" | "recording",
            timestamp: cloudIssue.timestamp,
            filePath: localFilePath,
            thumbnailPath: localThumbnailPath,
            cloudFileUrl: cloudIssue.cloud_file_url,
            cloudThumbnailUrl: cloudIssue.cloud_thumbnail_url,
            syncStatus: "synced" as const,
            syncedTo: cloudIssue.synced_to || [],
            userId: cloudIssue.created_by,
            tags: cloudIssue.tags || [],
            sessionData: resolvedSessionData,
          };

          if (localIssueIds.has(cloudIssue.id)) {
            // Update existing local issue
            await issueService.updateIssue(cloudIssue.id, issueData);
          } else {
            // Create new local issue with downloaded files
            // We need to create the issue directly in the store
            // Import Store to directly manipulate the issues
            const Store = (await import("electron-store")).default;
            const store = new Store<{ issues: Array<Record<string, unknown>> }>(
              {
                name: "snapflow-issues",
                defaults: { issues: [] },
              }
            );

            const issues = (store as any).get("issues");
            issues.push(issueData);

            (store as any).set("issues", issues);

            // Save metadata to file system
            const { storageManager } = await import("../utils/storage");
            await storageManager.saveMetadata(cloudIssue.id, issueData);
          }

          result.syncedCount++;
        } catch (error) {
          result.failedCount++;
          result.errors.push(
            `Failed to sync issue ${cloudIssue.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          log.error(`[Sync] Failed to sync issue ${cloudIssue.id}:`, error);
        }
        onProgress?.({
          phase: "progress",
          current: result.syncedCount + result.failedCount,
          total: cloudIssues.length,
        });
      }

      result.success = result.failedCount === 0;
      onProgress?.({
        phase: "complete",
        syncedCount: result.syncedCount,
        failedCount: result.failedCount,
      });

      // Update sync history
      if (syncHistoryId) {
        await this.updateSyncHistory(syncHistoryId, {
          status: result.success ? "completed" : "failed",
          synced_count: result.syncedCount,
          failed_count: result.failedCount,
          errors: result.errors,
        });
      }
    } catch (error) {
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : String(error)
      );
      log.error("[Sync] Fetch error:", error);

      // Update sync history
      if (syncHistoryId) {
        await this.updateSyncHistory(syncHistoryId, {
          status: "failed",
          synced_count: result.syncedCount,
          failed_count: result.failedCount,
          errors: result.errors,
        });
      }
    }

    return result;
  }

  /**
   * Update snap metadata in Supabase (for title/description/tags changes)
   */
  async updateSnapMetadata(
    snapId: string,
    userId: string,
    updates: {
      title?: string;
      description?: string;
      tags?: string[];
    }
  ): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Sync] Supabase client not initialized");
      return false;
    }

    try {
      // Get workspace ID for user
      const workspaceId = await this.getWorkspaceIdForUser(userId);
      if (!workspaceId) {
        log.warn("[Sync] No workspace found, skipping metadata update");
        return false;
      }

      const updateData: Record<string, unknown> = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined)
        updateData.description = updates.description;
      if (updates.tags !== undefined) updateData.tags = updates.tags;

      const { error } = await supabase
        .from("snaps")
        .update(updateData)
        .eq("id", snapId)
        .eq("workspace_id", workspaceId)
        .eq("created_by", userId);

      if (error) {
        log.error(`[Sync] Failed to update snap metadata in database:`, error);
        return false;
      }

      return true;
    } catch (error) {
      log.error("[Sync] Error updating snap metadata:", error);
      return false;
    }
  }

  /**
   * Full sync: Push local changes to cloud and pull cloud changes to local
   */
  async fullSync(userId: string, workspaceId?: string): Promise<SyncResult> {
    // First push local changes to cloud
    const pushResult = await this.syncAllToCloud(userId, workspaceId);

    // Then pull cloud changes to local
    const pullResult = await this.fetchFromCloud(userId, workspaceId);

    // Combine results
    return {
      success: pushResult.success && pullResult.success,
      syncedCount: pushResult.syncedCount + pullResult.syncedCount,
      failedCount: pushResult.failedCount + pullResult.failedCount,
      errors: [...pushResult.errors, ...pullResult.errors],
    };
  }
}

export const syncService = new SyncService();

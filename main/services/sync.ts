import { getSupabase } from "../utils/supabase";
import { issueService } from "./issues";
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
      log.info("[Sync] Verifying bucket access...");
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
        log.info("[Sync] Proceeding with upload attempt...");
        return true;
      }

      log.info("[Sync] Bucket is accessible:", BUCKET_NAME);
      return true;
    } catch (error) {
      log.error("[Sync] Error checking bucket:", error);
      // Assume bucket exists if we get an unexpected error
      log.info("[Sync] Proceeding with upload attempt...");
      return true;
    }
  }

  /**
   * Create a sync history record
   */
  private async createSyncHistory(
    userId: string,
    syncType: "push" | "pull" | "full",
    totalCount: number
  ): Promise<string | null> {
    const supabase = getSupabase();
    if (!supabase) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("sync_history")
        .insert({
          user_id: userId,
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

      log.info(`[Sync] Created sync history record: ${data.id}`);
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
        log.info(`[Sync] Updated sync history record: ${syncHistoryId}`);
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
        .eq("user_id", userId)
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
      log.info(`[Sync] Reading file: ${filePath}`);
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const fileExt = path.extname(fileName);

      // Create a unique path in the bucket: userId/issueId/filename
      const storagePath = `${userId}/${issueId}/${fileName}`;

      log.info(`[Sync] Uploading to storage path: ${storagePath}`);
      log.info(`[Sync] File size: ${fileBuffer.length} bytes`);
      log.info(`[Sync] Content type: ${this.getContentType(fileExt)}`);

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

      log.info(`[Sync] Upload successful, data:`, data);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(storagePath);

      log.info(`[Sync] Generated public URL: ${urlData.publicUrl}`);
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
   * Download a file from cloud storage URL to local storage
   */
  private async downloadFileFromCloud(
    cloudUrl: string,
    issueId: string,
    fileName: string
  ): Promise<string | null> {
    try {
      log.info(`[Sync] Downloading file from cloud: ${cloudUrl}`);

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

      log.info(`[Sync] Downloaded ${buffer.length} bytes`);

      // Import storage manager to save the file
      const { storageManager } = await import("../utils/storage");

      // Save to local storage
      const filePath = await storageManager.saveCapture(
        issueId,
        fileName,
        buffer
      );

      log.info(`[Sync] ✓ File saved to local storage: ${filePath}`);
      return filePath;
    } catch (error) {
      log.error("[Sync] Error downloading file from cloud:", error);
      return null;
    }
  }

  /**
   * Sync all local issues to Supabase
   */
  async syncAllToCloud(userId: string): Promise<SyncResult> {
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
    log.info("[Sync] ==========================================");
    log.info("[Sync] Starting cloud sync for user:", userId);
    log.info(
      "[Sync] Supabase URL:",
      process.env.SUPABASE_URL ? "Configured" : "NOT CONFIGURED"
    );
    log.info(
      "[Sync] Supabase Key:",
      process.env.SUPABASE_ANON_KEY ? "Configured" : "NOT CONFIGURED"
    );
    log.info("[Sync] Checking if storage bucket exists...");

    const bucketReady = await this.ensureBucketExists();
    if (!bucketReady) {
      const error =
        "Storage bucket is not available. Please check Supabase configuration.";
      log.error("[Sync]", error);
      result.success = false;
      result.errors.push(error);
      return result;
    }
    log.info("[Sync] Storage bucket is ready!");

    // Get all local issues for this user
    const localIssues = issueService.getIssues(userId);

    // Create sync history record
    const syncHistoryId = await this.createSyncHistory(
      userId,
      "push",
      localIssues.length
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
          log.info(`[Sync] Processing issue: ${issue.id} - ${issue.title}`);
          log.info(`[Sync] File path: ${issue.filePath}`);
          log.info(`[Sync] Thumbnail path: ${issue.thumbnailPath || "none"}`);

          // Upload file to storage and get public URL
          let cloudFileUrl: string | null = null;
          let cloudThumbnailUrl: string | null = null;

          try {
            // Upload main file
            if (issue.filePath) {
              log.info(
                `[Sync] Starting main file upload for issue ${issue.id}`
              );
              cloudFileUrl = await this.uploadFileToStorage(
                issue.filePath,
                userId,
                issue.id
              );
              if (cloudFileUrl) {
                log.info(
                  `[Sync] Main file uploaded successfully: ${cloudFileUrl}`
                );
              } else {
                log.warn(
                  `[Sync] Main file upload returned null for issue ${issue.id}`
                );
              }
            }

            // Upload thumbnail if exists
            if (issue.thumbnailPath) {
              log.info(
                `[Sync] Starting thumbnail upload for issue ${issue.id}`
              );
              cloudThumbnailUrl = await this.uploadFileToStorage(
                issue.thumbnailPath,
                userId,
                `${issue.id}_thumbnail`
              );
              if (cloudThumbnailUrl) {
                log.info(
                  `[Sync] Thumbnail uploaded successfully: ${cloudThumbnailUrl}`
                );
              } else {
                log.warn(
                  `[Sync] Thumbnail upload returned null for issue ${issue.id}`
                );
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
            .from("issues")
            .select("id, cloud_file_url, cloud_thumbnail_url")
            .eq("id", issue.id)
            .eq("user_id", userId)
            .single();

          const issueData = {
            id: issue.id,
            user_id: userId,
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
          };

          log.info(`[Sync] Preparing to save issue ${issue.id} to database`);
          log.info(
            `[Sync] Cloud file URL: ${issueData.cloud_file_url || "null"}`
          );
          log.info(
            `[Sync] Cloud thumbnail URL: ${issueData.cloud_thumbnail_url || "null"}`
          );

          if (existingIssue) {
            // Update existing issue
            log.info(`[Sync] Updating existing issue in database: ${issue.id}`);
            const { error } = await supabase
              .from("issues")
              .update(issueData)
              .eq("id", issue.id)
              .eq("user_id", userId);

            if (error) {
              log.error(
                `[Sync] Database update error for issue ${issue.id}:`,
                error
              );
              throw error;
            }
            log.info(`[Sync] Issue updated successfully in database`);
          } else {
            // Insert new issue
            log.info(`[Sync] Inserting new issue into database: ${issue.id}`);
            const { error } = await supabase.from("issues").insert(issueData);

            if (error) {
              log.error(
                `[Sync] Database insert error for issue ${issue.id}:`,
                error
              );
              throw error;
            }
            log.info(`[Sync] Issue inserted successfully into database`);
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

          await issueService.updateIssue(issue.id, localUpdateData);
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
   */
  async fetchFromCloud(userId: string): Promise<SyncResult> {
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

    // Create sync history record
    const syncHistoryId = await this.createSyncHistory(userId, "pull", 0);
    result.syncHistoryId = syncHistoryId || undefined;

    try {
      // Fetch all issues from Supabase for this user
      const { data: cloudIssues, error } = await supabase
        .from("issues")
        .select("*")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false });

      if (error) {
        throw error;
      }

      if (!cloudIssues || cloudIssues.length === 0) {
        log.info("[Sync] No cloud issues found for user");
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

      log.info(`[Sync] Found ${cloudIssues.length} cloud issues`);

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
          log.info(
            `[Sync] Processing cloud issue: ${cloudIssue.id} - ${cloudIssue.title}`
          );

          let localFilePath = cloudIssue.file_path;
          let localThumbnailPath = cloudIssue.thumbnail_path;

          // Check if this is a cloud-only issue (not in local storage)
          if (!localIssueIds.has(cloudIssue.id)) {
            log.info(
              `[Sync] Cloud-only issue detected: ${cloudIssue.id}, downloading files...`
            );

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
                log.info(`[Sync] ✓ Main file downloaded: ${downloadedPath}`);
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
            } else {
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
                log.info(
                  `[Sync] ✓ Thumbnail downloaded: ${downloadedThumbnail}`
                );
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
            userId: cloudIssue.user_id,
            tags: cloudIssue.tags || [],
          };

          if (localIssueIds.has(cloudIssue.id)) {
            // Update existing local issue
            log.info(`[Sync] Updating existing local issue: ${cloudIssue.id}`);
            await issueService.updateIssue(cloudIssue.id, issueData);
          } else {
            // Create new local issue with downloaded files
            log.info(`[Sync] Creating new local issue: ${cloudIssue.id}`);
            // We need to create the issue directly in the store
            // Import Store to directly manipulate the issues
            const Store = (await import("electron-store")).default;
            const store = new Store<{ issues: Array<Record<string, unknown>> }>(
              {
                name: "snapflow-issues",
                defaults: { issues: [] },
              }
            );
            const issues = store.get("issues");
            issues.push(issueData);
            store.set("issues", issues);

            // Save metadata to file system
            const { storageManager } = await import("../utils/storage");
            await storageManager.saveMetadata(cloudIssue.id, issueData);
          }

          result.syncedCount++;
          log.info(`[Sync] ✓ Issue synced: ${cloudIssue.id}`);
        } catch (error) {
          result.failedCount++;
          result.errors.push(
            `Failed to sync issue ${cloudIssue.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          log.error(`[Sync] Failed to sync issue ${cloudIssue.id}:`, error);
        }
      }

      result.success = result.failedCount === 0;

      // Update sync history
      if (syncHistoryId) {
        await this.updateSyncHistory(syncHistoryId, {
          status: result.success ? "completed" : "failed",
          synced_count: result.syncedCount,
          failed_count: result.failedCount,
          errors: result.errors,
        });
      }

      log.info(
        `[Sync] Fetch from cloud complete: ${result.syncedCount} synced, ${result.failedCount} failed`
      );
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
   * Full sync: Push local changes to cloud and pull cloud changes to local
   */
  async fullSync(userId: string): Promise<SyncResult> {
    // First push local changes to cloud
    const pushResult = await this.syncAllToCloud(userId);

    // Then pull cloud changes to local
    const pullResult = await this.fetchFromCloud(userId);

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

import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import { format } from "date-fns";

export class StorageManager {
  private baseDir: string;
  private currentUserId: string | null = null;

  constructor(customPath?: string) {
    // Delay initialization until app is ready
    if (customPath) {
      this.baseDir = customPath;
    } else {
      // Will be initialized in ensureDirectories
      this.baseDir = "";
    }
  }

  /**
   * Set the current user ID for user-specific storage paths
   */
  setCurrentUser(userId: string): void {
    this.currentUserId = userId;
  }

  /**
   * Clear the current user (on logout)
   */
  clearCurrentUser(): void {
    this.currentUserId = null;
  }

  /**
   * Get user-specific base directory
   */
  private getUserBaseDir(): string {
    if (!this.baseDir) {
      this.baseDir = path.join(app.getPath("home"), "SnapFlow");
    }

    // If we have a user ID, use user-specific folder
    if (this.currentUserId) {
      return path.join(this.baseDir, "Users", this.currentUserId);
    }

    // Fallback to base directory (for backward compatibility or when no user is logged in)
    return this.baseDir;
  }

  async ensureDirectories() {
    if (!this.baseDir) {
      this.baseDir = path.join(app.getPath("home"), "SnapFlow");
    }

    const userBaseDir = this.getUserBaseDir();
    await fs.mkdir(userBaseDir, { recursive: true });
    await fs.mkdir(path.join(userBaseDir, "Captures"), { recursive: true });
    await fs.mkdir(path.join(userBaseDir, "screenshots"), { recursive: true });
  }

  getCapturePath(issueId: string): string {
    const now = new Date();
    const year = format(now, "yyyy");
    const month = format(now, "MM");
    const day = format(now, "dd");

    const userBaseDir = this.getUserBaseDir();
    return path.join(userBaseDir, "Captures", year, month, day, issueId);
  }

  async createIssueDirectory(issueId: string): Promise<string> {
    const dirPath = this.getCapturePath(issueId);
    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
  }

  async saveCapture(
    issueId: string,
    fileName: string,
    data: Buffer
  ): Promise<string> {
    const dirPath = await this.createIssueDirectory(issueId);
    const filePath = path.join(dirPath, fileName);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async saveMetadata(
    issueId: string,
    metadata: Record<string, unknown>
  ): Promise<string> {
    const dirPath = await this.createIssueDirectory(issueId);
    const metaPath = path.join(dirPath, "meta.json");
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    return metaPath;
  }

  async loadMetadata(issueId: string): Promise<Record<string, unknown>> {
    const dirPath = this.getCapturePath(issueId);
    const metaPath = path.join(dirPath, "meta.json");
    const data = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(data);
  }

  async deleteIssue(issueId: string): Promise<void> {
    const dirPath = this.getCapturePath(issueId);
    await fs.rm(dirPath, { recursive: true, force: true });
  }

  getBaseDir(): string {
    return this.getUserBaseDir();
  }

  setBaseDir(newPath: string): void {
    this.baseDir = newPath;
  }

  /**
   * Get the current user ID
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Get path for a recording file
   */
  getRecordingPath(issueId: string): string {
    const dirPath = this.getCapturePath(issueId);
    return path.join(dirPath, "recording.webm");
  }

  /**
   * Get path for a thumbnail
   */
  getThumbnailPath(issueId: string): string {
    const dirPath = this.getCapturePath(issueId);
    // For recordings, use recording_thumbnail.png; for screenshots, use thumbnail.png
    const fileName = issueId.startsWith("rec_")
      ? "recording_thumbnail.png"
      : "thumbnail.png";
    return path.join(dirPath, fileName);
  }

  /**
   * Save a file with a specific extension
   */
  async saveFile(
    issueId: string,
    data: Buffer,
    extension: string
  ): Promise<string> {
    const dirPath = await this.createIssueDirectory(issueId);
    const fileName = `recording.${extension}`;
    const filePath = path.join(dirPath, fileName);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  /**
   * Save a thumbnail image
   */
  async saveThumbnail(issueId: string, data: Buffer): Promise<string> {
    const dirPath = await this.createIssueDirectory(issueId);
    // For recordings, use recording_thumbnail.png; for screenshots, use thumbnail.png
    const fileName = issueId.startsWith("rec_")
      ? "recording_thumbnail.png"
      : "thumbnail.png";
    const filePath = path.join(dirPath, fileName);
    await fs.writeFile(filePath, data);
    return filePath;
  }
}

export const storageManager = new StorageManager();

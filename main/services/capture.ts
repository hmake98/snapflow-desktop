import {
  screen,
  desktopCapturer,
  BrowserWindow,
  clipboard,
  DesktopCapturerSource,
  nativeImage,
} from "electron";
import log from "electron-log";
import { storageManager } from "../utils/storage";
import ffmpeg from "fluent-ffmpeg";
import { EventEmitter } from "events";
import path from "path";
import { execSync } from "child_process";
import fs from "fs";

// Initialize FFmpeg - delay until recording starts
function ensureFFmpegReady() {
  // Try multiple approaches to find FFmpeg
  const pathsToTry: string[] = [];

  // Approach 1: Direct path from ffmpeg-static (works in node_modules)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require("ffmpeg-static") as string;
    if (ffmpegStatic && typeof ffmpegStatic === "string") {
      pathsToTry.push(ffmpegStatic);
    }
  } catch (_e) {
    log.warn("[Recording] Could not require ffmpeg-static");
  }

  // Approach 2: Relative to node_modules (for bundled/built version)
  try {
    const nodeModulesPath = path.join(
      __dirname,
      "..",
      "..",
      "node_modules",
      "ffmpeg-static",
      "ffmpeg"
    );
    pathsToTry.push(nodeModulesPath);
  } catch (_e) {
    log.warn("[Recording] Could not construct node_modules path");
  }

  // Approach 3: Relative to app root
  try {
    const appRootPath = path.join(__dirname, "..", "ffmpeg");
    pathsToTry.push(appRootPath);
  } catch (_e) {
    log.warn("[Recording] Could not construct app root path");
  }

  // Try each path
  for (const ffmpegPath of pathsToTry) {
    if (fs.existsSync(ffmpegPath)) {
      log.info("[Recording] Using FFmpeg from:", ffmpegPath);
      ffmpeg.setFfmpegPath(ffmpegPath);
      return true;
    }
  }

  // Fallback: try system FFmpeg
  try {
    const ffmpegPath = execSync(
      process.platform === "win32"
        ? "where ffmpeg 2>nul"
        : "which ffmpeg 2>/dev/null",
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }
    ).trim();
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      log.info("[Recording] Using system FFmpeg from:", ffmpegPath);
      ffmpeg.setFfmpegPath(ffmpegPath);
      return true;
    }
  } catch (_e) {
    log.warn("[Recording] System FFmpeg not found");
  }

  log.error("[Recording] FFmpeg not found in any expected location");
  log.error("[Recording] Searched paths:", pathsToTry);
  return false;
}

interface CaptureOptions {
  mode: "fullscreen" | "window" | "region" | "all-screens" | "specific-screen";
  windowId?: string;
  screenId?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class CaptureService extends EventEmitter {
  // Recording state
  private recordingWindow: BrowserWindow | null = null;
  private recordingBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
  private recordingStartTime: number | null = null;
  private ffmpegProcess: ffmpeg.FfmpegCommand | null = null;
  private recordingOutputPath: string | null = null;

  constructor() {
    super();
  }

  /**
   * Clear the permission cache (no-op, kept for compatibility)
   * Windows and Linux don't require screen recording permission
   */
  clearPermissionCache(): void {
    // No-op - Windows and Linux don't have permission model
  }

  /**
   * Check if the app can capture screen (always true for Windows/Linux)
   * Windows and Linux don't require explicit screen recording permission
   */
  async checkScreenRecordingPermission(): Promise<boolean> {
    // Windows and Linux always allow screen capture without permission
    return true;
  }

  /**
   * Main capture method - handles fullscreen, window, and region captures
   */
  async captureScreenshot(
    options: CaptureOptions
  ): Promise<{ dataUrl: string; buffer: Buffer }> {
    try {
      log.info(
        "[Capture] Starting screenshot capture with options:",
        JSON.stringify(options)
      );

      const primaryDisplay = screen.getPrimaryDisplay();
      const scaleFactor = primaryDisplay.scaleFactor || 1;
      const { width, height } = primaryDisplay.size;

      log.info(
        "[Capture] Display info - width:",
        width,
        "height:",
        height,
        "scaleFactor:",
        scaleFactor
      );

      // Get desktop sources - this will trigger permission prompt if not granted
      log.info("[Capture] Requesting desktop sources...");
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: {
          width: Math.floor(width * scaleFactor),
          height: Math.floor(height * scaleFactor),
        },
        fetchWindowIcons: false,
      });

      log.info("[Capture] Retrieved", sources.length, "sources");
      if (sources.length > 0) {
        log.info(
          "[Capture] Available sources:",
          sources.map((s) => ({ id: s.id, name: s.name }))
        );
      }

      if (sources.length === 0) {
        log.error(
          "[Capture] No sources available - permission likely not granted"
        );
        throw new Error(
          "Screen Recording permission denied. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording, then completely quit and restart SnapFlow."
        );
      }

      // Handle special multi-screen modes
      if (options.mode === "all-screens") {
        return this.captureAllScreens();
      }

      if (options.mode === "specific-screen" && options.screenId) {
        const displayId = parseInt(options.screenId);
        return this.captureSpecificScreen(displayId);
      }

      // Select the appropriate source
      let source: DesktopCapturerSource | undefined;
      if (options.mode === "window" && options.windowId) {
        log.info("[Capture] Looking for window with ID:", options.windowId);
        source = sources.find((s) => s.id === options.windowId);
        log.info("[Capture] Window source found:", !!source);
      } else {
        // For fullscreen or region, get the primary screen
        log.info("[Capture] Looking for screen source...");
        source = sources.find((s) => s.id.startsWith("screen"));
        log.info("[Capture] Screen source found:", source?.id);
      }

      if (!source) {
        log.error("[Capture] No matching source found for mode:", options.mode);
        throw new Error("No capture source found");
      }

      // Handle region capture
      if (options.mode === "region" && options.bounds) {
        log.info("[Capture] Region mode - cropping to bounds:", options.bounds);
        const cropRect = {
          x: Math.max(0, Math.floor(options.bounds.x)),
          y: Math.max(0, Math.floor(options.bounds.y)),
          width: Math.floor(options.bounds.width),
          height: Math.floor(options.bounds.height),
        };

        const croppedImage = source.thumbnail.crop(cropRect);
        const buffer = croppedImage.toPNG();
        log.info(
          "[Capture] Region screenshot captured, buffer size:",
          buffer.length,
          "bytes"
        );

        // Copy to clipboard
        clipboard.writeImage(croppedImage);

        const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
        log.info("[Capture] Region dataUrl length:", dataUrl.length);
        return { dataUrl, buffer };
      }

      // Fullscreen or window capture
      log.info("[Capture] Processing", options.mode, "capture...");
      const thumbnailSize = source.thumbnail.getSize();
      log.info("[Capture] Thumbnail size:", thumbnailSize);

      const buffer = source.thumbnail.toPNG();
      log.info("[Capture] Screenshot buffer size:", buffer.length, "bytes");

      // Copy to clipboard
      clipboard.writeImage(source.thumbnail);
      log.info("[Capture] Image copied to clipboard");

      const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
      log.info("[Capture] DataUrl length:", dataUrl.length);
      log.info("[Capture] Screenshot capture completed successfully");

      return { dataUrl, buffer };
    } catch (error) {
      log.error("[Capture] Screenshot capture error:", error);
      log.error("[Capture] Error stack:", (error as Error).stack);
      throw error;
    }
  }

  /**
   * Save screenshot to storage
   */
  async saveScreenshot(issueId: string, buffer: Buffer): Promise<string> {
    const filePath = await storageManager.saveCapture(
      issueId,
      "capture.png",
      buffer
    );
    return filePath;
  }

  /**
   * Create thumbnail from screenshot
   */
  async createThumbnail(buffer: Buffer, issueId: string): Promise<string> {
    // Create a NativeImage from the buffer
    const image = nativeImage.createFromBuffer(buffer);
    const size = image.getSize();

    // Calculate new dimensions maintaining aspect ratio (max 800x600)
    let newWidth = size.width;
    let newHeight = size.height;

    const maxWidth = 800;
    const maxHeight = 600;

    if (newWidth > maxWidth || newHeight > maxHeight) {
      const widthRatio = maxWidth / newWidth;
      const heightRatio = maxHeight / newHeight;
      const ratio = Math.min(widthRatio, heightRatio);

      newWidth = Math.floor(newWidth * ratio);
      newHeight = Math.floor(newHeight * ratio);
    }

    // Resize the image
    const resizedImage = image.resize({ width: newWidth, height: newHeight });

    // Convert to PNG buffer
    const thumbnailBuffer = resizedImage.toPNG();

    const thumbnailPath = await storageManager.saveThumbnail(
      issueId,
      thumbnailBuffer
    );
    return thumbnailPath;
  }

  /**
   * Get available displays for multi-screen capture
   */
  getAvailableDisplays(): Array<{
    id: number;
    label: string;
    bounds: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
    isPrimary: boolean;
  }> {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();

    return displays.map((display, index) => ({
      id: display.id,
      label:
        display.id === primaryDisplay.id
          ? `Display ${index + 1} (Primary)`
          : `Display ${index + 1}`,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor || 1,
      isPrimary: display.id === primaryDisplay.id,
    }));
  }

  /**
   * Capture all screens and combine them into a single image
   */
  async captureAllScreens(): Promise<{ dataUrl: string; buffer: Buffer }> {
    try {
      log.info("[Capture] Starting all screens capture...");

      const displays = screen.getAllDisplays();
      log.info("[Capture] Found", displays.length, "displays");

      if (displays.length === 1) {
        // If only one display, use regular fullscreen capture
        return this.captureScreenshot({ mode: "fullscreen" });
      }

      // Get sources for all screens
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1920, height: 1080 }, // High resolution for quality
        fetchWindowIcons: false,
      });

      if (sources.length === 0) {
        throw new Error("No screen sources available");
      }

      // Calculate combined canvas dimensions
      let minX = 0,
        minY = 0,
        maxX = 0,
        maxY = 0;
      displays.forEach((display) => {
        minX = Math.min(minX, display.bounds.x);
        minY = Math.min(minY, display.bounds.y);
        maxX = Math.max(maxX, display.bounds.x + display.bounds.width);
        maxY = Math.max(maxY, display.bounds.y + display.bounds.height);
      });

      const totalWidth = maxX - minX;
      const totalHeight = maxY - minY;

      log.info("[Capture] Combined dimensions:", {
        totalWidth,
        totalHeight,
        minX,
        minY,
      });

      // Create a combined image using the first screen as base and overlaying others
      // For now, we'll capture the primary display and add a note about multi-screen
      const primaryDisplay = screen.getPrimaryDisplay();
      const primarySource = sources.find((s) =>
        s.id.includes(primaryDisplay.id.toString())
      );

      if (!primarySource) {
        // Fallback to first available screen
        const firstSource = sources[0];
        const buffer = firstSource.thumbnail.toPNG();
        clipboard.writeImage(firstSource.thumbnail);

        const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
        return { dataUrl, buffer };
      }

      const buffer = primarySource.thumbnail.toPNG();
      clipboard.writeImage(primarySource.thumbnail);

      const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
      log.info("[Capture] All screens capture completed (primary display)");

      return { dataUrl, buffer };
    } catch (error) {
      log.error("[Capture] All screens capture error:", error);
      throw error;
    }
  }

  /**
   * Capture a specific screen by display ID
   */
  async captureSpecificScreen(
    displayId: number
  ): Promise<{ dataUrl: string; buffer: Buffer }> {
    try {
      log.info("[Capture] Capturing specific screen:", displayId);

      const displays = screen.getAllDisplays();
      const targetDisplay = displays.find((d) => d.id === displayId);

      if (!targetDisplay) {
        throw new Error(`Display with ID ${displayId} not found`);
      }

      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.floor(
            targetDisplay.bounds.width * (targetDisplay.scaleFactor || 1)
          ),
          height: Math.floor(
            targetDisplay.bounds.height * (targetDisplay.scaleFactor || 1)
          ),
        },
        fetchWindowIcons: false,
      });

      // Find the source that matches our target display
      const targetSource = sources.find((s) =>
        s.id.includes(displayId.toString())
      );

      if (!targetSource) {
        // Fallback to first screen source if we can't match by ID
        const screenSource = sources.find((s) => s.id.startsWith("screen"));
        if (!screenSource) {
          throw new Error("No screen source found");
        }

        const buffer = screenSource.thumbnail.toPNG();
        clipboard.writeImage(screenSource.thumbnail);

        const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
        return { dataUrl, buffer };
      }

      const buffer = targetSource.thumbnail.toPNG();
      clipboard.writeImage(targetSource.thumbnail);

      const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
      log.info("[Capture] Specific screen capture completed");

      return { dataUrl, buffer };
    } catch (error) {
      log.error("[Capture] Specific screen capture error:", error);
      throw error;
    }
  }

  /**
   * Get available windows for window capture
   * Returns empty array if screen recording permission is not granted
   */
  async getAvailableWindows(): Promise<
    { id: string; name: string; thumbnail: string }[]
  > {
    // Check permission first to avoid triggering permission dialog in a loop
    const hasPermission = await this.checkScreenRecordingPermission();
    if (!hasPermission) {
      log.info(
        "[Capture] No screen recording permission, returning empty windows list"
      );
      return [];
    }

    const allWindows = BrowserWindow.getAllWindows();
    const snapflowWindowIds = allWindows.map((win) => `window:${win.id}:0`);

    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 150, height: 150 },
    });

    return sources
      .filter((source) => {
        if (source.name === "") return false;
        if (snapflowWindowIds.includes(source.id)) return false;
        if (source.name.toLowerCase().includes("snapflow")) return false;
        return true;
      })
      .map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
      }));
  }

  /**
   * Start screen recording for a specific region using FFmpeg
   */
  async startRecording(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<void> {
    if (this.ffmpegProcess) {
      throw new Error("Recording already in progress");
    }

    log.info("[Recording] Starting FFmpeg recording with bounds:", bounds);

    this.recordingBounds = bounds;
    this.recordingStartTime = Date.now();

    // Generate output path
    const issueId = `rec_${Date.now()}`;
    this.recordingOutputPath = storageManager.getRecordingPath(issueId);

    // Ensure output directory exists
    const fs = await import("fs");
    const path = await import("path");
    const dirPath = path.dirname(this.recordingOutputPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    try {
      // Ensure FFmpeg is properly configured
      if (!ensureFFmpegReady()) {
        throw new Error(
          "FFmpeg not found - please install FFmpeg or use ffmpeg-static npm package"
        );
      }

      // Get display info for proper screen capture coordinates
      const primaryDisplay = screen.getPrimaryDisplay();
      const displayBounds = primaryDisplay.bounds;
      const scaleFactor = primaryDisplay.scaleFactor || 1;

      // Adjust bounds for display scale factor and position
      const adjustedX = Math.floor((bounds.x - displayBounds.x) * scaleFactor);
      const adjustedY = Math.floor((bounds.y - displayBounds.y) * scaleFactor);
      const adjustedWidth = Math.floor(bounds.width * scaleFactor);
      const adjustedHeight = Math.floor(bounds.height * scaleFactor);

      log.info("[Recording] Adjusted bounds:", {
        x: adjustedX,
        y: adjustedY,
        width: adjustedWidth,
        height: adjustedHeight,
        scaleFactor,
      });

      // Configure FFmpeg command based on platform
      let ffmpegCmd = ffmpeg();
      const platform = process.platform;

      if (platform === "darwin") {
        // macOS: use AVFoundation screen capture with crop filter
        const cropFilter = `crop=${adjustedWidth}:${adjustedHeight}:${adjustedX}:${adjustedY}`;
        ffmpegCmd = ffmpeg()
          .input("1") // macOS screen 1 (primary display)
          .inputFormat("avfoundation")
          .inputOptions(["-framerate 30"])
          .videoFilters(cropFilter)
          .videoCodec("libvpx-vp9")
          .outputOptions([
            "-b:v 2500k",
            "-deadline realtime",
            "-cpu-used 5",
            "-row-mt 1",
          ])
          .format("webm")
          .output(this.recordingOutputPath);
      } else if (platform === "win32") {
        // Windows: use GDIgrab with absolute coordinates
        ffmpegCmd = ffmpeg()
          .input("desktop")
          .inputFormat("gdigrab")
          .inputOptions([
            `-offset_x ${Math.floor(bounds.x)}`,
            `-offset_y ${Math.floor(bounds.y)}`,
            `-video_size ${Math.floor(bounds.width)}x${Math.floor(bounds.height)}`,
            "-framerate 30",
          ])
          .videoCodec("libvpx-vp9")
          .outputOptions([
            "-b:v 2500k",
            "-deadline realtime",
            "-cpu-used 5",
            "-row-mt 1",
          ])
          .format("webm")
          .output(this.recordingOutputPath);
      } else {
        // Linux: use x11grab
        const display = process.env.DISPLAY || ":0";
        ffmpegCmd = ffmpeg()
          .input(`${display}+${Math.floor(bounds.x)},${Math.floor(bounds.y)}`)
          .inputFormat("x11grab")
          .inputOptions([
            "-framerate 30",
            `-video_size ${Math.floor(bounds.width)}x${Math.floor(bounds.height)}`,
          ])
          .videoCodec("libvpx-vp9")
          .outputOptions([
            "-b:v 2500k",
            "-deadline realtime",
            "-cpu-used 5",
            "-row-mt 1",
          ])
          .format("webm")
          .output(this.recordingOutputPath);
      }

      // Handle errors
      ffmpegCmd.on("error", (err) => {
        log.error("[Recording] FFmpeg error:", err);
        this.ffmpegProcess = null;
      });

      ffmpegCmd.on("end", () => {
        log.info("[Recording] FFmpeg process finished");
      });

      // Start recording
      log.info("[Recording] Starting FFmpeg process...");
      this.ffmpegProcess = ffmpegCmd;
      ffmpegCmd.run();

      log.info("[Recording] FFmpeg recording started successfully");
    } catch (error) {
      this.ffmpegProcess = null;
      this.recordingOutputPath = null;
      this.recordingBounds = null;
      this.recordingStartTime = null;
      log.error("[Recording] Failed to start recording:", error);
      throw error;
    }
  }

  /**
   * Stop screen recording and save the video
   */
  async stopRecording(): Promise<{
    issueId: string;
    filePath: string;
    thumbnailPath: string;
    duration: number;
  }> {
    if (
      !this.ffmpegProcess ||
      !this.recordingOutputPath ||
      !this.recordingBounds
    ) {
      throw new Error("No recording in progress");
    }

    log.info("[Recording] Stopping FFmpeg recording");

    const duration = this.recordingStartTime
      ? Date.now() - this.recordingStartTime
      : 0;
    const issueId =
      this.recordingOutputPath.match(/rec_\d+/)?.[0] || `rec_${Date.now()}`;

    try {
      // Stop the FFmpeg process
      log.info("[Recording] Sending stop signal to FFmpeg...");
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("FFmpeg stop timeout")),
          10000
        );

        this.ffmpegProcess?.kill();

        // Wait a bit for the file to be written
        setTimeout(() => {
          clearTimeout(timeout);
          resolve();
        }, 500);
      });

      log.info("[Recording] FFmpeg process stopped");

      // Verify output file exists
      const fs = await import("fs");
      if (!fs.existsSync(this.recordingOutputPath)) {
        throw new Error(`Output file not created: ${this.recordingOutputPath}`);
      }

      const fileSize = fs.statSync(this.recordingOutputPath).size;
      log.info("[Recording] Video file created, size:", fileSize, "bytes");

      // Generate thumbnail from video
      const thumbnailPath = await this.createVideoThumbnail(
        this.recordingOutputPath,
        issueId
      );

      log.info("[Recording] Thumbnail saved to:", thumbnailPath);

      // Clean up
      this.ffmpegProcess = null;
      this.recordingOutputPath = null;
      this.recordingBounds = null;
      this.recordingStartTime = null;

      const outputPath = this.recordingOutputPath;
      return {
        issueId,
        filePath: outputPath,
        thumbnailPath,
        duration,
      };
    } catch (error) {
      log.error("[Recording] Error stopping recording:", error);

      // Kill FFmpeg process if still running
      if (this.ffmpegProcess) {
        try {
          this.ffmpegProcess.kill();
        } catch (killError) {
          log.warn("[Recording] Error killing FFmpeg:", killError);
        }
      }

      // Clean up
      this.ffmpegProcess = null;
      this.recordingOutputPath = null;
      this.recordingBounds = null;
      this.recordingStartTime = null;

      throw error;
    }
  }

  /**
   * Create thumbnail from video file
   */
  async createVideoThumbnail(
    videoPath: string,
    issueId: string
  ): Promise<string> {
    try {
      log.info("[Recording] Creating thumbnail from video:", videoPath);

      // Create a hidden window to extract a video frame for the thumbnail.
      // We load about:blank and inject all logic via executeJavaScript so that
      // inline-script CSP restrictions are completely bypassed.
      const thumbWindow = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: false,
          webSecurity: false, // needed to load file:// video URLs
        },
      });

      await thumbWindow.loadURL(
        "data:text/html;charset=utf-8,<!DOCTYPE html><html><body></body></html>"
      );

      const videoUrl = `file://${videoPath}`;
      const thumbnailData = await thumbWindow.webContents.executeJavaScript(`
        (function() {
          return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            video.muted = true;
            document.body.appendChild(video);
            document.body.appendChild(canvas);

            video.onloadeddata = () => {
              video.currentTime = Math.min(video.duration * 0.1, 1);
            };

            video.onseeked = () => {
              try {
                canvas.width  = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                  if (!blob) { reject(new Error('toBlob returned null')); return; }
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.onerror   = reject;
                  reader.readAsArrayBuffer(blob);
                }, 'image/png');
              } catch (err) {
                reject(err);
              }
            };

            video.onerror = () => reject(new Error('Video load error'));
            video.src  = ${JSON.stringify(videoUrl)};
            video.load();
          });
        })()
      `);

      thumbWindow.close();

      // Save thumbnail
      const thumbnailBuffer = Buffer.from(thumbnailData);
      const resizedThumbnail = await this.resizeThumbnail(thumbnailBuffer);
      const thumbnailPath = await storageManager.saveThumbnail(
        issueId,
        resizedThumbnail
      );

      log.info("[Recording] Thumbnail created successfully:", thumbnailPath);
      return thumbnailPath;
    } catch (error) {
      log.error("[Recording] Failed to create thumbnail:", error);

      // Fallback: create a placeholder thumbnail
      const placeholderImage = nativeImage.createEmpty();
      const thumbnailBuffer = placeholderImage.toPNG();
      const thumbnailPath = storageManager.getThumbnailPath(issueId);

      const fs = await import("fs");
      const path = await import("path");
      const dirPath = path.dirname(thumbnailPath);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(thumbnailPath, thumbnailBuffer);
      return thumbnailPath;
    }
  }

  /**
   * Resize thumbnail to standard size
   */
  private async resizeThumbnail(buffer: Buffer): Promise<Buffer> {
    const image = nativeImage.createFromBuffer(buffer);
    const size = image.getSize();

    // Calculate new dimensions maintaining aspect ratio (max 800x600)
    let newWidth = size.width;
    let newHeight = size.height;

    const maxWidth = 800;
    const maxHeight = 600;

    if (newWidth > maxWidth || newHeight > maxHeight) {
      const widthRatio = maxWidth / newWidth;
      const heightRatio = maxHeight / newHeight;
      const ratio = Math.min(widthRatio, heightRatio);

      newWidth = Math.floor(newWidth * ratio);
      newHeight = Math.floor(newHeight * ratio);
    }

    // Resize the image
    const resizedImage = image.resize({ width: newWidth, height: newHeight });

    // Convert to PNG buffer
    return resizedImage.toPNG();
  }

  /**
   * Save recording with metadata (legacy method, kept for compatibility)
   */
  async saveRecording(
    issueId: string,
    videoData: Buffer,
    _bounds: { x: number; y: number; width: number; height: number }
  ): Promise<{ filePath: string; thumbnailPath: string }> {
    const filePath = await storageManager.saveFile(issueId, videoData, "webm");
    const thumbnailPath = await this.createVideoThumbnail(filePath, issueId);
    return { filePath, thumbnailPath };
  }
}

export const captureService = new CaptureService();

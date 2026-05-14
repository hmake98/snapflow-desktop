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

  // Approach 1: Direct path from ffmpeg-static (works in development)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require("ffmpeg-static") as string;
    if (ffmpegStatic && typeof ffmpegStatic === "string") {
      pathsToTry.push(ffmpegStatic);
    }
  } catch (_e) {
    log.warn("[Recording] Could not require ffmpeg-static");
  }

  // Approach 2: Common path patterns
  try {
    const candidatePaths = [
      // For development: node_modules/ffmpeg-static/ffmpeg
      path.join(__dirname, "..", "node_modules", "ffmpeg-static", "ffmpeg"),
      // For some builds: project root is one level up
      path.join(
        __dirname,
        "..",
        "..",
        "node_modules",
        "ffmpeg-static",
        "ffmpeg"
      ),
      // Try from process.cwd()
      path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
      // Try with /app in path
      path.join(
        process.cwd(),
        "app",
        "..",
        "node_modules",
        "ffmpeg-static",
        "ffmpeg"
      ),
      // Fixed path pattern
      "/Users/hmake98/Documents/snapflow-desktop/node_modules/ffmpeg-static/ffmpeg",
    ];

    for (const candidatePath of candidatePaths) {
      if (!pathsToTry.includes(candidatePath)) {
        pathsToTry.push(candidatePath);
      }
    }
  } catch (_e) {
    log.warn("[Recording] Could not construct candidate paths");
  }

  // Approach 3: Try absolute path using process.cwd()
  try {
    const ffmpegPath = path.join(
      process.cwd(),
      "node_modules",
      "ffmpeg-static",
      "ffmpeg"
    );
    pathsToTry.push(ffmpegPath);
  } catch (_e) {
    log.warn("[Recording] Could not construct cwd path");
  }

  // Approach 4: Try standard home directory location (if user installed ffmpeg)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const homeDir = require("os").homedir();
    const ffmpegPath = path.join(homeDir, ".local", "bin", "ffmpeg");
    pathsToTry.push(ffmpegPath);
  } catch (_e) {
    log.warn("[Recording] Could not construct home path");
  }

  // Try each path
  for (const ffmpegPath of pathsToTry) {
    if (fs.existsSync(ffmpegPath)) {
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
      ffmpeg.setFfmpegPath(ffmpegPath);
      return true;
    }
  } catch (_e) {
    log.warn("[Recording] System FFmpeg not found");
  }

  log.error("[Recording] FFmpeg not found in any expected location");
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
  /**
   * Virtual desktop origin of the overlay window (top-left corner in screen
   * coordinates). Provided when the overlay spans multiple displays so the
   * region capture can map selection coords back to the correct display.
   */
  originOffset?: { x: number; y: number };
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
   * Determine the best display to capture for a fullscreen shot.
   *
   * Priority (highest → lowest):
   *  1. Caller-supplied explicit display ID (e.g. from a tray menu action)
   *  2. Display currently containing the mouse cursor
   *  3. Primary display (safe fallback)
   *
   * On single-display systems this always returns the primary, so behaviour
   * is completely unchanged from the old code.
   */
  // eslint-disable-next-line no-undef
  getFullscreenTargetDisplay(explicitId?: number | null): Electron.Display {
    const allDisplays = screen.getAllDisplays();

    // Single-display — no ambiguity
    if (allDisplays.length === 1) return allDisplays[0];

    // Explicit caller preference
    if (explicitId != null) {
      const found = allDisplays.find((d) => d.id === explicitId);
      if (found) return found;
      log.warn(
        "[Capture] Explicit display ID not found, falling back to cursor display:",
        explicitId
      );
    }

    // Auto: display under the cursor — zero user interaction required
    try {
      const cursorPoint = screen.getCursorScreenPoint();
      const cursorDisplay = screen.getDisplayNearestPoint(cursorPoint);
      return cursorDisplay;
    } catch {
      return screen.getPrimaryDisplay();
    }
  }

  /**
   * Main capture method - handles fullscreen, window, and region captures
   */
  async captureScreenshot(
    options: CaptureOptions
  ): Promise<{ dataUrl: string; buffer: Buffer }> {
    try {
      // ── Multi-display fullscreen: auto-route to cursor display ────────────
      // On multi-monitor setups the legacy code always picked the primary
      // display. Instead we delegate to captureSpecificScreen() which already
      // handles correct source matching + thumbnail sizing per display.
      if (options.mode === "fullscreen" && screen.getAllDisplays().length > 1) {
        const targetDisplay = this.getFullscreenTargetDisplay();
        return this.captureSpecificScreen(targetDisplay.id);
      }

      const primaryDisplay = screen.getPrimaryDisplay();
      const scaleFactor = primaryDisplay.scaleFactor || 1;
      const { width, height } = primaryDisplay.size;

      // Handle special multi-screen modes before fetching sources
      if (options.mode === "all-screens") {
        return this.captureAllScreens();
      }

      if (options.mode === "specific-screen" && options.screenId) {
        const displayId = parseInt(options.screenId);
        return this.captureSpecificScreen(displayId);
      }

      // On macOS, desktopCapturer.getSources() called from the main process
      // occasionally returns a 0×0 thumbnail on the first call (timing race with
      // the OS compositor). Retry up to 3 times with a short delay before giving up.
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 400;
      let source: DesktopCapturerSource | undefined;
      let buffer = Buffer.alloc(0);

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: {
            width: Math.floor(width * scaleFactor),
            height: Math.floor(height * scaleFactor),
          },
          fetchWindowIcons: false,
        });

        if (sources.length === 0) {
          log.error(
            "[Capture] No sources available - permission likely not granted"
          );
          throw new Error(
            "Screen Recording permission denied. Please grant permission in System Preferences > Security & Privacy > Privacy > Screen Recording, then completely quit and restart SnapFlow."
          );
        }

        if (options.mode === "window" && options.windowId) {
          source = sources.find((s) => s.id === options.windowId);
        } else {
          source = sources.find((s) => s.id.startsWith("screen"));
        }

        if (!source) {
          log.error(
            "[Capture] No matching source found for mode:",
            options.mode
          );
          throw new Error("No capture source found");
        }

        buffer = source.thumbnail.toPNG() as Buffer<ArrayBuffer>;

        if (buffer.length >= 1000) break;

        if (attempt < MAX_RETRIES) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, RETRY_DELAY_MS)
          );
        }
      }

      if (!source || buffer.length < 1000) {
        throw new Error(
          "Screenshot capture returned an empty image. Ensure Screen Recording permission is granted in System Settings and try again."
        );
      }

      // Handle region capture
      if (options.mode === "region" && options.bounds) {
        // The bounds are in physical pixels relative to the overlay window origin.
        // Convert back to logical screen coordinates so we can find the display.
        const originX = options.originOffset?.x ?? 0;
        const originY = options.originOffset?.y ?? 0;

        // Identify which display the centre of the selection falls on.
        const allDisplays = screen.getAllDisplays();

        // Selection centre in logical screen coordinates (undo scale + origin)
        // We use the primary display's scale factor as a best-guess for the
        // overlay's devicePixelRatio; the renderer sends physical pixels.
        const primaryScale = screen.getPrimaryDisplay().scaleFactor || 1;
        const selCentreScreenX =
          originX +
          (options.bounds.x + options.bounds.width / 2) / primaryScale;
        const selCentreScreenY =
          originY +
          (options.bounds.y + options.bounds.height / 2) / primaryScale;

        const targetDisplay =
          allDisplays.find(
            (d) =>
              selCentreScreenX >= d.bounds.x &&
              selCentreScreenX < d.bounds.x + d.bounds.width &&
              selCentreScreenY >= d.bounds.y &&
              selCentreScreenY < d.bounds.y + d.bounds.height
          ) ?? screen.getPrimaryDisplay();

        const scaleFactor = targetDisplay.scaleFactor || 1;

        // Re-fetch sources sized to the target display
        const regionSources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: {
            width: Math.floor(targetDisplay.bounds.width * scaleFactor),
            height: Math.floor(targetDisplay.bounds.height * scaleFactor),
          },
          fetchWindowIcons: false,
        });

        const regionSource =
          regionSources.find((s) =>
            s.id.includes(targetDisplay.id.toString())
          ) || regionSources.find((s) => s.id.startsWith("screen"));

        if (!regionSource) {
          throw new Error("No source found for region capture");
        }

        // Convert selection bounds to physical pixels relative to the target display
        const displayOriginPhysX =
          (targetDisplay.bounds.x - originX) * scaleFactor;
        const displayOriginPhysY =
          (targetDisplay.bounds.y - originY) * scaleFactor;

        const cropRect = {
          x: Math.max(0, Math.floor(options.bounds.x - displayOriginPhysX)),
          y: Math.max(0, Math.floor(options.bounds.y - displayOriginPhysY)),
          width: Math.floor(options.bounds.width),
          height: Math.floor(options.bounds.height),
        };

        const croppedImage = regionSource.thumbnail.crop(cropRect);
        const regionBuffer = croppedImage.toPNG();

        clipboard.writeImage(croppedImage);
        return {
          dataUrl: `data:image/png;base64,${regionBuffer.toString("base64")}`,
          buffer: regionBuffer,
        };
      }

      // Fullscreen or window capture — buffer already fetched in the retry loop above

      // Copy to clipboard
      clipboard.writeImage(source.thumbnail);

      const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

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
      const displays = screen.getAllDisplays();

      if (displays.length === 1) {
        return this.captureScreenshot({ mode: "fullscreen" });
      }

      // Capture each display individually and collect its bitmap + physical size
      const captured: Array<{
        bitmap: Buffer;
        physicalWidth: number;
        physicalHeight: number;
        logicalX: number;
        logicalY: number;
      }> = [];

      for (const display of displays) {
        const physicalWidth = Math.floor(
          display.bounds.width * (display.scaleFactor || 1)
        );
        const physicalHeight = Math.floor(
          display.bounds.height * (display.scaleFactor || 1)
        );

        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: physicalWidth, height: physicalHeight },
          fetchWindowIcons: false,
        });

        const source =
          sources.find((s) => s.id.includes(display.id.toString())) ||
          sources.find((s) => s.id.startsWith("screen"));

        if (!source) {
          log.warn("[Capture] No source found for display:", display.id);
          continue;
        }

        const img = source.thumbnail;
        const size = img.getSize();
        if (size.width === 0 || size.height === 0) {
          log.warn("[Capture] Empty thumbnail for display:", display.id);
          continue;
        }

        captured.push({
          bitmap: img.toBitmap(),
          physicalWidth: size.width,
          physicalHeight: size.height,
          logicalX: display.bounds.x,
          logicalY: display.bounds.y,
        });
      }

      if (captured.length === 0) {
        throw new Error("No screen sources could be captured");
      }

      if (captured.length === 1) {
        // Only one display captured successfully — return it directly
        const only = captured[0];
        const img = nativeImage.createFromBitmap(only.bitmap, {
          width: only.physicalWidth,
          height: only.physicalHeight,
        });
        const buffer = img.toPNG();
        clipboard.writeImage(img);
        return {
          dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
          buffer,
        };
      }

      // Sort displays left-to-right, top-to-bottom by logical position
      captured.sort((a, b) =>
        a.logicalX !== b.logicalX
          ? a.logicalX - b.logicalX
          : a.logicalY - b.logicalY
      );

      // Stitch side-by-side: total width = sum, height = tallest
      const totalWidth = captured.reduce((sum, c) => sum + c.physicalWidth, 0);
      const totalHeight = Math.max(...captured.map((c) => c.physicalHeight));
      const CHANNELS = 4; // RGBA

      const output = Buffer.alloc(totalWidth * totalHeight * CHANNELS, 0);

      let xOffset = 0;
      for (const { bitmap, physicalWidth, physicalHeight } of captured) {
        for (let row = 0; row < physicalHeight; row++) {
          const srcStart = row * physicalWidth * CHANNELS;
          const dstStart = (row * totalWidth + xOffset) * CHANNELS;
          bitmap.copy(
            output,
            dstStart,
            srcStart,
            srcStart + physicalWidth * CHANNELS
          );
        }
        xOffset += physicalWidth;
      }

      const stitched = nativeImage.createFromBitmap(output, {
        width: totalWidth,
        height: totalHeight,
      });

      const buffer = stitched.toPNG();
      clipboard.writeImage(stitched);

      return {
        dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
        buffer,
      };
    } catch (error) {
      log.error("[Capture] All screens capture error:", error);
      throw error;
    }
  }

  /**
   * Capture a specific screen by display ID.
   * @param cropDock  When true, crops the dock area while keeping the menu bar.
   *                  Uses display.workArea vs display.bounds to compute the inset.
   */
  async captureSpecificScreen(
    displayId: number,
    cropDock = false
  ): Promise<{ dataUrl: string; buffer: Buffer }> {
    try {
      const displays = screen.getAllDisplays();
      const targetDisplay = displays.find((d) => d.id === displayId);

      if (!targetDisplay) {
        throw new Error(`Display with ID ${displayId} not found`);
      }

      const scaleFactor = targetDisplay.scaleFactor || 1;

      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.floor(targetDisplay.bounds.width * scaleFactor),
          height: Math.floor(targetDisplay.bounds.height * scaleFactor),
        },
        fetchWindowIcons: false,
      });

      const targetSource =
        sources.find((s) => s.id.includes(displayId.toString())) ||
        sources.find((s) => s.id.startsWith("screen"));

      if (!targetSource) {
        throw new Error("No screen source found");
      }

      let image = targetSource.thumbnail;

      if (cropDock) {
        // workArea excludes the dock (and menu bar). We want to keep the menu
        // bar but remove the dock, so we crop from the very top of the display
        // down to the bottom of the workArea, and horizontally to the workArea
        // width (handles side docks too).
        const { bounds, workArea } = targetDisplay;

        // Logical-pixel insets relative to display bounds
        const leftInset = workArea.x - bounds.x;
        const topInset = 0; // keep menu bar — do NOT use workArea.y as top
        const croppedWidth = workArea.width;
        const croppedHeight = workArea.y - bounds.y + workArea.height;

        // Convert to physical pixels
        const cropRect = {
          x: Math.floor(leftInset * scaleFactor),
          y: Math.floor(topInset * scaleFactor),
          width: Math.floor(croppedWidth * scaleFactor),
          height: Math.floor(croppedHeight * scaleFactor),
        };

        const imgSize = image.getSize();
        // Only crop if dimensions are valid and differ from the full image
        const needsCrop =
          cropRect.x > 0 ||
          cropRect.y > 0 ||
          cropRect.width < imgSize.width ||
          cropRect.height < imgSize.height;

        if (needsCrop && cropRect.width > 0 && cropRect.height > 0) {
          image = image.crop(cropRect);
        }
      }

      const buffer = image.toPNG();

      if (buffer.length < 1000) {
        throw new Error(
          "Screenshot capture returned an empty image. Ensure Screen Recording permission is granted in System Settings and try again."
        );
      }

      clipboard.writeImage(image);

      return {
        dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
        buffer,
      };
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
      const _adjustedX = Math.floor((bounds.x - displayBounds.x) * scaleFactor);
      const _adjustedY = Math.floor((bounds.y - displayBounds.y) * scaleFactor);
      const _adjustedWidth = Math.floor(bounds.width * scaleFactor);
      const _adjustedHeight = Math.floor(bounds.height * scaleFactor);

      // Configure FFmpeg command based on platform
      let ffmpegCmd = ffmpeg();
      const platform = process.platform;

      if (platform === "darwin") {
        // macOS: use AVFoundation screen capture (full screen).
        // We use the device NAME "Capture screen 0" instead of a numeric index.
        // Numeric indices (e.g. "1") are assigned dynamically and shift when
        // external cameras (iPhone Continuity Camera, USB cameras) are connected,
        // causing the wrong device to be recorded.  The name "Capture screen 0"
        // always refers to the primary display regardless of connected cameras.

        ffmpegCmd = ffmpeg()
          .input("Capture screen 0:none") // primary display, no audio
          .inputFormat("avfoundation")
          .inputOptions(["-framerate 30"])
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

      // Handle errors — clear the process reference so stopRecording's
      // poll loop can detect that FFmpeg has exited.
      ffmpegCmd.on("error", (err) => {
        const msg = err?.message ?? "";
        // SIGINT/SIGKILL are expected during graceful stop — log at info level
        const isGracefulStop =
          msg.includes("SIGINT") ||
          msg.includes("SIGKILL") ||
          msg.includes("killed with signal");
        if (!isGracefulStop) {
          log.error("[Recording] FFmpeg error:", err);
        }
        this.ffmpegProcess = null;
      });

      ffmpegCmd.on("end", () => {});

      // Start recording
      this.ffmpegProcess = ffmpegCmd;
      ffmpegCmd.run();
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

    const duration = this.recordingStartTime
      ? Date.now() - this.recordingStartTime
      : 0;
    const issueId =
      this.recordingOutputPath.match(/rec_\d+/)?.[0] || `rec_${Date.now()}`;

    try {
      // Save the output path before clearing it
      const outputPath = this.recordingOutputPath;

      // Stop the FFmpeg process gracefully.
      // Note: this.ffmpegProcess is a FfmpegCommand (not a ChildProcess), so
      // it has no .stdin or .killed property. We use kill('SIGINT') which tells
      // FFmpeg to stop encoding and finalize the output file — equivalent to
      // pressing Ctrl+C. The existing "error" event handler sets
      // this.ffmpegProcess = null, which the check interval uses to confirm exit.
      await new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          clearInterval(checkInterval);
          clearTimeout(forceKillTimeout);
          clearTimeout(resolveTimeout);
          resolve();
        };

        // Force kill after 8 seconds if FFmpeg hasn't stopped
        const forceKillTimeout = setTimeout(() => {
          log.warn("[Recording] FFmpeg did not stop within 8s, force killing");
          try {
            this.ffmpegProcess?.kill("SIGKILL");
          } catch (_e) {
            /* ignore */
          }
          // Give it 500ms after SIGKILL to let the error handler fire
          setTimeout(done, 500);
        }, 8000);

        // Safety resolve after 9 seconds regardless
        const resolveTimeout = setTimeout(done, 9000);

        // Poll: the existing error handler sets this.ffmpegProcess = null on stop
        const checkInterval = setInterval(() => {
          if (!this.ffmpegProcess) done();
        }, 100);

        // Send SIGINT — FFmpeg finalizes WebM index and exits cleanly
        try {
          this.ffmpegProcess?.kill("SIGINT");
        } catch (e) {
          log.warn("[Recording] Failed to send SIGINT, trying SIGKILL:", e);
          try {
            this.ffmpegProcess?.kill("SIGKILL");
          } catch (_e) {
            /* ignore */
          }
        }
      });

      // Verify output file exists and has data
      const fs = await import("fs");
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Output file not created: ${outputPath}`);
      }

      const fileSize = fs.statSync(outputPath).size;

      if (fileSize === 0) {
        throw new Error(
          "Recording file is empty - FFmpeg may not have encoded properly"
        );
      }

      // Generate thumbnail from video
      const thumbnailPath = await this.createVideoThumbnail(
        outputPath,
        issueId
      );

      // Clean up
      this.ffmpegProcess = null;
      this.recordingOutputPath = null;
      this.recordingBounds = null;
      this.recordingStartTime = null;

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
   * Create thumbnail from video file using FFmpeg frame extraction.
   * This is more reliable than loading the video in a hidden BrowserWindow,
   * because the Electron renderer cannot always decode WebM/VP9 via file://.
   */
  async createVideoThumbnail(
    videoPath: string,
    issueId: string
  ): Promise<string> {
    // Ensure the thumbnail directory exists
    const thumbnailPath = storageManager.getThumbnailPath(issueId);
    const dirPath = path.dirname(thumbnailPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Try FFmpeg frame extraction first
    try {
      if (!ensureFFmpegReady()) {
        throw new Error("FFmpeg not available for thumbnail extraction");
      }

      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .inputOptions(["-ss 1"]) // seek to 1-second mark
          .outputOptions([
            "-frames:v 1",
            "-vf scale=800:-2", // scale to max 800px wide, keep aspect ratio
            "-y", // overwrite output
          ])
          .output(thumbnailPath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      // Verify the file was actually written
      if (
        !fs.existsSync(thumbnailPath) ||
        fs.statSync(thumbnailPath).size === 0
      ) {
        throw new Error("FFmpeg wrote an empty or missing thumbnail file");
      }

      return thumbnailPath;
    } catch (error) {
      log.error("[Recording] Failed to create thumbnail:", error);

      // Fallback: write an empty placeholder so the rest of the flow doesn't break
      const placeholderBuffer = nativeImage.createEmpty().toPNG();
      fs.writeFileSync(thumbnailPath, placeholderBuffer);
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

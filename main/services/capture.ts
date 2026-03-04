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

export class CaptureService {
  // Cache permission status for the app session to avoid repeated permission dialogs
  // Note: macOS requires app restart after granting screen recording permission
  private permissionCache: {
    hasPermission: boolean;
    timestamp: number;
  } | null = null;
  private readonly PERMISSION_CACHE_DURATION = 60000; // 60 seconds (1 minute)

  // Recording state
  private recordingWindow: BrowserWindow | null = null;
  private recordingBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;
  private recordingStartTime: number | null = null;

  /**
   * Clear the permission cache to force a fresh check
   * Useful when user grants permission and we want to detect it immediately
   */
  clearPermissionCache(): void {
    this.permissionCache = null;
  }

  /**
   * Check if the app has screen recording permission (macOS)
   * Uses a cache to avoid triggering permission dialog repeatedly
   *
   * IMPORTANT: On macOS, after granting screen recording permission in System Settings,
   * the app MUST be completely quit and restarted for the permission to take effect.
   * Simply hiding and showing the window will not work.
   */
  async checkScreenRecordingPermission(): Promise<boolean> {
    if (process.platform !== "darwin") {
      return true;
    }

    // Check cache first
    const now = Date.now();
    if (
      this.permissionCache &&
      now - this.permissionCache.timestamp < this.PERMISSION_CACHE_DURATION
    ) {
      log.info(
        "[Capture] Using cached permission status:",
        this.permissionCache.hasPermission
      );
      return this.permissionCache.hasPermission;
    }

    try {
      // Try to get screen sources with a minimal thumbnail size
      // If permission is not granted, this will return empty array on macOS
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 },
      });

      // Check if we got any screen sources
      const hasPermission = sources.length > 0;
      log.info(
        "[Capture] Screen recording permission check:",
        hasPermission,
        "sources:",
        sources.length
      );

      // Cache the result immediately to prevent repeated checks
      this.permissionCache = { hasPermission, timestamp: now };

      return hasPermission;
    } catch (error) {
      log.error("[Capture] Screen recording permission check failed:", error);
      // Cache the failure result as well
      this.permissionCache = { hasPermission: false, timestamp: now };
      return false;
    }
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
   * Start screen recording for a specific region
   */
  async startRecording(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<void> {
    if (this.recordingWindow) {
      throw new Error("Recording already in progress");
    }

    log.info("[Recording] Starting recording with bounds:", bounds);

    this.recordingBounds = bounds;
    this.recordingStartTime = Date.now();

    // Create a hidden window that will handle the recording
    this.recordingWindow = new BrowserWindow({
      show: false, // Always hidden
      width: 1,
      height: 1,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false, // Needed for getUserMedia with desktop capture
      },
    });

    // Listen for console messages from the recording window
    this.recordingWindow.webContents.on(
      "console-message",
      (_event, level, message) => {
        const prefix = "[Recording Window]";
        switch (level) {
          case 0: // log
            log.info(prefix, message);
            break;
          case 1: // warning
            log.warn(prefix, message);
            break;
          case 2: // error
            log.error(prefix, message);
            break;
          default:
            log.info(prefix, message);
        }
      }
    );

    // Get screen source for recording
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 },
    });

    if (sources.length === 0) {
      throw new Error("No screen sources available for recording");
    }

    const primarySource = sources[0];
    log.info("[Recording] Using source:", primarySource.id);

    // Get the display's scale factor
    const primaryDisplay = screen.getPrimaryDisplay();
    const scaleFactor = primaryDisplay.scaleFactor || 1;

    // Grant media permissions so getUserMedia works inside the hidden window
    this.recordingWindow.webContents.session.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        callback(permission === "media" || permission === "display-capture");
      }
    );

    // Load a minimal HTML page (no inline <script>) so the renderer gets a
    // proper browsing context with navigator.mediaDevices available.
    // All logic is injected afterwards via executeJavaScript, which bypasses
    // the renderer's CSP entirely.
    await this.recordingWindow.loadURL(
      "data:text/html;charset=utf-8,<!DOCTYPE html><html><body></body></html>"
    );

    // Inject recording logic via executeJavaScript (runs in main-process context,
    // not subject to renderer CSP).
    const startScript = `
      (async () => {
        window.__recordingError = null;

        try {
          console.log('[Recording] Starting recording...');

          // Get full-screen stream using the desktop capture source
          const screenStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: ${JSON.stringify(primarySource.id)},
                minWidth: 1,
                maxWidth: 4096,
                minHeight: 1,
                maxHeight: 2160
              }
            }
          });

          console.log('[Recording] Full screen stream acquired');

          // Feed stream into a hidden <video> element
          const video = document.createElement('video');
          video.srcObject = screenStream;
          video.muted = true;
          document.body.appendChild(video);
          await video.play();

          await new Promise((resolve) => {
            if (video.readyState >= 2) { resolve(); return; }
            video.onloadedmetadata = resolve;
          });

          console.log('[Recording] Video dimensions:', video.videoWidth, 'x', video.videoHeight);

          // Create an off-screen canvas cropped to the selected region
          const sf = ${scaleFactor};
          const canvas = document.createElement('canvas');
          canvas.width  = ${bounds.width}  * sf;
          canvas.height = ${bounds.height} * sf;
          document.body.appendChild(canvas);

          const ctx = canvas.getContext('2d');
          const srcX = ${bounds.x} * sf;
          const srcY = ${bounds.y} * sf;
          const srcW = ${bounds.width}  * sf;
          const srcH = ${bounds.height} * sf;

          console.log('[Recording] Canvas:', canvas.width, 'x', canvas.height,
                      '| source rect:', srcX, srcY, srcW, srcH);

          let animId;
          function drawFrame() {
            ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
            animId = requestAnimationFrame(drawFrame);
          }
          drawFrame();

          const canvasStream = canvas.captureStream(30);
          console.log('[Recording] Canvas stream created (30 fps)');

          // Pick the best supported mimeType
          const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
            .find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

          const recorder = new MediaRecorder(canvasStream, {
            mimeType,
            videoBitsPerSecond: 2_500_000
          });

          const chunks = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.onerror = (e) => {
            console.error('[Recording] MediaRecorder error:', e.error);
          };

          recorder.start(1000);
          console.log('[Recording] MediaRecorder started, mimeType:', mimeType);

          // Expose stop helper so stopRecording() can call it later
          window.__stopRecording = () => new Promise((resolve, reject) => {
            recorder.onstop = () => {
              cancelAnimationFrame(animId);
              canvasStream.getTracks().forEach(t => t.stop());
              screenStream.getTracks().forEach(t => t.stop());

              const blob = new Blob(chunks, { type: 'video/webm' });
              console.log('[Recording] Blob size:', blob.size, 'bytes');

              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror   = reject;
              reader.readAsArrayBuffer(blob);
            };

            if (recorder.state !== 'inactive') {
              recorder.stop();
            } else {
              reject(new Error('MediaRecorder already inactive'));
            }
          });

        } catch (err) {
          window.__recordingError = err && err.message ? err.message : String(err);
          console.error('[Recording] Failed to start:', window.__recordingError);
        }
      })();
    `;

    await this.recordingWindow.webContents.executeJavaScript(startScript);

    // Verify recording actually started
    const startError = await this.recordingWindow.webContents.executeJavaScript(
      "window.__recordingError"
    );
    if (startError) {
      throw new Error(`Recording failed to start: ${startError}`);
    }

    log.info("[Recording] Recording window loaded and started");
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
    if (!this.recordingWindow || !this.recordingBounds) {
      throw new Error("No recording in progress");
    }

    log.info("[Recording] Stopping recording");

    const duration = this.recordingStartTime
      ? Date.now() - this.recordingStartTime
      : 0;

    try {
      // Execute stop in the recording window
      const videoData =
        await this.recordingWindow.webContents.executeJavaScript(
          `window.__stopRecording()`
        );

      log.info(
        "[Recording] Video data received:",
        videoData ? videoData.byteLength : 0,
        "bytes"
      );

      // Generate issue ID
      const issueId = `rec_${Date.now()}`;

      // Save video file
      const videoBuffer = Buffer.from(videoData);
      const filePath = await storageManager.saveFile(
        issueId,
        videoBuffer,
        "webm"
      );

      log.info("[Recording] Video saved to:", filePath);

      // Generate thumbnail from video
      const thumbnailPath = await this.createVideoThumbnail(filePath, issueId);

      log.info("[Recording] Thumbnail saved to:", thumbnailPath);

      // Clean up
      if (this.recordingWindow) {
        this.recordingWindow.close();
        this.recordingWindow = null;
      }
      this.recordingBounds = null;
      this.recordingStartTime = null;

      return {
        issueId,
        filePath,
        thumbnailPath,
        duration,
      };
    } catch (error) {
      log.error("[Recording] Error stopping recording:", error);

      // Clean up on error
      if (this.recordingWindow) {
        this.recordingWindow.close();
        this.recordingWindow = null;
      }
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

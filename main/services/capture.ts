import {
  screen,
  desktopCapturer,
  BrowserWindow,
  clipboard,
  DesktopCapturerSource,
  nativeImage,
  systemPreferences,
} from "electron";
import log from "electron-log";
import { storageManager } from "../utils/storage";
import { EventEmitter } from "events";

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
  constructor() {
    super();
  }

  /**
   * Clear the permission cache (no-op).
   * `systemPreferences.getMediaAccessStatus` always queries the OS live —
   * there is no Electron-side cache to clear. Kept for callers that want to
   * force a fresh check before `checkScreenRecordingPermission()`.
   */
  clearPermissionCache(): void {
    // No-op - nothing is cached; see checkScreenRecordingPermission().
  }

  /**
   * Check whether the app can capture the screen.
   * Windows and Linux don't have a screen-capture permission model.
   * macOS requires the "Screen Recording" permission — granted via
   * System Settings, and only takes effect after an app restart.
   */
  async checkScreenRecordingPermission(): Promise<boolean> {
    if (process.platform !== "darwin") {
      return true;
    }
    return systemPreferences.getMediaAccessStatus("screen") === "granted";
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
        // The area-capture overlay is created one window per display (see
        // createAreaCaptureOverlay in main.ts), and originOffset is set to
        // that exact display's bounds.x/y. The renderer then scales the
        // selection by *its own* window.devicePixelRatio — which always
        // matches the display that window sits on — so bounds are already
        // physical pixels relative to that display's own origin.
        //
        // That means the target display is known exactly via originOffset;
        // no guessing from a scale-converted selection centroid is needed
        // (a "primary display's scaleFactor as best guess" here would pick
        // the wrong display, or the right display but wrong crop rect, on a
        // mixed-DPI multi-monitor setup, e.g. Retina main + external 1x).
        const originX = options.originOffset?.x ?? 0;
        const originY = options.originOffset?.y ?? 0;

        const allDisplays = screen.getAllDisplays();
        const targetDisplay =
          allDisplays.find(
            (d) => d.bounds.x === originX && d.bounds.y === originY
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

        // bounds are already physical pixels relative to the target
        // display's own origin — no further offset/scale conversion needed.
        const cropRect = {
          x: Math.max(0, Math.floor(options.bounds.x)),
          y: Math.max(0, Math.floor(options.bounds.y)),
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
}

export const captureService = new CaptureService();

import { clipboard, nativeImage } from "electron";
import fs from "fs";
import log from "electron-log";

export interface Snap {
  id: string;
  title: string;
  description?: string;
  type?: string;
  filePath?: string;
  cloudFileUrl?: string;
  syncedTo?: {
    platform: string;
    externalId: string;
    url?: string;
    connectorId?: string;
  }[];
}

/**
 * ClipboardService generates and copies bug report text to the system clipboard.
 *
 * Unsynced snaps: title + description + embedded image (screenshots) or local path (recordings)
 * Synced snaps:   title + description + cloud URL + GitHub/Zoho links
 */
export class ClipboardService {
  generateBugMessage(snap: Snap): string {
    const lines: string[] = [];
    const isRecording = snap.type === "recording";
    const mediaLabel = isRecording ? "Recording" : "Screenshot";

    if (snap.title) {
      lines.push(`Bug: ${snap.title}`);
    }

    if (snap.description) {
      lines.push("");
      lines.push("Description:");
      lines.push(snap.description);
    }

    // Cloud media URL
    if (snap.cloudFileUrl) {
      lines.push("");
      lines.push(`${mediaLabel}:`);
      lines.push(snap.cloudFileUrl);
    }

    // GitHub issue link
    const githubSync = snap.syncedTo?.find((s) => s.platform === "github");
    if (githubSync?.url) {
      lines.push("");
      lines.push("GitHub Issue:");
      lines.push(githubSync.url);
    }

    // Zoho ticket link
    const zohoSync = snap.syncedTo?.find((s) => s.platform === "zoho");
    if (zohoSync?.url) {
      lines.push("");
      lines.push("Zoho Ticket:");
      lines.push(zohoSync.url);
    }

    return lines.join("\n");
  }

  private buildHtmlMessage(snap: Snap, imageBase64: string): string {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const parts: string[] = [];

    if (snap.title)
      parts.push(`<p><strong>Bug:</strong> ${esc(snap.title)}</p>`);
    if (snap.description)
      parts.push(
        `<p><strong>Description:</strong><br>${esc(snap.description).replace(/\n/g, "<br>")}</p>`
      );

    const githubSync = snap.syncedTo?.find((s) => s.platform === "github");
    if (githubSync?.url)
      parts.push(
        `<p><strong>GitHub Issue:</strong> <a href="${githubSync.url}">${githubSync.url}</a></p>`
      );

    const zohoSync = snap.syncedTo?.find((s) => s.platform === "zoho");
    if (zohoSync?.url)
      parts.push(
        `<p><strong>Zoho Ticket:</strong> <a href="${zohoSync.url}">${zohoSync.url}</a></p>`
      );

    parts.push(
      `<img src="data:image/png;base64,${imageBase64}" alt="Screenshot">`
    );

    return parts.join("\n");
  }

  copyBugReport(snap: Snap): string {
    const message = this.generateBugMessage(snap);

    // Always try to embed the screenshot image directly in clipboard.
    // This works for unsynced snaps (local file) as well as synced ones.
    // Attachment takes priority — include image + text + html formats.
    if (snap.type !== "recording" && snap.filePath) {
      try {
        if (fs.existsSync(snap.filePath)) {
          const image = nativeImage.createFromPath(snap.filePath);
          if (!image.isEmpty()) {
            const base64 = image.toPNG().toString("base64");
            const html = this.buildHtmlMessage(snap, base64);
            // Write all three formats:
            // - image: Slack picks this and shows it as an attachment
            // - html:  Teams/Notion pick this and render text + embedded image
            // - text:  plain text fallback for text-only fields
            clipboard.write({ text: message, html, image });
            log.info(
              `[Clipboard] Copied bug report + embedded image for "${snap.title}"`
            );
            return message;
          }
        }
      } catch (err) {
        log.warn(
          "[Clipboard] Failed to embed image, falling back to text only:",
          err
        );
      }
    }

    clipboard.writeText(message);
    log.info(`[Clipboard] Copied bug report for "${snap.title}" (${snap.id})`);
    return message;
  }
}

export const clipboardService = new ClipboardService();

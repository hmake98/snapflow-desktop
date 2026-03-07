import { clipboard } from "electron";
import log from "electron-log";

export interface Snap {
  id: string;
  title: string;
  description?: string;
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
 * Includes title, description, recording link, and optionally GitHub/Zoho links.
 */
export class ClipboardService {
  /**
   * Generate a formatted bug message from snap data
   */
  generateBugMessage(snap: Snap): string {
    const lines: string[] = [];

    // Add title
    if (snap.title) {
      lines.push(`Bug: ${snap.title}`);
    }

    // Add description
    if (snap.description) {
      lines.push("");
      lines.push("Description:");
      lines.push(snap.description);
    }

    // Add recording link
    lines.push("");
    lines.push("Recording:");
    if (snap.cloudFileUrl) {
      lines.push(snap.cloudFileUrl);
    } else {
      // Use placeholder URL if not synced
      lines.push(`https://snapflow.app/recordings/${snap.id}`);
    }

    // Add GitHub issue link if available
    if (snap.syncedTo) {
      const githubSync = snap.syncedTo.find((s) => s.platform === "github");
      if (githubSync && githubSync.url) {
        lines.push("");
        lines.push("GitHub Issue:");
        lines.push(githubSync.url);
      }

      // Add Zoho ticket link if available
      const zohoSync = snap.syncedTo.find((s) => s.platform === "zoho");
      if (zohoSync && zohoSync.url) {
        lines.push("");
        lines.push("Zoho Ticket:");
        lines.push(zohoSync.url);
      }
    }

    const message = lines.join("\n");
    return message;
  }

  /**
   * Generate bug message and copy to system clipboard
   */
  copyBugReport(snap: Snap): string {
    const message = this.generateBugMessage(snap);
    clipboard.writeText(message);

    log.info(
      `[Clipboard] Copied bug report for snap "${snap.title}" (${snap.id}) to clipboard`
    );

    return message;
  }
}

export const clipboardService = new ClipboardService();

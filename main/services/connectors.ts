import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { getSupabase } from "../utils/supabase";
import log from "electron-log";

interface Connector {
  id: string;
  name: string;
  type: "github";
  enabled: boolean;
  config: {
    accessToken: string;
    owner: string;
    repo: string;
  };
}

export class ConnectorService {
  async getConnectors(userId: string): Promise<Connector[]> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("Failed to fetch connectors:", error);
      throw new Error("Failed to fetch connectors");
    }

    return (data || []) as Connector[];
  }

  async getConnectorById(
    userId: string,
    id: string
  ): Promise<Connector | null> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // Not found
      }
      log.error("Failed to fetch connector:", error);
      throw new Error("Failed to fetch connector");
    }

    return data as Connector;
  }

  async getGitHubConnectors(userId: string): Promise<Connector[]> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "github")
      .eq("enabled", true)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("Failed to fetch GitHub connectors:", error);
      throw new Error("Failed to fetch GitHub connectors");
    }

    return (data || []) as Connector[];
  }

  async getConnectorByRepo(
    userId: string,
    owner: string,
    repo: string
  ): Promise<Connector | null> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "github")
      .filter("config->>owner", "eq", owner)
      .filter("config->>repo", "eq", repo)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // Not found
      }
      log.error("Failed to fetch connector by repo:", error);
      throw new Error("Failed to fetch connector by repo");
    }

    return data as Connector;
  }

  async canAddGitHubConnector(userId: string): Promise<boolean> {
    const githubConnectors = await this.getGitHubConnectors(userId);
    return githubConnectors.length < 5;
  }

  async addConnector(
    userId: string,
    connector: Omit<Connector, "id">
  ): Promise<Connector> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    // Check if we can add more GitHub connectors
    if (
      connector.type === "github" &&
      !(await this.canAddGitHubConnector(userId))
    ) {
      throw new Error("Maximum of 5 GitHub repositories allowed");
    }

    // Check if this repo already exists
    if (connector.type === "github") {
      const existing = await this.getConnectorByRepo(
        userId,
        connector.config.owner,
        connector.config.repo
      );
      if (existing) {
        throw new Error(
          `Repository ${connector.config.owner}/${connector.config.repo} is already connected`
        );
      }
    }

    const newConnector = {
      id: `${connector.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user_id: userId,
      ...connector,
    };

    const { data, error } = await supabase
      .from("connectors")
      .insert([newConnector])
      .select()
      .single();

    if (error) {
      log.error("Failed to add connector:", error);
      throw new Error("Failed to add connector");
    }

    return data as Connector;
  }

  async updateConnector(
    userId: string,
    id: string,
    updates: Partial<Connector>
  ): Promise<Connector> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    const { data, error } = await supabase
      .from("connectors")
      .update(updates)
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      log.error("Failed to update connector:", error);
      throw new Error("Failed to update connector");
    }

    if (!data) {
      throw new Error("Connector not found");
    }

    return data as Connector;
  }

  async deleteConnector(userId: string, id: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    const { error } = await supabase
      .from("connectors")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);

    if (error) {
      log.error("Failed to delete connector:", error);
      throw new Error("Failed to delete connector");
    }
  }

  /**
   * Upload screenshot to GitHub repository and return the URL
   * Since GitHub doesn't have an API to attach images to issues,
   * we upload to a .snapflow-screenshots folder in the repo
   */
  private async uploadScreenshotToGitHub(
    connector: Connector,
    filePath: string,
    issueNumber: number
  ): Promise<string | null> {
    try {
      log.info("[GitHub] Reading screenshot file:", filePath);
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const base64Content = fileBuffer.toString("base64");

      // Create a unique filename with issue number
      const screenshotPath = `.snapflow-screenshots/issue-${issueNumber}-${fileName}`;

      log.info("[GitHub] Uploading screenshot to repository:", screenshotPath);

      // Check if file already exists
      let sha: string | undefined;
      try {
        const existingFile = await axios.get(
          `https://api.github.com/repos/${connector.config.owner}/${connector.config.repo}/contents/${screenshotPath}`,
          {
            headers: {
              Authorization: `Bearer ${connector.config.accessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
        sha = existingFile.data.sha;
        log.info("[GitHub] File already exists, will update it");
      } catch {
        // File doesn't exist, which is fine
        log.info("[GitHub] File does not exist, will create new");
      }

      // Upload or update the file in the repository
      const uploadPayload: Record<string, unknown> = {
        message: `Add screenshot for issue #${issueNumber}`,
        content: base64Content,
      };

      if (sha) {
        uploadPayload.sha = sha;
      }

      const uploadResponse = await axios.put(
        `https://api.github.com/repos/${connector.config.owner}/${connector.config.repo}/contents/${screenshotPath}`,
        uploadPayload,
        {
          headers: {
            Authorization: `Bearer ${connector.config.accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
        }
      );

      const downloadUrl = uploadResponse.data.content.download_url;
      log.info("[GitHub] Screenshot uploaded successfully:", downloadUrl);
      return downloadUrl;
    } catch (error) {
      log.error(
        "[GitHub] Failed to upload screenshot to repository:",
        error.response?.data || error.message
      );

      // Fallback: Use data URI for small files
      try {
        const fileBuffer = await fs.readFile(filePath);
        const fileName = path.basename(filePath);

        if (fileBuffer.length < 500000) {
          // 500KB limit
          const mimeType = fileName.endsWith(".png")
            ? "image/png"
            : "image/jpeg";
          const base64Content = fileBuffer.toString("base64");
          const dataUri = `data:${mimeType};base64,${base64Content}`;
          log.info(
            "[GitHub] Using data URI fallback for screenshot (file size:",
            fileBuffer.length,
            "bytes)"
          );
          return dataUri;
        } else {
          log.info(
            "[GitHub] Screenshot too large for data URI fallback:",
            fileBuffer.length,
            "bytes"
          );
        }
      } catch (fallbackError) {
        log.error("[GitHub] Fallback data URI also failed:", fallbackError);
      }

      return null;
    }
  }

  async syncToGitHub(
    connector: Connector,
    issue: {
      title: string;
      description?: string;
      filePath: string;
      cloudFileUrl?: string;
      syncedTo?: Array<{ platform: string; externalId: string; url?: string }>;
      tags?: string[];
      type?: "screenshot" | "recording";
    }
  ): Promise<{ issueNumber: number; url: string; isUpdate: boolean }> {
    if (
      !connector.config.accessToken ||
      !connector.config.owner ||
      !connector.config.repo
    ) {
      throw new Error("GitHub connector not properly configured");
    }

    try {
      // Check if already synced to this GitHub repo
      const existingSync = issue.syncedTo?.find(
        (sync) =>
          sync.platform === "github" &&
          sync.url?.includes(
            `${connector.config.owner}/${connector.config.repo}`
          )
      );

      // Prepare issue body
      let body = issue.description || "No description provided.";

      // Prepare labels from tags
      const labels = issue.tags || [];

      const issueNumber = existingSync?.externalId
        ? parseInt(existingSync.externalId, 10)
        : null;

      if (issueNumber) {
        // Try to update existing issue
        log.info(
          "[GitHub] Issue already exists, updating issue #",
          issueNumber
        );

        try {
          // Try to upload media (screenshot or recording)
          let mediaUrl = issue.cloudFileUrl;
          const isRecording = issue.type === "recording";

          if (!mediaUrl && issue.filePath) {
            if (isRecording) {
              log.info("[GitHub] Recording detected - using cloud URL");
              // For recordings, we prefer cloud URLs since videos can be large
              // GitHub API has a 100MB limit for files
            } else {
              log.info("[GitHub] Attempting to upload screenshot...");
              mediaUrl = await this.uploadScreenshotToGitHub(
                connector,
                issue.filePath,
                issueNumber
              );
            }
          }

          if (mediaUrl) {
            if (isRecording) {
              body += `\n\n## Recording\n\n[View Recording](${mediaUrl})`;
            } else {
              body += `\n\n## Screenshot\n\n![Screenshot](${mediaUrl})`;
            }
          }

          const response = await axios.patch(
            `https://api.github.com/repos/${connector.config.owner}/${connector.config.repo}/issues/${issueNumber}`,
            {
              title: issue.title,
              body,
              labels,
            },
            {
              headers: {
                Authorization: `Bearer ${connector.config.accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
              },
            }
          );

          log.info("[GitHub] Issue updated:", response.data.html_url);
          return {
            issueNumber: response.data.number,
            url: response.data.html_url,
            isUpdate: true,
          };
        } catch (updateError) {
          // If issue was deleted (410), create a new one
          if (updateError.response?.status === 410) {
            log.info(
              "[GitHub] Issue #",
              issueNumber,
              "was deleted, creating a new issue..."
            );
            // Fall through to create new issue
          } else {
            // Re-throw other errors
            throw updateError;
          }
        }
      }

      // Create new issue (either no existing issue or existing issue was deleted)
      {
        // Create new issue first
        log.info(
          "[GitHub] Creating new issue in",
          `${connector.config.owner}/${connector.config.repo}`
        );

        const response = await axios.post(
          `https://api.github.com/repos/${connector.config.owner}/${connector.config.repo}/issues`,
          {
            title: issue.title,
            body,
            labels,
          },
          {
            headers: {
              Authorization: `Bearer ${connector.config.accessToken}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
          }
        );

        const newIssueNumber = response.data.number;
        const issueUrl = response.data.html_url;
        log.info("[GitHub] Issue created:", issueUrl);

        // Now try to upload and attach media (screenshot or recording)
        const isRecording = issue.type === "recording";
        let mediaUrl = issue.cloudFileUrl;

        if (!mediaUrl && issue.filePath && !isRecording) {
          // Only upload screenshots to GitHub; recordings use cloud URLs
          log.info("[GitHub] Attempting to upload screenshot...");
          mediaUrl = await this.uploadScreenshotToGitHub(
            connector,
            issue.filePath,
            newIssueNumber
          );
        }

        if (mediaUrl) {
          // Update the issue with media
          const mediaSection = isRecording
            ? `\n\n## Recording\n\n[View Recording](${mediaUrl})`
            : `\n\n## Screenshot\n\n![Screenshot](${mediaUrl})`;
          const updatedBody = body + mediaSection;

          await axios.patch(
            `https://api.github.com/repos/${connector.config.owner}/${connector.config.repo}/issues/${newIssueNumber}`,
            { body: updatedBody },
            {
              headers: {
                Authorization: `Bearer ${connector.config.accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
              },
            }
          );
          log.info(
            `[GitHub] ${isRecording ? "Recording link" : "Screenshot"} attached to issue`
          );
        }

        return {
          issueNumber: newIssueNumber,
          url: issueUrl,
          isUpdate: false,
        };
      }
    } catch (error) {
      log.error("GitHub sync error:", error);
      if (error.response?.status === 401) {
        throw new Error("GitHub access token is invalid or expired");
      } else if (error.response?.status === 404) {
        throw new Error("Repository not found or access denied");
      } else if (error.response?.status === 403) {
        throw new Error(
          "GitHub API rate limit exceeded or insufficient permissions"
        );
      } else if (error.response?.status === 410) {
        throw new Error("GitHub issue was deleted and could not be recreated");
      } else if (error.response?.status === 422) {
        const message = error.response?.data?.message || "Validation failed";
        const errors = error.response?.data?.errors || [];
        log.error("[GitHub] Validation error:", message, errors);
        throw new Error(`GitHub validation error: ${message}`);
      }
      throw new Error(
        `Failed to sync to GitHub: ${error.response?.data?.message || error.message}`
      );
    }
  }

  async validateGitHubConnector(
    accessToken: string,
    owner: string,
    repo: string
  ): Promise<boolean> {
    try {
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      // Check if we have issues permission
      const permissions = response.data.permissions;
      return permissions?.push === true || permissions?.admin === true;
    } catch (error) {
      log.error("GitHub validation error:", error);
      return false;
    }
  }
}

export const connectorService = new ConnectorService();

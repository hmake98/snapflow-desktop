import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { getSupabase } from "../utils/supabase";
import log from "electron-log";
import { customAlphabet } from "nanoid";
import { zohoService } from "./zoho";
import type {
  Connector,
  GitHubConnectorConfig,
  ZohoConnectorConfig,
} from "../../renderer/types";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);

export class ConnectorService {
  /**
   * Get all connectors for a workspace (excludes soft-deleted)
   */
  async getConnectors(workspaceId: string): Promise<Connector[]> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Connector Service] ✗ Supabase not configured");
      throw new Error("Supabase not configured");
    }

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("[Connector Service] ✗ Failed to fetch connectors:", error);
      throw new Error("Failed to fetch connectors");
    }

    const connectors = (data || []).map((c) => this.mapSupabaseConnector(c));
    return connectors;
  }

  /**
   * Get connector by ID (excludes soft-deleted)
   */
  async getConnectorById(id: string): Promise<Connector | null> {
    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Connector Service] Supabase not configured");
      return null;
    }

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      log.error("[Connector Service] ✗ Failed to fetch connector:", error);
      throw new Error("Failed to fetch connector");
    }

    return this.mapSupabaseConnector(data);
  }

  /**
   * Get enabled connectors of a specific type for a workspace (excludes soft-deleted)
   */
  async getConnectorsByType(
    workspaceId: string,
    type: "github" | "zoho"
  ): Promise<Connector[]> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Connector Service] ✗ Supabase not configured");
      throw new Error("Supabase not configured");
    }

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("type", type)
      .eq("enabled", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("[Connector Service] ✗ Failed to fetch connectors:", error);
      throw new Error("Failed to fetch connectors");
    }

    const connectors = (data || []).map((c) => this.mapSupabaseConnector(c));
    return connectors;
  }

  /**
   * Get GitHub connector by repo (excludes soft-deleted)
   */
  async getConnectorByRepo(
    workspaceId: string,
    owner: string,
    repo: string
  ): Promise<Connector | null> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Connector Service] ✗ Supabase not configured");
      throw new Error("Supabase not configured");
    }

    const { data, error } = await supabase
      .from("connectors")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("type", "github")
      .filter("config->>owner", "eq", owner)
      .filter("config->>repo", "eq", repo)
      .is("deleted_at", null)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      log.error(
        "[Connector Service] ✗ Failed to fetch connector by repo:",
        error
      );
      throw new Error("Failed to fetch connector by repo");
    }

    return this.mapSupabaseConnector(data);
  }

  /**
   * Check if we can add a connector of a specific type
   * Max 1 GitHub + 1 Zoho per workspace
   */
  async canAddConnector(
    workspaceId: string,
    type: "github" | "zoho"
  ): Promise<boolean> {
    const existing = await this.getConnectorsByType(workspaceId, type);
    return existing.length === 0; // Can add if none exist
  }

  /**
   * Add a new connector to a workspace
   */
  async addConnector(
    userId: string,
    workspaceId: string,
    connector: Omit<
      Connector,
      "id" | "workspaceId" | "createdBy" | "createdAt" | "updatedAt"
    >
  ): Promise<Connector> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Connector Service] ✗ Supabase not configured");
      throw new Error("Supabase not configured");
    }

    // Check if we can add this type of connector
    if (!(await this.canAddConnector(workspaceId, connector.type))) {
      const msg = `Only 1 ${connector.type} connector allowed per workspace`;
      log.error("[Connector Service] ✗", msg);
      throw new Error(msg);
    }

    // For GitHub, check if this repo already exists
    if (
      connector.type === "github" &&
      "config" in connector &&
      "owner" in connector.config &&
      "repo" in connector.config
    ) {
      const config = connector.config as unknown as {
        owner: string;
        repo: string;
        [key: string]: unknown;
      };
      const existing = await this.getConnectorByRepo(
        workspaceId,
        config.owner,
        config.repo
      );
      if (existing) {
        const msg = `Repository ${config.owner}/${config.repo} is already connected`;
        log.error("[Connector Service] ✗", msg);
        throw new Error(msg);
      }
    }

    const id = `${connector.type}-${Date.now()}-${nanoid()}`;
    const newConnector = {
      id,
      workspace_id: workspaceId,
      created_by: userId,
      name: connector.name,
      type: connector.type,
      enabled: connector.enabled !== false,
      config: connector.config,
    };

    const { data, error } = await supabase
      .from("connectors")
      .insert([newConnector])
      .select()
      .single();

    if (error) {
      log.error("[Connector Service] ✗ Failed to add connector:", error);

      // Provide user-friendly error messages for common constraint violations
      const errorMsg = error.message || "";
      if (errorMsg.includes("connectors_workspace_id_name_key")) {
        throw new Error(
          `A connector named "${connector.name}" already exists in this workspace. Please choose a different name.`
        );
      }
      if (errorMsg.includes("unique constraint")) {
        throw new Error(
          "A connector with this name already exists. Please choose a different name."
        );
      }

      throw new Error("Failed to add connector");
    }

    if (!data) {
      log.error("[Connector Service] ✗ No connector data returned");
      throw new Error("Failed to add connector");
    }

    const result = this.mapSupabaseConnector(data);
    return result;
  }

  /**
   * Update a connector
   */
  async updateConnector(
    id: string,
    updates: Partial<Pick<Connector, "enabled" | "name" | "config">>
  ): Promise<Connector> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Connector Service] ✗ Supabase not configured");
      throw new Error("Supabase not configured");
    }

    const { data, error } = await supabase
      .from("connectors")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      log.error("[Connector Service] ✗ Failed to update connector:", error);
      throw new Error("Failed to update connector");
    }

    if (!data) {
      log.error("[Connector Service] ✗ Connector not found");
      throw new Error("Connector not found");
    }

    return this.mapSupabaseConnector(data);
  }

  /**
   * Delete a connector (soft delete - sets deleted_at timestamp)
   */
  async deleteConnector(id: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Connector Service] ✗ Supabase not configured");
      throw new Error("Supabase not configured");
    }

    const { error } = await supabase
      .from("connectors")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      log.error("[Connector Service] ✗ Failed to delete connector:", error);
      throw new Error("Failed to delete connector");
    }
  }

  /**
   * Validate GitHub connector (check access and permissions)
   */
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

      // Check if we have push/admin permissions
      const permissions = response.data.permissions;
      const canPush = permissions?.push === true || permissions?.admin === true;

      if (!canPush) {
        log.warn(
          "[Connector Service] ✗ Insufficient permissions on repository"
        );
      }

      return canPush;
    } catch (error) {
      log.error("[Connector Service] ✗ GitHub validation error:", error);
      return false;
    }
  }

  /**
   * Validate Zoho connector (stub - placeholder for Zoho API validation)
   */
  async validateZohoConnector(
    accessToken: string,
    portalId: string
  ): Promise<boolean> {
    try {
      // Stub: In a real implementation, this would call Zoho API
      // For now, just check that the token and portal ID are non-empty
      if (!accessToken || !portalId) {
        log.warn("[Connector Service] ✗ Missing Zoho token or portal ID");
        return false;
      }

      // TODO: Call actual Zoho API to validate token
      // const response = await axios.get(
      //   `https://projectsapi.zoho.com/portal/${portalId}/projects`,
      //   {
      //     headers: {
      //       'Authorization': `Zoho-oauthtoken ${accessToken}`
      //     }
      //   }
      // );
      // return response.status === 200;

      return true;
    } catch (error) {
      log.error("[Connector Service] ✗ Zoho validation error:", error);
      return false;
    }
  }

  /**
   * Upload screenshot to GitHub repository
   */
  private async uploadScreenshotToGitHub(
    connector: Connector,
    filePath: string,
    issueNumber: number
  ): Promise<string | null> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const base64Content = fileBuffer.toString("base64");

      const screenshotPath = `.snapflow-screenshots/issue-${issueNumber}-${fileName}`;

      // Check if file already exists
      let sha: string | undefined;
      try {
        const config = connector.config as {
          owner: string;
          repo: string;
          accessToken: string;
        };
        const existingFile = await axios.get(
          `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${screenshotPath}`,
          {
            headers: {
              Authorization: `Bearer ${config.accessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
        sha = existingFile.data.sha;
      } catch {
        // File doesn't exist yet — sha stays undefined, will create new
      }

      const config = connector.config as {
        owner: string;
        repo: string;
        accessToken: string;
      };
      const uploadPayload: Record<string, unknown> = {
        message: `Add screenshot for issue #${issueNumber}`,
        content: base64Content,
      };

      if (sha) {
        uploadPayload.sha = sha;
      }

      const uploadResponse = await axios.put(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${screenshotPath}`,
        uploadPayload,
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
        }
      );

      const downloadUrl = uploadResponse.data.content.download_url;
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
          const mimeType = fileName.endsWith(".png")
            ? "image/png"
            : "image/jpeg";
          const base64Content = fileBuffer.toString("base64");
          const dataUri = `data:${mimeType};base64,${base64Content}`;
          return dataUri;
        }
      } catch (fallbackError) {
        log.error("[GitHub] Fallback data URI also failed:", fallbackError);
      }

      return null;
    }
  }

  /**
   * Sync issue to GitHub
   */
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
      sessionData?: {
        duration: number;
        screenshotCount: number;
        eventCount: number;
        cloudScreenshotUrls?: string[];
        screenshotPaths?: string[];
      };
    }
  ): Promise<{ issueNumber: number; url: string; isUpdate: boolean }> {
    const config = connector.config as {
      owner: string;
      repo: string;
      accessToken: string;
    };

    if (!config.accessToken || !config.owner || !config.repo) {
      throw new Error("GitHub connector not properly configured");
    }

    try {
      // Check if already synced to this GitHub repo
      const existingSync = issue.syncedTo?.find(
        (sync) =>
          sync.platform === "github" &&
          sync.url?.includes(`${config.owner}/${config.repo}`)
      );

      let body = issue.description || "No description provided.";
      const labels = issue.tags || [];
      const issueNumber = existingSync?.externalId
        ? parseInt(existingSync.externalId, 10)
        : null;

      // Append session metadata block if this is a session snap
      if (issue.sessionData) {
        const sd = issue.sessionData;
        const durationSec = Math.round(sd.duration / 1000);
        body += `\n\n---\n**Session Summary**\n`;
        body += `- Duration: ${durationSec}s\n`;
        body += `- Screenshots: ${sd.screenshotCount}\n`;
        body += `- Events captured: ${sd.eventCount}\n`;
      }

      if (issueNumber) {
        try {
          const isRecording = issue.type === "recording";

          // For session snaps: embed all cloud screenshot URLs
          if (issue.sessionData?.cloudScreenshotUrls?.length) {
            body += `\n\n## Screenshots\n\n`;
            issue.sessionData.cloudScreenshotUrls.forEach((url, i) => {
              body += `**${i + 1}.** ![Screenshot ${i + 1}](${url})\n\n`;
            });
          } else {
            // Single screenshot / recording fallback
            let mediaUrl = issue.cloudFileUrl;
            if (!mediaUrl && issue.filePath && !isRecording) {
              mediaUrl = await this.uploadScreenshotToGitHub(
                connector,
                issue.filePath,
                issueNumber
              );
            }
            if (mediaUrl) {
              if (isRecording) {
                body += `\n\n## Recording\n\n[View Recording](${mediaUrl})`;
              } else {
                body += `\n\n## Screenshot\n\n![Screenshot](${mediaUrl})`;
              }
            }
          }

          const response = await axios.patch(
            `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${issueNumber}`,
            {
              title: issue.title,
              body,
              labels,
            },
            {
              headers: {
                Authorization: `Bearer ${config.accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
              },
            }
          );

          return {
            issueNumber: response.data.number,
            url: response.data.html_url,
            isUpdate: true,
          };
        } catch (updateError) {
          if (updateError.response?.status === 410) {
            // Fall through to create new issue
          } else {
            throw updateError;
          }
        }
      }

      // Create new issue
      {
        const response = await axios.post(
          `https://api.github.com/repos/${config.owner}/${config.repo}/issues`,
          {
            title: issue.title,
            body,
            labels,
          },
          {
            headers: {
              Authorization: `Bearer ${config.accessToken}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
          }
        );

        const newIssueNumber = response.data.number;
        const issueUrl = response.data.html_url;

        const isRecording = issue.type === "recording";
        let updatedBody = body;

        // For session snaps: embed all cloud screenshot URLs
        if (issue.sessionData?.cloudScreenshotUrls?.length) {
          updatedBody += `\n\n## Screenshots\n\n`;
          issue.sessionData.cloudScreenshotUrls.forEach((url, i) => {
            updatedBody += `**${i + 1}.** ![Screenshot ${i + 1}](${url})\n\n`;
          });
        } else {
          // Single screenshot / recording fallback
          let mediaUrl = issue.cloudFileUrl;
          if (!mediaUrl && issue.filePath && !isRecording) {
            mediaUrl = await this.uploadScreenshotToGitHub(
              connector,
              issue.filePath,
              newIssueNumber
            );
          }
          if (mediaUrl) {
            updatedBody += isRecording
              ? `\n\n## Recording\n\n[View Recording](${mediaUrl})`
              : `\n\n## Screenshot\n\n![Screenshot](${mediaUrl})`;
          }
        }

        if (updatedBody !== body) {
          await axios.patch(
            `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${newIssueNumber}`,
            { body: updatedBody },
            {
              headers: {
                Authorization: `Bearer ${config.accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
              },
            }
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
        throw new Error("GitHub access token is invalid or expired", {
          cause: error,
        });
      } else if (error.response?.status === 404) {
        throw new Error("Repository not found or access denied", {
          cause: error,
        });
      } else if (error.response?.status === 403) {
        throw new Error(
          "GitHub API rate limit exceeded or insufficient permissions",
          {
            cause: error,
          }
        );
      } else if (error.response?.status === 410) {
        throw new Error("GitHub issue was deleted and could not be recreated", {
          cause: error,
        });
      } else if (error.response?.status === 422) {
        const message = error.response?.data?.message || "Validation failed";
        const errors = error.response?.data?.errors || [];
        log.error("[GitHub] Validation error:", message, errors);
        throw new Error(`GitHub validation error: ${message}`, {
          cause: error,
        });
      }
      throw new Error(
        `Failed to sync to GitHub: ${error.response?.data?.message || error.message}`,
        {
          cause: error,
        }
      );
    }
  }

  /**
   * Sync issue to Zoho Projects as a bug
   */
  async syncToZoho(
    connector: Connector,
    issue: {
      title: string;
      description?: string;
      filePath: string;
      cloudFileUrl?: string;
      syncedTo?: Array<{
        platform: string;
        externalId: string;
        url?: string;
        connectorId?: string;
      }>;
      tags?: string[];
      type?: "screenshot" | "recording";
      sessionData?: {
        duration: number;
        screenshotCount: number;
        eventCount: number;
        cloudScreenshotUrls?: string[];
        screenshotPaths?: string[];
      };
    }
  ): Promise<{ bugId: string; url: string; isUpdate: boolean }> {
    const config = connector.config as ZohoConnectorConfig;

    if (!config.accessToken || !config.portalId || !config.projectId) {
      throw new Error("Zoho connector not properly configured");
    }

    try {
      // Check if already synced to this Zoho project
      const existingSync = issue.syncedTo?.find(
        (sync) => sync.platform === "zoho" && sync.connectorId === connector.id
      );

      if (existingSync) {
        return {
          bugId: existingSync.externalId,
          url: existingSync.url || "",
          isUpdate: true,
        };
      }

      // Set accounts server if present (for region-specific API calls)
      if (config.accountsServer || config.apiDomain) {
        let accountsServerUrl = config.accountsServer;
        let apiDomain = config.apiDomain;

        // If apiDomain is a full URL, extract just the hostname
        if (apiDomain && apiDomain.includes("://")) {
          try {
            const url = new URL(apiDomain);
            apiDomain = url.hostname;
          } catch (_e) {
            log.warn("[Zoho] Failed to parse apiDomain as URL:", apiDomain);
          }
        }

        // If we don't have accountsServer but have apiDomain, construct it
        if (!accountsServerUrl && apiDomain) {
          accountsServerUrl = `https://accounts.${apiDomain}`;
        }

        // Set the service with proper values
        if (accountsServerUrl) {
          zohoService.setAccountsServer(accountsServerUrl, apiDomain);
        }
      }

      // Build description with session metadata and screenshots (Zoho uses HTML)
      let description =
        issue.description || "Screenshot captured from SnapFlow";
      if (issue.sessionData) {
        const sd = issue.sessionData;
        const durationSec = Math.round(sd.duration / 1000);
        description +=
          `<br/><br/><strong>Session Summary</strong><br/>` +
          `Duration: ${durationSec}s<br/>` +
          `Screenshots: ${sd.screenshotCount}<br/>` +
          `Events captured: ${sd.eventCount}`;

        if (sd.cloudScreenshotUrls?.length) {
          description += `<br/><br/><strong>Screenshots:</strong><br/>`;
          sd.cloudScreenshotUrls.forEach((url, i) => {
            description += `<strong>${i + 1}.</strong> <img src="${url}" style="max-width:600px;max-height:400px;" /><br/>`;
          });
        } else if (issue.cloudFileUrl) {
          description += `<br/><br/><strong>Screenshot:</strong><br/><img src="${issue.cloudFileUrl}" style="max-width:600px;max-height:400px;" />`;
        }
      } else if (issue.cloudFileUrl) {
        description += `<br/><br/><strong>Screenshot:</strong><br/><img src="${issue.cloudFileUrl}" style="max-width:600px;max-height:400px;" />`;
      }

      // Try to create bug with current access token
      let accessToken = config.accessToken;

      try {
        const result = await zohoService.createBug(
          accessToken,
          config.portalId,
          config.projectId,
          {
            title: issue.title,
            description,
          }
        );

        return {
          bugId: result.bugId,
          url: result.url,
          isUpdate: false,
        };
      } catch (error) {
        // If we get a 401, try to refresh the token
        if (error.response?.status === 401 && config.refreshToken) {
          try {
            const newAccessToken = await zohoService.refreshAccessToken(
              config.refreshToken
            );

            // Update the connector with the new token
            await this.updateConnector(connector.id, {
              config: {
                ...config,
                accessToken: newAccessToken,
              },
            });

            accessToken = newAccessToken;

            // Retry bug creation with new token
            const result = await zohoService.createBug(
              accessToken,
              config.portalId,
              config.projectId,
              {
                title: issue.title,
                description,
              }
            );

            return {
              bugId: result.bugId,
              url: result.url,
              isUpdate: false,
            };
          } catch (refreshError) {
            log.error("[Zoho] Failed to refresh access token:", refreshError);
            throw new Error(
              "Zoho access token expired and could not be refreshed. Please reconnect in Settings.",
              { cause: refreshError }
            );
          }
        }

        throw error;
      }
    } catch (error) {
      log.error("[Zoho] Sync error:", error);
      if (error.response?.status === 401) {
        throw new Error("Zoho access token is invalid or expired", {
          cause: error,
        });
      } else if (error.response?.status === 404) {
        throw new Error("Zoho portal or project not found", {
          cause: error,
        });
      } else if (error.response?.status === 403) {
        throw new Error("Zoho API access denied or insufficient permissions", {
          cause: error,
        });
      }
      throw new Error(
        `Failed to sync to Zoho: ${error.response?.data?.message || error.response?.data?.errorMessage || error.message}`,
        {
          cause: error,
        }
      );
    }
  }

  /**
   * Close (delete equivalent) a GitHub issue
   * Note: GitHub API doesn't support deleting issues, only closing them
   */
  async closeGitHubIssue(
    connector: Connector,
    issueNumber: number
  ): Promise<void> {
    const config = connector.config as {
      owner: string;
      repo: string;
      accessToken: string;
    };

    if (!config.accessToken || !config.owner || !config.repo) {
      throw new Error("GitHub connector not properly configured");
    }

    try {
      await axios.patch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${issueNumber}`,
        { state: "closed" },
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error) {
      log.error(
        "[GitHub] ✗ Failed to close issue:",
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to close GitHub issue: ${error.response?.data?.message || error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Update a Zoho bug with new title/description
   */
  async updateZohoBug(
    connector: Connector,
    bugId: string,
    updates: { title?: string; description?: string; tags?: string[] }
  ): Promise<void> {
    const config = connector.config as ZohoConnectorConfig;

    if (!config.accessToken || !config.portalId || !config.projectId) {
      throw new Error("Zoho connector not properly configured");
    }

    try {
      // Set accounts server if present (for region-specific API calls)
      if (config.accountsServer || config.apiDomain) {
        let accountsServerUrl = config.accountsServer;
        let apiDomain = config.apiDomain;

        // If apiDomain is a full URL, extract just the hostname
        if (apiDomain && apiDomain.includes("://")) {
          try {
            const url = new URL(apiDomain);
            apiDomain = url.hostname;
          } catch (_e) {
            log.warn("[Zoho] Failed to parse apiDomain as URL:", apiDomain);
          }
        }

        // If we don't have accountsServer but have apiDomain, construct it
        if (!accountsServerUrl && apiDomain) {
          accountsServerUrl = `https://accounts.${apiDomain}`;
        }

        // Set the service with proper values
        if (accountsServerUrl) {
          zohoService.setAccountsServer(accountsServerUrl, apiDomain);
        }
      }

      let accessToken = config.accessToken;

      try {
        // Note: Zoho API doesn't support tags, only title and description
        const updateData: { title?: string; description?: string } = {};
        if (updates.title) updateData.title = updates.title;
        if (updates.description) updateData.description = updates.description;

        await zohoService.updateBug(
          accessToken,
          config.portalId,
          config.projectId,
          bugId,
          updateData
        );
      } catch (error) {
        // If we get a 401, try to refresh the token
        if (error.response?.status === 401 && config.refreshToken) {
          try {
            const newAccessToken = await zohoService.refreshAccessToken(
              config.refreshToken
            );

            // Update the connector with the new token
            await this.updateConnector(connector.id, {
              config: {
                ...config,
                accessToken: newAccessToken,
              },
            });

            accessToken = newAccessToken;

            // Retry update with new token
            const updateData: { title?: string; description?: string } = {};
            if (updates.title) updateData.title = updates.title;
            if (updates.description)
              updateData.description = updates.description;

            await zohoService.updateBug(
              accessToken,
              config.portalId,
              config.projectId,
              bugId,
              updateData
            );
          } catch (refreshError) {
            log.error("[Zoho] Failed to refresh access token:", refreshError);
            throw new Error(
              "Zoho access token expired and could not be refreshed. Please reconnect in Settings.",
              { cause: refreshError }
            );
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      log.error("[Zoho] Update error:", error);
      if (error.response?.status === 401) {
        throw new Error("Zoho access token is invalid or expired", {
          cause: error,
        });
      } else if (error.response?.status === 404) {
        throw new Error("Zoho bug not found", {
          cause: error,
        });
      }
      throw error;
    }
  }

  /**
   * Delete a Zoho bug
   */
  async deleteZohoBug(connector: Connector, bugId: string): Promise<void> {
    const config = connector.config as ZohoConnectorConfig;

    if (!config.accessToken || !config.portalId || !config.projectId) {
      throw new Error("Zoho connector not properly configured");
    }

    try {
      // Set accounts server if present (for region-specific API calls)
      if (config.accountsServer || config.apiDomain) {
        let accountsServerUrl = config.accountsServer;
        let apiDomain = config.apiDomain;

        // If apiDomain is a full URL, extract just the hostname
        if (apiDomain && apiDomain.includes("://")) {
          try {
            const url = new URL(apiDomain);
            apiDomain = url.hostname;
          } catch (_e) {
            log.warn("[Zoho] Failed to parse apiDomain as URL:", apiDomain);
          }
        }

        // If we don't have accountsServer but have apiDomain, construct it
        if (!accountsServerUrl && apiDomain) {
          accountsServerUrl = `https://accounts.${apiDomain}`;
        }

        // Set the service with proper values
        if (accountsServerUrl) {
          zohoService.setAccountsServer(accountsServerUrl, apiDomain);
        }
      }

      let accessToken = config.accessToken;

      try {
        await zohoService.deleteBug(
          accessToken,
          config.portalId,
          config.projectId,
          bugId
        );
      } catch (error) {
        // If we get a 401, try to refresh the token
        if (error.response?.status === 401 && config.refreshToken) {
          try {
            const newAccessToken = await zohoService.refreshAccessToken(
              config.refreshToken
            );

            // Update the connector with the new token
            await this.updateConnector(connector.id, {
              config: {
                ...config,
                accessToken: newAccessToken,
              },
            });

            accessToken = newAccessToken;

            // Retry delete with new token
            await zohoService.deleteBug(
              accessToken,
              config.portalId,
              config.projectId,
              bugId
            );
          } catch (refreshError) {
            log.error("[Zoho] Failed to refresh access token:", refreshError);
            throw new Error(
              "Zoho access token expired and could not be refreshed. Please reconnect in Settings.",
              { cause: refreshError }
            );
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      log.error("[Zoho] Delete error:", error);
      if (error.response?.status === 401) {
        throw new Error("Zoho access token is invalid or expired", {
          cause: error,
        });
      } else if (error.response?.status === 404) {
        throw new Error("Zoho bug not found", {
          cause: error,
        });
      }
      throw error;
    }
  }

  /**
   * Helper: Map Supabase connector row to Connector interface
   */
  private mapSupabaseConnector(data: Record<string, unknown>): Connector {
    return {
      id: data.id as string,
      workspaceId: data.workspace_id as string,
      createdBy: data.created_by as string,
      name: data.name as string,
      type: data.type as "github" | "zoho",
      enabled: data.enabled as boolean,
      config: data.config as unknown as
        | GitHubConnectorConfig
        | ZohoConnectorConfig,
      lastSyncAt: (data.last_sync_at as string) || undefined,
      createdAt: (data.created_at as string) || undefined,
      updatedAt: (data.updated_at as string) || undefined,
    };
  }
}

export const connectorService = new ConnectorService();

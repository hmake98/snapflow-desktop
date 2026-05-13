import axios from "axios";
import log from "electron-log";

export interface ZohoPortal {
  id?: string;
  portal_id?: string;
  name?: string;
  portal_name?: string;
  owner?: {
    id: string;
    name: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  timezone?: string;
  profile?: {
    id: string;
    name: string;
  };
  link?: {
    project?: {
      url: string;
    };
  };
}

export interface ZohoProject {
  id_string: string;
  name: string;
}

export interface ZohoTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  apiDomain?: string;
}

export class ZohoService {
  private readonly redirectUri = "http://localhost:3000/auth/zoho/callback";
  private authBaseUrl = "https://accounts.zoho.com/oauth/v2";
  private apiBaseUrl = "https://projectsapi.zoho.com/restapi";
  private accountsServer = "https://accounts.zoho.com";

  /**
   * Set the accounts server based on region (from callback params)
   * This is needed because Zoho uses region-specific OAuth servers
   */
  setAccountsServer(accountsServerUrl: string, apiDomain?: string): void {
    this.accountsServer = accountsServerUrl;
    this.authBaseUrl = `${accountsServerUrl}/oauth/v2`;

    let domain: string;

    // For Projects API, always extract from accounts server first
    // The api_domain from OAuth might not work directly with Projects API
    // Example: api_domain="zohoapis.in" but Projects API needs "zoho.in"
    const accountsDomain = new URL(accountsServerUrl).hostname.replace(
      "accounts.",
      ""
    );

    // Use the accounts-derived domain for Projects API
    // This is more reliable than the api_domain from OAuth response
    domain = accountsDomain;

    // Log the apiDomain for reference if provided
    if (apiDomain) {
    }

    // Construct the Projects API base URL using V3 API (new version)
    // Projects API uses: https://projectsapi.{region}/api/v3/
    this.apiBaseUrl = `https://projectsapi.${domain}/api/v3`;
  }

  private get clientId(): string {
    const id = process.env.ZOHO_CLIENT_ID;
    if (!id) throw new Error("ZOHO_CLIENT_ID environment variable not set");
    return id;
  }

  private get clientSecret(): string {
    const secret = process.env.ZOHO_CLIENT_SECRET;
    if (!secret)
      throw new Error("ZOHO_CLIENT_SECRET environment variable not set");
    return secret;
  }

  /**
   * Generate Zoho OAuth authorization URL
   */
  getAuthUrl(): string {
    if (!this.clientId) {
      throw new Error("ZOHO_CLIENT_ID environment variable not set");
    }

    const scopes = [
      "ZohoProjects.portals.READ",
      "ZohoProjects.projects.READ",
      "ZohoProjects.bugs.CREATE",
      "ZohoProjects.bugs.READ",
      "ZohoProjects.bugs.UPDATE",
      "ZohoProjects.bugs.DELETE",
      "ZohoProjects.tasks.CREATE",
    ].join(",");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      scope: scopes,
      redirect_uri: this.redirectUri,
      access_type: "offline",
      prompt: "consent",
    });

    const url = `${this.authBaseUrl}/auth?${params.toString()}`;
    return url;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
  async exchangeCodeForTokens(code: string): Promise<ZohoTokens> {
    if (!this.clientId || !this.clientSecret) {
      log.error(
        "[Zoho] Missing credentials - ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET not configured"
      );
      throw new Error("ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET not configured");
    }

    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
      });

      const paramsString = params.toString();

      const response = await axios.post(
        `${this.authBaseUrl}/token`,
        paramsString,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token, refresh_token, expires_in, api_domain } =
        response.data;

      if (!access_token) {
        log.error("[Zoho] No access_token in response data:", response.data);
        throw new Error("No access token in response");
      }

      return {
        accessToken: access_token,
        refreshToken: refresh_token || "",
        expiresIn: expires_in || 3600,
        apiDomain: api_domain,
      };
    } catch (error) {
      log.error("[Zoho] ✗ Token exchange failed");
      log.error(
        "[Zoho] Error type:",
        error instanceof Error ? error.constructor.name : typeof error
      );
      log.error(
        "[Zoho] Error message:",
        error instanceof Error ? error.message : String(error)
      );

      if (error.response) {
        log.error("[Zoho] Response status:", error.response.status);
        log.error(
          "[Zoho] Response headers:",
          JSON.stringify(error.response.headers)
        );
        log.error("[Zoho] Response data:", JSON.stringify(error.response.data));
        log.error("[Zoho] Response data type:", typeof error.response.data);
      } else if (error.request) {
        log.error("[Zoho] Request made but no response received");
        log.error("[Zoho] Request:", error.request);
      } else {
        log.error("[Zoho] Error before request:", error.message);
      }

      if (error.stack) {
        log.error("[Zoho] Stack trace:", error.stack);
      }

      throw new Error(
        `Failed to exchange Zoho authorization code: ${error.response?.data?.error_description || error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Fetch list of portals for the authenticated user
   */
  async getPortals(accessToken: string): Promise<ZohoPortal[]> {
    try {
      const endpoint = `${this.apiBaseUrl}/portals`;
      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      });

      // V3 API returns portals as an array directly, not wrapped in an object
      const portals = Array.isArray(response.data)
        ? response.data
        : response.data.portals || response.data.data || [];

      if (portals.length > 0) {
      }

      return portals;
    } catch (error) {
      log.error("[Zoho] ✗ Failed to fetch portals");
      log.error("[Zoho] Error:", error.response?.data || error.message);
      throw new Error(
        `Failed to fetch Zoho portals: ${error.response?.data?.message || error.response?.data?.errorMessage || error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Fetch list of projects for a specific portal
   */
  async getProjects(
    accessToken: string,
    portalId: string
  ): Promise<ZohoProject[]> {
    try {
      const endpoint = `${this.apiBaseUrl}/portal/${portalId}/projects`;
      const response = await axios.get(endpoint, {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      });

      // V3 API returns projects as an array directly, not wrapped in an object
      const projects = Array.isArray(response.data)
        ? response.data
        : response.data.projects || response.data.data || [];

      if (projects.length > 0) {
      }

      return projects;
    } catch (error) {
      log.error("[Zoho] ✗ Failed to fetch projects");
      log.error("[Zoho] Error:", error.response?.data || error.message);
      throw new Error(
        `Failed to fetch Zoho projects: ${error.response?.data?.message || error.response?.data?.errorMessage || error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Validate access token by fetching portals
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      await this.getPortals(accessToken);
      return true;
    } catch (error) {
      log.warn("[Zoho] ✗ Token validation failed:", error.message);
      return false;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    if (!this.clientId || !this.clientSecret) {
      log.error("[Zoho] Missing credentials for token refresh");
      throw new Error("ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET not configured");
    }

    try {
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      const response = await axios.post(
        `${this.authBaseUrl}/token`,
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token } = response.data;

      if (!access_token) {
        log.error("[Zoho] No access_token in refresh response");
        throw new Error("No access token in refresh response");
      }

      return access_token;
    } catch (error) {
      log.error("[Zoho] ✗ Token refresh failed");
      log.error("[Zoho] Error:", error.response?.data || error.message);
      throw new Error(`Failed to refresh Zoho token: ${error.message}`, {
        cause: error,
      });
    }
  }

  /**
   * Update a bug in a Zoho Projects project
   * Per official Zoho docs: uses REST API endpoint with POST and form-encoded data
   * https://www.zoho.com/projects/help/rest-api/bugs-api.html
   */
  async updateBug(
    accessToken: string,
    portalId: string,
    projectId: string,
    bugId: string,
    updates: { title?: string; description?: string }
  ): Promise<void> {
    try {
      // Use REST API endpoint (not V3) as per Zoho official documentation
      const domain = new URL(this.accountsServer).hostname.replace(
        "accounts.",
        ""
      );
      const restApiBase = `https://projectsapi.${domain}/restapi`;
      const endpoint = `${restApiBase}/portal/${portalId}/projects/${projectId}/bugs/${bugId}/`;

      // Build form-encoded request body
      const bugData = new URLSearchParams();
      if (updates.title !== undefined && updates.title !== null) {
        bugData.append("title", updates.title);
      }
      if (updates.description !== undefined && updates.description !== null) {
        bugData.append("description", updates.description);
      }

      const bodyString = bugData.toString();

      const response = await axios.post(endpoint, bodyString, {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
    } catch (error) {
      log.error("[Zoho] ✗ Failed to update bug");
      log.error("[Zoho] Error status:", error.response?.status);
      log.error(
        "[Zoho] Error data (full):",
        JSON.stringify(error.response?.data, null, 2)
      );
      log.error("[Zoho] Error message:", error.message);

      let errorMsg = error.message;
      if (error.response?.data?.error?.details?.[0]) {
        const detail = error.response.data.error.details[0];
        errorMsg = `${detail.message}`;
      } else if (error.response?.data?.error?.title) {
        errorMsg = error.response.data.error.title;
      } else if (error.response?.data?.error?.message) {
        errorMsg = error.response.data.error.message;
      }

      throw new Error(`Failed to update Zoho bug: ${errorMsg}`, {
        cause: error,
      });
    }
  }

  /**
   * Delete a bug in a Zoho Projects project
   * Per official Zoho docs: uses REST API endpoint with DELETE
   * https://www.zoho.com/projects/help/rest-api/bugs-api.html
   */
  async deleteBug(
    accessToken: string,
    portalId: string,
    projectId: string,
    bugId: string
  ): Promise<void> {
    try {
      // Use REST API endpoint (not V3) as per Zoho official documentation
      const domain = new URL(this.accountsServer).hostname.replace(
        "accounts.",
        ""
      );
      const restApiBase = `https://projectsapi.${domain}/restapi`;
      const endpoint = `${restApiBase}/portal/${portalId}/projects/${projectId}/bugs/${bugId}/`;

      const response = await axios.delete(endpoint, {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      });
    } catch (error) {
      log.error("[Zoho] ✗ Failed to delete bug");
      log.error("[Zoho] Error status:", error.response?.status);
      log.error(
        "[Zoho] Error data:",
        JSON.stringify(error.response?.data, null, 2)
      );
      log.error("[Zoho] Error message:", error.message);

      // Re-throw with clear error message
      throw new Error(
        `Failed to delete Zoho bug: ${error.response?.data?.error?.title || error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Create a bug in a Zoho Projects project
   * Per official Zoho docs: uses REST API endpoint with POST and form-encoded data
   * https://www.zoho.com/projects/help/rest-api/bugs-api.html
   */
  async createBug(
    accessToken: string,
    portalId: string,
    projectId: string,
    bug: { title: string; description?: string; imageUrl?: string }
  ): Promise<{ bugId: string; url: string }> {
    try {
      // Use REST API endpoint (not V3) as per Zoho official documentation
      const domain = new URL(this.accountsServer).hostname.replace(
        "accounts.",
        ""
      );
      const restApiBase = `https://projectsapi.${domain}/restapi`;
      const endpoint = `${restApiBase}/portal/${portalId}/projects/${projectId}/bugs/`;

      // Build description with image URL if provided
      // Zoho uses HTML, not Markdown
      let description = bug.description || "Screenshot captured from SnapFlow";
      if (bug.imageUrl) {
        description += `<br/><br/><strong>Screenshot:</strong><br/><img src="${bug.imageUrl}" style="max-width: 600px; max-height: 400px;" />`;
      }

      // Build form-encoded request body
      const bugData = new URLSearchParams({
        title: bug.title,
        description,
      });

      const response = await axios.post(endpoint, bugData.toString(), {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      // Extract bug ID from response
      // REST API returns bugs in an array: { bugs: [{ id_string, id, key, ... }] }
      const bugsArray = response.data.bugs || response.data.data || [];
      if (!Array.isArray(bugsArray) || bugsArray.length === 0) {
        log.error("[Zoho] No bugs in response:", response.data);
        throw new Error("No bug returned from Zoho API");
      }

      const createdBug = bugsArray[0];
      const bugId = createdBug.id_string || createdBug.id || createdBug.key;
      if (!bugId) {
        log.error("[Zoho] No bug ID in response:", createdBug);
        throw new Error("No bug ID returned from Zoho API");
      }

      // Get URL from API response - Zoho returns nested link objects
      let url =
        (createdBug as any).web?.url ||
        (createdBug as any).link?.url ||
        (createdBug as any).url ||
        (createdBug as any).html_url ||
        (createdBug as any).web_url;

      if (!url) {
        // Fallback: Construct bug URL with correct Zoho format and regional domain
        url = `https://projects.${domain}/portal/${portalId}#zp/issues/custom-view/${projectId}/list/issue-detail/${bugId}`;
        log.warn("[Zoho] URL not in response, using constructed URL:", url);
      }

      return { bugId, url };
    } catch (error) {
      log.error("[Zoho] ✗ Failed to create bug");
      log.error("[Zoho] Error status:", error.response?.status);
      log.error(
        "[Zoho] Error data (full):",
        JSON.stringify(error.response?.data, null, 2)
      );
      if (error.response?.data?.error?.details) {
        log.error(
          "[Zoho] Validation details:",
          JSON.stringify(error.response.data.error.details, null, 2)
        );
      }
      log.error("[Zoho] Error message:", error.message);

      let errorMsg = error.message;
      if (error.response?.data?.error?.details?.[0]) {
        const detail = error.response.data.error.details[0];
        errorMsg = `${detail.field}: ${detail.message}`;
      } else if (error.response?.data?.error?.title) {
        errorMsg = error.response.data.error.title;
      }

      throw new Error(`Failed to create Zoho bug: ${errorMsg}`, {
        cause: error,
      });
    }
  }
}

export const zohoService = new ZohoService();

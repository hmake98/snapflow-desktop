import axios from "axios";
import log from "electron-log";

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  description?: string;
  url: string;
}

export interface GitHubUser {
  login: string;
  name?: string;
  avatar_url?: string;
}

export interface GitHubTokens {
  accessToken: string;
  expiresIn?: number;
}

export class GitHubService {
  private readonly redirectUri = "http://localhost:3000/auth/github/callback";
  private readonly authBaseUrl = "https://github.com/login/oauth";
  private readonly apiBaseUrl = "https://api.github.com";

  private get clientId(): string {
    const id = process.env.GITHUB_CLIENT_ID;
    if (!id) throw new Error("GITHUB_CLIENT_ID environment variable not set");
    return id;
  }

  private get clientSecret(): string {
    const secret = process.env.GITHUB_CLIENT_SECRET;
    if (!secret)
      throw new Error("GITHUB_CLIENT_SECRET environment variable not set");
    return secret;
  }

  /**
   * Generate GitHub OAuth authorization URL
   */
  getAuthUrl(): string {
    if (!this.clientId) {
      throw new Error("GITHUB_CLIENT_ID environment variable not set");
    }

    const scopes = [
      "repo", // Full access to repositories
      "user", // User profile info
    ].join(",");

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      allow_signup: "true",
      state: this.generateState(),
    });

    const url = `${this.authBaseUrl}/authorize?${params.toString()}`;
    return url;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<GitHubTokens> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not configured"
      );
    }

    try {
      const response = await axios.post(
        `${this.authBaseUrl}/access_token`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri,
        },
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      const { access_token, error, error_description } = response.data;

      if (error) {
        throw new Error(error_description || error);
      }

      if (!access_token) {
        throw new Error("No access token in response");
      }

      return {
        accessToken: access_token,
        expiresIn: 28800, // GitHub tokens don't expire, but we set a default
      };
    } catch (error) {
      log.error(
        "[GitHub] ✗ Failed to exchange code for token:",
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to exchange GitHub authorization code: ${error.response?.data?.error_description || error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Fetch authenticated user's profile
   */
  async getCurrentUser(accessToken: string): Promise<GitHubUser> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      const user: GitHubUser = {
        login: response.data.login,
        name: response.data.name,
        avatar_url: response.data.avatar_url,
      };

      return user;
    } catch (error) {
      log.error(
        "[GitHub] ✗ Failed to fetch user profile:",
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to fetch GitHub user profile: ${error.response?.data?.message || error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Fetch user's accessible repositories
   */
  async getRepositories(accessToken: string): Promise<GitHubRepository[]> {
    try {
      const repos: GitHubRepository[] = [];
      let page = 1;
      const perPage = 100;
      let hasMore = true;

      while (hasMore && page <= 10) {
        // Limit to 1000 repos for performance
        const response = await axios.get(`${this.apiBaseUrl}/user/repos`, {
          params: {
            page,
            per_page: perPage,
            sort: "updated",
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        repos.push(...response.data);
        hasMore = response.data.length === perPage;
        page++;
      }

      return repos;
    } catch (error) {
      log.error(
        "[GitHub] ✗ Failed to fetch repositories:",
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to fetch GitHub repositories: ${error.response?.data?.message || error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Validate access token and check repository access
   */
  async validateToken(
    accessToken: string,
    owner: string,
    repo: string
  ): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      // Check if we have push or admin permissions
      const permissions = response.data.permissions;
      const canPush = permissions?.push === true || permissions?.admin === true;

      if (!canPush) {
        log.warn("[GitHub] ✗ Token lacks push/admin permissions");
      }

      return canPush;
    } catch (error) {
      log.error(
        "[GitHub] ✗ Token validation failed:",
        error.response?.status,
        error.message
      );
      return false;
    }
  }

  /**
   * Generate a random state string for CSRF protection
   */
  private generateState(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}

export const githubService = new GitHubService();

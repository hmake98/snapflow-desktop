import React, { useEffect, useState } from "react";
import { Connector } from "../../types";
import { Button } from "../ui/Button";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
}

type OAuthStage = "idle" | "waiting" | "selecting" | "saving";

interface PendingGitHubAuth {
  user: { login: string; name?: string; avatar_url?: string } | null;
  repos: GitHubRepo[];
  selectedRepoId: number;
  selectedRepoName: string;
  selectedRepoFullName: string;
  connectorName: string;
  stage: OAuthStage;
  error: string;
}

export function GitHubConnectorManager() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [pendingAuth, setPendingAuth] = useState<PendingGitHubAuth | null>(
    null
  );

  const log = (message: string, data?: unknown) => {
    console.log(`[GitHubConnectorManager] ${message}`, data);
  };

  useEffect(() => {
    getWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadConnectors();
    }
  }, [workspaceId]);

  // Listen for OAuth success
  useEffect(() => {
    const unsubscribe = window.api.onGitHubOAuthSuccess(() => {
      log("[OAuth] Success event received, fetching user and repos");
      handleOAuthSuccess();
    });
    return unsubscribe;
  }, []);

  // Listen for OAuth error
  useEffect(() => {
    const unsubscribe = window.api.onGitHubOAuthError((error: string) => {
      log("[OAuth] Error event received:", error);
      setPendingAuth((prev) =>
        prev ? { ...prev, error, stage: "idle" } : null
      );
    });
    return unsubscribe;
  }, []);

  const getWorkspace = async () => {
    try {
      log("Fetching workspace...");
      const tenantResult = await window.api.getUserTenant();
      if (!tenantResult.success) {
        log("Failed to get tenant:", tenantResult.error);
        setLoading(false);
        return;
      }
      if (!tenantResult.data?.id) {
        log("No tenant found");
        setLoading(false);
        return;
      }

      const workspacesResult = await window.api.listWorkspaces(
        tenantResult.data.id
      );
      if (!workspacesResult.success) {
        log("Failed to get workspaces:", workspacesResult.error);
        setLoading(false);
        return;
      }
      if (!workspacesResult.data?.length) {
        log("No workspaces found");
        setLoading(false);
        return;
      }

      log("Workspace found:", workspacesResult.data[0].id);
      setWorkspaceId(workspacesResult.data[0].id);
    } catch (error) {
      console.error("Failed to get workspace:", error);
      setLoading(false);
    }
  };

  const loadConnectors = async () => {
    try {
      const result = await window.api.listConnectors(workspaceId);
      if (result.success) {
        const githubConnectors = (result.data || []).filter(
          (c: Connector) => c.type === "github"
        );
        setConnectors(githubConnectors);
      }
    } catch (error) {
      console.error("Failed to load connectors:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartOAuth = async () => {
    log("Starting OAuth flow");
    setPendingAuth({
      user: null,
      repos: [],
      selectedRepoId: 0,
      selectedRepoName: "",
      selectedRepoFullName: "",
      connectorName: "",
      stage: "waiting",
      error: "",
    });

    try {
      const result = await window.api.githubSignIn();
      if (!result.success) {
        setPendingAuth((prev) =>
          prev
            ? {
                ...prev,
                error: result.error || "Failed to start auth",
                stage: "idle",
              }
            : null
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      log("Failed to start OAuth:", error);
      setPendingAuth((prev) =>
        prev ? { ...prev, error: msg, stage: "idle" } : null
      );
    }
  };

  const handleOAuthSuccess = async () => {
    log("OAuth successful, fetching user and repos");
    try {
      // Get user info
      const userResult = await window.api.getGitHubUser();
      if (!userResult.success) {
        setPendingAuth((prev) =>
          prev
            ? {
                ...prev,
                error: userResult.error || "Failed to fetch user info",
                stage: "idle",
              }
            : null
        );
        return;
      }

      // Get repos
      const reposResult = await window.api.getGitHubRepositories();
      if (!reposResult.success) {
        setPendingAuth((prev) =>
          prev
            ? {
                ...prev,
                error: reposResult.error || "Failed to fetch repos",
                stage: "idle",
              }
            : null
        );
        return;
      }

      const repos = reposResult.data || [];
      log("User and repos fetched:", { user: userResult.data, repos });
      setPendingAuth((prev) =>
        prev
          ? {
              ...prev,
              user: userResult.data,
              repos,
              stage: "selecting",
              error: "",
            }
          : null
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      log("Failed to fetch user/repos:", error);
      setPendingAuth((prev) =>
        prev ? { ...prev, error: msg, stage: "idle" } : null
      );
    }
  };

  const handleRepoSelect = (
    repoId: number,
    repoName: string,
    repoFullName: string
  ) => {
    log("Repository selected:", { repoId, repoFullName });
    setPendingAuth((prev) =>
      prev
        ? {
            ...prev,
            selectedRepoId: repoId,
            selectedRepoName: repoName,
            selectedRepoFullName: repoFullName,
          }
        : null
    );
  };

  const handleSaveConnector = async () => {
    if (!pendingAuth || !pendingAuth.selectedRepoId) {
      return;
    }

    log("Saving connector");
    setPendingAuth((prev) => (prev ? { ...prev, stage: "saving" } : null));

    try {
      // Get the access token from the main process (fallback to empty if not available)
      let accessToken = "";
      try {
        const tokenResult = await window.api.getGitHubAccessToken?.();
        if (tokenResult?.success && tokenResult?.accessToken) {
          accessToken = tokenResult.accessToken;
          log("GitHub access token retrieved successfully");
        } else {
          log(
            "Warning: GitHub access token not available, will be applied from pending tokens"
          );
        }
      } catch (tokenError) {
        log("Warning: Failed to get GitHub access token", tokenError);
        // Continue anyway - the token will be applied from pendingGitHubTokens in the IPC handler
      }

      const [owner, repo] = pendingAuth.selectedRepoFullName.split("/");
      const connectorName =
        pendingAuth.connectorName ||
        `GitHub (${pendingAuth.selectedRepoFullName})`;

      const result = await window.api.addConnector(workspaceId, {
        name: connectorName,
        type: "github",
        enabled: true,
        config: {
          accessToken,
          owner,
          repo,
        },
      });

      if (result.success) {
        log("Connector saved successfully");
        setPendingAuth(null);
        await loadConnectors();
      } else {
        setPendingAuth((prev) =>
          prev
            ? {
                ...prev,
                error: result.error || "Failed to save connector",
                stage: "selecting",
              }
            : null
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      log("Failed to save connector:", error);
      setPendingAuth((prev) =>
        prev ? { ...prev, error: msg, stage: "selecting" } : null
      );
    }
  };

  const handleCancel = () => {
    log("Canceling OAuth");
    setPendingAuth(null);
  };

  const handleToggleConnector = async (id: string, enabled: boolean) => {
    try {
      const result = await window.api.updateConnector(id, { enabled });
      if (result.success) {
        loadConnectors();
      }
    } catch (error) {
      console.error("Failed to update connector:", error);
    }
  };

  const handleDeleteConnector = async (id: string, name: string) => {
    const confirmed = confirm(
      `🗑️ Remove "${name}"?\n\nThis will disconnect GitHub. You can always reconnect it later.`
    );
    if (!confirmed) return;

    try {
      const result = await window.api.deleteConnector(id);
      if (result.success) {
        loadConnectors();
      }
    } catch (error) {
      console.error("Failed to delete connector:", error);
    }
  };

  if (loading && !workspaceId) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="w-10 h-10 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <div
              className="absolute inset-0 w-10 h-10 border-3 border-transparent border-t-blue-400/40 rounded-full animate-spin"
              style={{
                animationDuration: "1.5s",
                animationDirection: "reverse",
              }}
            ></div>
          </div>
          <span className="text-gray-300 font-medium">
            Loading GitHub connectors...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connected GitHub connectors */}
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className="group relative bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-2xl p-6 hover:border-gray-600/50 transition-all duration-300 backdrop-blur-sm max-w-4xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600/30 to-blue-700/20 border border-blue-600/50 rounded-xl flex items-center justify-center group-hover:border-blue-500/50 transition-all duration-300">
                <svg
                  className="w-6 h-6 text-blue-400 group-hover:text-blue-300"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-gray-100 group-hover:text-white transition-colors truncate">
                  {connector.name}
                </h3>
                <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors font-mono truncate">
                  {(connector.config as any).owner}/
                  {(connector.config as any).repo}
                </p>
              </div>

              <div
                className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  connector.enabled
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full mr-2 ${
                    connector.enabled ? "bg-green-400" : "bg-gray-400"
                  }`}
                ></div>
                {connector.enabled ? "Active" : "Disabled"}
              </div>
            </div>

            <div className="flex items-center space-x-3 ml-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={connector.enabled}
                  onChange={(e) =>
                    handleToggleConnector(connector.id, e.target.checked)
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 hover:bg-gray-500 peer-checked:hover:bg-blue-700 transition-colors"></div>
              </label>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  handleDeleteConnector(connector.id, connector.name)
                }
                className="hover:bg-red-500/10 hover:text-red-400"
                title={`Remove ${connector.name}`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* OAuth Flow - Stage 1: Idle (Sign In Button) */}
      {!pendingAuth && connectors.length === 0 && (
        <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-700/50 rounded-2xl p-6 backdrop-blur-sm max-w-4xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-blue-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-100">
                Connect GitHub
              </h3>
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-6">
            Click below to sign in with GitHub and authorize SnapFlow to access
            your repositories.
          </p>

          <div className="flex justify-end">
            <Button
              onClick={handleStartOAuth}
              variant="primary"
              size="lg"
              leftIcon={
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              }
              className="px-8"
            >
              Sign In with GitHub
            </Button>
          </div>
        </div>
      )}

      {/* Limit Reached Message */}
      {!pendingAuth && connectors.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-2xl p-6 backdrop-blur-sm max-w-4xl">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-blue-400">
                GitHub connector already added
              </h3>
              <p className="text-xs text-blue-300 mt-1">
                Only one GitHub connector per workspace is allowed. Delete the
                existing one to add a different repository.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OAuth Flow - Stage 2: Waiting */}
      {pendingAuth && pendingAuth.stage === "waiting" && (
        <div className="bg-gradient-to-br from-blue-900/20 to-gray-900/60 border border-blue-700/50 rounded-2xl p-8 backdrop-blur-sm max-w-4xl">
          <div className="flex flex-col items-center space-y-6">
            <div className="relative">
              <div className="w-12 h-12 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
              <div
                className="absolute inset-0 w-12 h-12 border-3 border-transparent border-t-blue-400/40 rounded-full animate-spin"
                style={{
                  animationDuration: "1.5s",
                  animationDirection: "reverse",
                }}
              ></div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                Authorizing with GitHub...
              </h3>
              <p className="text-sm text-gray-400">
                Complete the authorization in your browser window
              </p>
            </div>
            <Button onClick={handleCancel} variant="outline" size="sm">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* OAuth Flow - Stage 3: Selecting Repository or Saving */}
      {pendingAuth &&
        (pendingAuth.stage === "selecting" ||
          pendingAuth.stage === "saving") && (
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-700/50 rounded-2xl p-6 backdrop-blur-sm max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-blue-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-100">
                  Select Repository
                </h3>
              </div>
              {pendingAuth.user && (
                <div className="flex items-center space-x-2">
                  {pendingAuth.user.avatar_url ? (
                    <img
                      src={pendingAuth.user.avatar_url}
                      alt={pendingAuth.user.login}
                      className="w-8 h-8 rounded-full"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget
                          .nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                  ) : null}
                  {!pendingAuth.user.avatar_url && (
                    <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-full flex items-center justify-center text-xs text-blue-400 font-semibold">
                      {pendingAuth.user.login.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm text-gray-400">
                    {pendingAuth.user.login}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* Repository Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-100 mb-2">
                  Repository <span className="text-red-400">*</span>
                </label>
                <select
                  value={pendingAuth.selectedRepoId}
                  onChange={(e) => {
                    const repo = pendingAuth.repos.find(
                      (r) => r.id === parseInt(e.target.value)
                    );
                    if (repo) {
                      handleRepoSelect(repo.id, repo.name, repo.full_name);
                    }
                  }}
                  className="w-full px-4 py-3 bg-gray-900/60 border border-gray-700/50 text-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition-all duration-200"
                >
                  <option value="">Choose a repository...</option>
                  {pendingAuth.repos.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Connector Name */}
              <div>
                <label className="block text-sm font-medium text-gray-100 mb-2">
                  Display Name{" "}
                  <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={pendingAuth.connectorName}
                  onChange={(e) =>
                    setPendingAuth((prev) =>
                      prev ? { ...prev, connectorName: e.target.value } : null
                    )
                  }
                  placeholder="My GitHub Repo"
                  className="w-full px-4 py-3 bg-gray-900/60 border border-gray-700/50 text-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition-all duration-200"
                />
              </div>

              {/* Error Message */}
              {pendingAuth.error && (
                <div className="p-4 bg-red-900/20 border border-red-800/30 rounded-lg">
                  <p className="text-sm text-red-300">{pendingAuth.error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3">
                <Button onClick={handleCancel} variant="outline">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveConnector}
                  variant="primary"
                  disabled={
                    pendingAuth.stage === "saving" ||
                    !pendingAuth.selectedRepoId
                  }
                  isLoading={pendingAuth.stage === "saving"}
                >
                  {pendingAuth.stage === "saving"
                    ? "Saving..."
                    : "Save Connector"}
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

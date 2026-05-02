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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const log = (message: string, data?: unknown) => {
    console.log(`[GitHubConnectorManager] ${message}`, data);
  };

  useEffect(() => {
    getWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) loadConnectors();
  }, [workspaceId]);

  useEffect(() => {
    const unsubscribe = window.api.onGitHubOAuthSuccess(() => {
      log("[OAuth] Success event received");
      handleOAuthSuccess();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onGitHubOAuthError((error: string) => {
      log("[OAuth] Error:", error);
      setPendingAuth((prev) =>
        prev ? { ...prev, error, stage: "idle" } : null
      );
    });
    return unsubscribe;
  }, []);

  const getWorkspace = async () => {
    try {
      const activeResult = await window.api.getActiveWorkspaceId();
      if (activeResult.success && activeResult.data) {
        setWorkspaceId(activeResult.data);
        return;
      }
      const workspacesResult = await window.api.getUserWorkspaces();
      if (!workspacesResult.success || !workspacesResult.data?.length) {
        setLoading(false);
        return;
      }
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
        setConnectors(
          (result.data || []).filter((c: Connector) => c.type === "github")
        );
      }
    } catch (error) {
      console.error("Failed to load connectors:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartOAuth = async () => {
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
      setPendingAuth((prev) =>
        prev ? { ...prev, error: msg, stage: "idle" } : null
      );
    }
  };

  const handleOAuthSuccess = async () => {
    try {
      const [userResult, reposResult] = await Promise.all([
        window.api.getGitHubUser(),
        window.api.getGitHubRepositories(),
      ]);
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
      setPendingAuth((prev) =>
        prev
          ? {
              ...prev,
              user: userResult.data,
              repos: reposResult.data || [],
              stage: "selecting",
              error: "",
            }
          : null
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
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
    if (!pendingAuth?.selectedRepoId) return;
    setPendingAuth((prev) => (prev ? { ...prev, stage: "saving" } : null));
    try {
      let accessToken = "";
      try {
        const tokenResult = await window.api.getGitHubAccessToken?.();
        if (tokenResult?.success && tokenResult?.accessToken) {
          accessToken = tokenResult.accessToken;
        }
      } catch (error) {
        console.error("Failed to get GitHub access token", error);
      }

      const [owner, repo] = pendingAuth.selectedRepoFullName.split("/");
      const connectorName =
        pendingAuth.connectorName ||
        `GitHub (${pendingAuth.selectedRepoFullName})`;

      const result = await window.api.addConnector(workspaceId, {
        name: connectorName,
        type: "github",
        enabled: true,
        config: { accessToken, owner, repo },
      });

      if (result.success) {
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
      setPendingAuth((prev) =>
        prev ? { ...prev, error: msg, stage: "selecting" } : null
      );
    }
  };

  const handleToggleConnector = async (id: string, enabled: boolean) => {
    try {
      const result = await window.api.updateConnector(id, { enabled });
      if (result.success) loadConnectors();
    } catch (error) {
      console.error("Failed to update connector:", error);
    }
  };

  const handleDeleteConnector = async (id: string) => {
    try {
      const result = await window.api.deleteConnector(id);
      if (result.success) {
        setDeleteConfirmId(null);
        loadConnectors();
      }
    } catch (error) {
      console.error("Failed to delete connector:", error);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-700/60 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-gray-700/60 rounded w-1/3" />
            <div className="h-2.5 bg-gray-700/40 rounded w-1/4" />
          </div>
          <div className="w-16 h-7 bg-gray-700/60 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connected connectors */}
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-5 hover:border-gray-600/60 transition-all"
        >
          <div className="flex items-center gap-4">
            {/* GitHub icon */}
            <div className="w-10 h-10 bg-gray-700/60 border border-gray-600/50 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-gray-300"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100 truncate">
                {connector.name}
              </p>
              <p className="text-xs text-gray-500 font-mono truncate mt-0.5">
                {(connector.config as any).owner}/
                {(connector.config as any).repo}
              </p>
            </div>

            {/* Status + toggle + delete */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${
                  connector.enabled
                    ? "bg-green-500/15 text-green-400 border-green-500/30"
                    : "bg-gray-500/15 text-gray-400 border-gray-500/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${connector.enabled ? "bg-green-400" : "bg-gray-400"}`}
                />
                {connector.enabled ? "Active" : "Disabled"}
              </span>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={connector.enabled}
                  onChange={(e) =>
                    handleToggleConnector(connector.id, e.target.checked)
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 hover:bg-gray-500 transition-colors" />
              </label>

              {deleteConfirmId === connector.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Remove?</span>
                  <button
                    onClick={() => handleDeleteConnector(connector.id)}
                    className="text-xs px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 transition-all"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="text-xs px-2 py-1 bg-gray-700/50 text-gray-400 border border-gray-600/30 rounded-md hover:bg-gray-700 transition-all"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirmId(connector.id)}
                  className="w-7 h-7 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all"
                  title="Remove connector"
                >
                  <svg
                    className="w-3.5 h-3.5"
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
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Already connected notice */}
      {!pendingAuth && connectors.length > 0 && (
        <p className="text-xs text-gray-500 px-1">
          One GitHub connector per workspace. Delete the existing one to connect
          a different repository.
        </p>
      )}

      {/* Connect CTA — shown when no connectors */}
      {!pendingAuth && connectors.length === 0 && (
        <div className="border border-dashed border-gray-700/60 rounded-xl p-5 flex items-center justify-between gap-4 hover:border-gray-600/60 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-800 border border-gray-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-gray-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-300">Not connected</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Sign in with GitHub to sync issues to a repository
              </p>
            </div>
          </div>
          <Button onClick={handleStartOAuth} variant="primary" size="sm">
            Connect GitHub
          </Button>
        </div>
      )}

      {/* OAuth: Waiting for browser */}
      {pendingAuth?.stage === "waiting" && (
        <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-5 flex items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-200">
              Waiting for GitHub…
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Complete the authorization in your browser window
            </p>
          </div>
          <Button
            onClick={() => setPendingAuth(null)}
            variant="ghost"
            size="sm"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* OAuth: Select repo + name */}
      {pendingAuth &&
        (pendingAuth.stage === "selecting" ||
          pendingAuth.stage === "saving") && (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-100">
                Select a repository
              </p>
              {pendingAuth.user && (
                <div className="flex items-center gap-2">
                  {pendingAuth.user.avatar_url && (
                    <img
                      src={pendingAuth.user.avatar_url}
                      alt={pendingAuth.user.login}
                      className="w-6 h-6 rounded-full"
                    />
                  )}
                  <span className="text-xs text-gray-400">
                    {pendingAuth.user.login}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Repository <span className="text-red-400">*</span>
                </label>
                <select
                  value={pendingAuth.selectedRepoId}
                  onChange={(e) => {
                    const repo = pendingAuth.repos.find(
                      (r) => r.id === parseInt(e.target.value)
                    );
                    if (repo)
                      handleRepoSelect(repo.id, repo.name, repo.full_name);
                  }}
                  className="w-full h-10 px-3 bg-gray-900/60 border border-gray-600/50 text-gray-100 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                >
                  <option value="">Choose a repository…</option>
                  {pendingAuth.repos.map((repo) => (
                    <option
                      key={repo.id}
                      value={repo.id}
                      className="bg-gray-800"
                    >
                      {repo.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Display name <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={pendingAuth.connectorName}
                  onChange={(e) =>
                    setPendingAuth((prev) =>
                      prev ? { ...prev, connectorName: e.target.value } : null
                    )
                  }
                  placeholder={
                    pendingAuth.selectedRepoFullName
                      ? `GitHub (${pendingAuth.selectedRepoFullName})`
                      : "My GitHub Repo"
                  }
                  className="w-full h-10 px-3 bg-gray-900/60 border border-gray-600/50 text-gray-100 text-sm rounded-lg placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>
            </div>

            {pendingAuth.error && (
              <div className="px-3 py-2.5 bg-red-900/20 border border-red-800/30 rounded-lg">
                <p className="text-xs text-red-300">{pendingAuth.error}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                onClick={() => setPendingAuth(null)}
                variant="ghost"
                size="sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveConnector}
                variant="primary"
                size="sm"
                disabled={
                  pendingAuth.stage === "saving" || !pendingAuth.selectedRepoId
                }
                isLoading={pendingAuth.stage === "saving"}
              >
                {pendingAuth.stage === "saving" ? "Saving…" : "Save Connector"}
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}

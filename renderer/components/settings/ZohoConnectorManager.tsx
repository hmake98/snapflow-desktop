import React, { useEffect, useState } from "react";
import { Connector } from "../../types";
import { Button } from "../ui/Button";

interface ZohoPortal {
  id: string;
  name: string;
}

interface ZohoProject {
  id_string: string;
  name: string;
}

type OAuthStage = "idle" | "waiting" | "selecting" | "saving";

interface PendingZohoAuth {
  portals: ZohoPortal[];
  projects: ZohoProject[];
  selectedPortalId: string;
  selectedPortalName: string;
  selectedProjectId: string;
  selectedProjectName: string;
  connectorName: string;
  stage: OAuthStage;
  error: string;
}

export function ZohoConnectorManager() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [pendingAuth, setPendingAuth] = useState<PendingZohoAuth | null>(null);

  const log = (message: string, data?: unknown) => {
    console.log(`[ZohoConnectorManager] ${message}`, data);
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
    const unsubscribe = window.api.onZohoOAuthSuccess(() => {
      log("[OAuth] Success event received, fetching portals");
      handleOAuthSuccess();
    });
    return unsubscribe;
  }, []);

  // Listen for OAuth error
  useEffect(() => {
    const unsubscribe = window.api.onZohoOAuthError((error: string) => {
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
      // Prefer the actively selected workspace
      const activeResult = await window.api.getActiveWorkspaceId();
      if (activeResult.success && activeResult.data) {
        log("Active workspace found:", activeResult.data);
        setWorkspaceId(activeResult.data);
        return;
      }

      // Fallback: first workspace from user
      const workspacesResult = await window.api.getUserWorkspaces();
      if (!workspacesResult.success || !workspacesResult.data?.length) {
        log("No workspaces found");
        setLoading(false);
        return;
      }

      log("Workspace fallback:", workspacesResult.data[0].id);
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
        const zohoConnectors = (result.data || []).filter(
          (c: Connector) => c.type === "zoho"
        );
        setConnectors(zohoConnectors);
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
      portals: [],
      projects: [],
      selectedPortalId: "",
      selectedPortalName: "",
      selectedProjectId: "",
      selectedProjectName: "",
      connectorName: "",
      stage: "waiting",
      error: "",
    });

    try {
      const result = await window.api.zohoSignIn();
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
    log("OAuth successful, fetching portals");
    try {
      const result = await window.api.getZohoPortals();
      if (result.success) {
        // Debug: log raw API response
        log("Raw API response:", result.data);
        if (result.data && result.data.length > 0) {
          log("First portal fields:", Object.keys(result.data[0]));
          log("First portal data:", result.data[0]);
        }

        // Transform API response to match interface (API returns portal_name, we expect name)
        const portals = (result.data || []).map((p: any, index: number) => {
          const transformed = {
            id: String(p.id || p.portal_id || "unknown-" + index),
            name: p.portal_name || p.name || "Unnamed Portal",
          };
          log(`Portal ${index} transformed:`, transformed);
          return transformed;
        });
        log("Portals after transformation:", portals);
        setPendingAuth((prev) =>
          prev
            ? {
                ...prev,
                portals,
                stage: "selecting",
                error: "",
              }
            : null
        );
      } else {
        setPendingAuth((prev) =>
          prev
            ? {
                ...prev,
                error: result.error || "Failed to fetch portals",
                stage: "idle",
              }
            : null
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      log("Failed to fetch portals:", error);
      setPendingAuth((prev) =>
        prev ? { ...prev, error: msg, stage: "idle" } : null
      );
    }
  };

  const handlePortalSelect = async (portalId: string, portalName: string) => {
    log("Portal selected:", { portalId, portalName });
    setPendingAuth((prev) =>
      prev
        ? {
            ...prev,
            selectedPortalId: portalId,
            selectedPortalName: portalName,
            projects: [],
            selectedProjectId: "",
            selectedProjectName: "",
          }
        : null
    );

    try {
      const result = await window.api.getZohoProjects(portalId);
      if (result.success) {
        // Transform API response to match interface (API might return project_name)
        const projects = (result.data || []).map((p: any) => ({
          id_string: p.id_string || p.id,
          name: p.name || p.project_name,
        }));
        log("Projects fetched:", projects);
        setPendingAuth((prev) => (prev ? { ...prev, projects } : null));
      } else {
        setPendingAuth((prev) =>
          prev
            ? { ...prev, error: result.error || "Failed to fetch projects" }
            : null
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      log("Failed to fetch projects:", error);
      setPendingAuth((prev) => (prev ? { ...prev, error: msg } : null));
    }
  };

  const handleProjectSelect = (projectId: string, projectName: string) => {
    log("Project selected:", { projectId, projectName });
    setPendingAuth((prev) =>
      prev
        ? {
            ...prev,
            selectedProjectId: projectId,
            selectedProjectName: projectName,
          }
        : null
    );
  };

  const handleSaveConnector = async () => {
    if (
      !pendingAuth ||
      !pendingAuth.selectedPortalId ||
      !pendingAuth.selectedProjectId
    ) {
      return;
    }

    log("Saving connector");
    setPendingAuth((prev) => (prev ? { ...prev, stage: "saving" } : null));

    try {
      // Get the Zoho tokens from the main process (fallback to empty if not available)
      let accessToken = "";
      let refreshToken = "";
      let apiDomain = "";
      try {
        const tokenResult = await window.api.getZohoAccessToken?.();
        if (tokenResult?.success) {
          accessToken = tokenResult.accessToken || "";
          refreshToken = tokenResult.refreshToken || "";
          apiDomain = tokenResult.apiDomain || "";
          log("Zoho tokens retrieved successfully");
        } else {
          log(
            "Warning: Zoho tokens not available, will be applied from pending tokens"
          );
        }
      } catch (tokenError) {
        log("Warning: Failed to get Zoho tokens", tokenError);
        // Continue anyway - the tokens will be applied from pendingZohoTokens in the IPC handler
      }

      const connectorName =
        pendingAuth.connectorName ||
        `Zoho (${pendingAuth.selectedPortalName} / ${pendingAuth.selectedProjectName})`;

      const result = await window.api.addConnector(workspaceId, {
        name: connectorName,
        type: "zoho",
        enabled: true,
        config: {
          accessToken,
          refreshToken,
          clientId: "",
          clientSecret: "",
          portalId: pendingAuth.selectedPortalId,
          portalName: pendingAuth.selectedPortalName,
          projectId: pendingAuth.selectedProjectId,
          projectName: pendingAuth.selectedProjectName,
          apiDomain,
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
      `🗑️ Remove "${name}"?\n\nThis will disconnect Zoho. You can always reconnect it later.`
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
            <div className="w-10 h-10 border-3 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
            <div
              className="absolute inset-0 w-10 h-10 border-3 border-transparent border-t-orange-400/40 rounded-full animate-spin"
              style={{
                animationDuration: "1.5s",
                animationDirection: "reverse",
              }}
            ></div>
          </div>
          <span className="text-gray-300 font-medium">
            Loading Zoho connectors...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Connected Zoho connectors */}
      {connectors.map((connector) => (
        <div
          key={connector.id}
          className="group relative bg-gradient-to-br from-gray-800/40 to-gray-900/40 border border-orange-600/20 hover:border-orange-500/40 rounded-2xl p-7 transition-all duration-300 backdrop-blur-sm max-w-4xl shadow-lg hover:shadow-orange-500/5"
        >
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center space-x-5 flex-1">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-600/30 to-orange-700/20 border border-orange-600/50 rounded-xl flex items-center justify-center group-hover:border-orange-500/50 transition-all duration-300">
                <svg
                  className="w-6 h-6 text-orange-400 group-hover:text-orange-300"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-gray-100 group-hover:text-white transition-colors truncate">
                  {connector.name}
                </h3>
                <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors truncate mt-1">
                  <span className="inline-block mr-3">
                    📁{" "}
                    {(connector.config as any).portalName ||
                      (connector.config as any).portalId}
                  </span>
                  <span className="inline-block">
                    📌{" "}
                    {(connector.config as any).projectName ||
                      (connector.config as any).projectId}
                  </span>
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
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600 hover:bg-gray-500 peer-checked:hover:bg-orange-700 transition-colors"></div>
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
              <div className="w-10 h-10 bg-orange-600/20 border border-orange-500/30 rounded-xl flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-orange-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-100">
                Connect Zoho Projects
              </h3>
            </div>
          </div>

          <p className="text-sm text-gray-400 mb-6">
            Click below to sign in with your Zoho account and authorize SnapFlow
            to access your projects.
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
              Sign In with Zoho
            </Button>
          </div>
        </div>
      )}

      {/* Limit Reached Message */}
      {!pendingAuth && connectors.length > 0 && (
        <div className="bg-orange-900/20 border border-orange-700/50 rounded-2xl p-6 backdrop-blur-sm max-w-4xl">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-orange-400"
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
              <h3 className="text-sm font-medium text-orange-400">
                Zoho connector already added
              </h3>
              <p className="text-xs text-orange-300 mt-1">
                Only one Zoho connector per workspace is allowed. Delete the
                existing one to add a different project.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OAuth Flow - Stage 2: Waiting */}
      {pendingAuth && pendingAuth.stage === "waiting" && (
        <div className="bg-gradient-to-br from-orange-900/20 to-gray-900/60 border border-orange-700/50 rounded-2xl p-8 backdrop-blur-sm max-w-4xl">
          <div className="flex flex-col items-center space-y-6">
            <div className="relative">
              <div className="w-12 h-12 border-3 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
              <div
                className="absolute inset-0 w-12 h-12 border-3 border-transparent border-t-orange-400/40 rounded-full animate-spin"
                style={{
                  animationDuration: "1.5s",
                  animationDirection: "reverse",
                }}
              ></div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                Authorizing with Zoho...
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

      {/* OAuth Flow - Stage 3: Selecting Portal & Project or Saving */}
      {pendingAuth &&
        (pendingAuth.stage === "selecting" ||
          pendingAuth.stage === "saving") && (
          <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 border border-gray-700/50 rounded-2xl p-6 backdrop-blur-sm max-w-4xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-orange-600/20 border border-orange-500/30 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-orange-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-100">
                  Select Portal & Project
                </h3>
              </div>
            </div>

            <div className="space-y-6">
              {/* Portal Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-100 mb-2">
                  Zoho Portal <span className="text-red-400">*</span>
                </label>
                <select
                  value={pendingAuth.selectedPortalId}
                  onChange={(e) => {
                    const portal = pendingAuth.portals.find(
                      (p) => p.id === e.target.value
                    );
                    if (portal) {
                      handlePortalSelect(portal.id, portal.name);
                    }
                  }}
                  className="w-full px-4 py-3 bg-gray-900/60 border border-gray-700/50 text-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 outline-none transition-all duration-200"
                >
                  <option value="">Choose a portal...</option>
                  {pendingAuth.portals.map((portal) => (
                    <option key={portal.id} value={portal.id}>
                      {portal.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Project Selection */}
              {pendingAuth.selectedPortalId && (
                <div>
                  <label className="block text-sm font-medium text-gray-100 mb-2">
                    Project <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={pendingAuth.selectedProjectId}
                    onChange={(e) => {
                      const project = pendingAuth.projects.find(
                        (p) => p.id_string === e.target.value
                      );
                      if (project) {
                        handleProjectSelect(project.id_string, project.name);
                      }
                    }}
                    className="w-full px-4 py-3 bg-gray-900/60 border border-gray-700/50 text-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 outline-none transition-all duration-200"
                  >
                    <option value="">Choose a project...</option>
                    {pendingAuth.projects.map((project) => (
                      <option key={project.id_string} value={project.id_string}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                  placeholder="My Zoho Connector"
                  className="w-full px-4 py-3 bg-gray-900/60 border border-gray-700/50 text-gray-100 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 outline-none transition-all duration-200"
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
                    !pendingAuth.selectedPortalId ||
                    !pendingAuth.selectedProjectId
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

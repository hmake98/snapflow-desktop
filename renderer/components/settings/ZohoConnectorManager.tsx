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

// Zoho "Z" icon as inline SVG
function ZohoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14H8l5-8H8V8h5l-5 8h5v2z" />
    </svg>
  );
}

export function ZohoConnectorManager() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [pendingAuth, setPendingAuth] = useState<PendingZohoAuth | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    getWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) loadConnectors();
  }, [workspaceId]);

  useEffect(() => {
    const unsubscribe = window.api.onZohoOAuthSuccess(() => {
      handleOAuthSuccess();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.onZohoOAuthError((error: string) => {
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
          (result.data || []).filter((c: Connector) => c.type === "zoho")
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
      setPendingAuth((prev) =>
        prev ? { ...prev, error: msg, stage: "idle" } : null
      );
    }
  };

  const handleOAuthSuccess = async () => {
    try {
      const result = await window.api.getZohoPortals();
      if (result.success) {
        const portals = (result.data || []).map((p: any, index: number) => ({
          id: String(p.id || p.portal_id || "unknown-" + index),
          name: p.portal_name || p.name || "Unnamed Portal",
        }));
        setPendingAuth((prev) =>
          prev ? { ...prev, portals, stage: "selecting", error: "" } : null
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
      setPendingAuth((prev) =>
        prev ? { ...prev, error: msg, stage: "idle" } : null
      );
    }
  };

  const handlePortalSelect = async (portalId: string, portalName: string) => {
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
        const projects = (result.data || []).map((p: any) => ({
          id_string: p.id_string || p.id,
          name: p.name || p.project_name,
        }));
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
      setPendingAuth((prev) => (prev ? { ...prev, error: msg } : null));
    }
  };

  const handleProjectSelect = (projectId: string, projectName: string) => {
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
    if (!pendingAuth?.selectedPortalId || !pendingAuth?.selectedProjectId)
      return;
    setPendingAuth((prev) => (prev ? { ...prev, stage: "saving" } : null));
    try {
      let accessToken = "";
      let refreshToken = "";
      let apiDomain = "";
      try {
        const tokenResult = await window.api.getZohoAccessToken?.();
        if (tokenResult?.success) {
          accessToken = tokenResult.accessToken || "";
          refreshToken = tokenResult.refreshToken || "";
          apiDomain = tokenResult.apiDomain || "";
        }
      } catch (error) {
        console.error("Failed to get Zoho access token", error);
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
            {/* Zoho icon */}
            <div className="w-10 h-10 bg-orange-600/15 border border-orange-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <ZohoIcon className="w-5 h-5 text-orange-400" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100 truncate">
                {connector.name}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  {(connector.config as any).portalName ||
                    (connector.config as any).portalId}
                </span>
                <span className="text-gray-700">·</span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  {(connector.config as any).projectName ||
                    (connector.config as any).projectId}
                </span>
              </div>
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
                <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600 hover:bg-gray-500 transition-colors" />
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
          One Zoho connector per workspace. Delete the existing one to connect a
          different project.
        </p>
      )}

      {/* Connect CTA — shown when no connectors */}
      {!pendingAuth && connectors.length === 0 && (
        <div className="border border-dashed border-gray-700/60 rounded-xl p-5 flex items-center justify-between gap-4 hover:border-gray-600/60 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-600/10 border border-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <ZohoIcon className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-300">Not connected</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Sign in with Zoho to sync issues to a project
              </p>
            </div>
          </div>
          <Button onClick={handleStartOAuth} variant="primary" size="sm">
            Connect Zoho
          </Button>
        </div>
      )}

      {/* OAuth: Waiting for browser */}
      {pendingAuth?.stage === "waiting" && (
        <div className="bg-orange-950/20 border border-orange-800/30 rounded-xl p-5 flex items-center gap-4">
          <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-200">
              Waiting for Zoho…
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

      {/* OAuth: Select portal + project + name */}
      {pendingAuth &&
        (pendingAuth.stage === "selecting" ||
          pendingAuth.stage === "saving") && (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-100">
              Select portal &amp; project
            </p>

            <div className="space-y-3">
              {/* Portal select */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Portal <span className="text-red-400">*</span>
                </label>
                <select
                  value={pendingAuth.selectedPortalId}
                  onChange={(e) => {
                    const portal = pendingAuth.portals.find(
                      (p) => p.id === e.target.value
                    );
                    if (portal) handlePortalSelect(portal.id, portal.name);
                  }}
                  className="w-full h-10 px-3 bg-gray-900/60 border border-gray-600/50 text-gray-100 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
                >
                  <option value="">Choose a portal…</option>
                  {pendingAuth.portals.map((portal) => (
                    <option
                      key={portal.id}
                      value={portal.id}
                      className="bg-gray-800"
                    >
                      {portal.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Project select — shown after portal chosen */}
              {pendingAuth.selectedPortalId && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">
                    Project <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={pendingAuth.selectedProjectId}
                    onChange={(e) => {
                      const project = pendingAuth.projects.find(
                        (p) => p.id_string === e.target.value
                      );
                      if (project)
                        handleProjectSelect(project.id_string, project.name);
                    }}
                    disabled={pendingAuth.projects.length === 0}
                    className="w-full h-10 px-3 bg-gray-900/60 border border-gray-600/50 text-gray-100 text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all disabled:opacity-50"
                  >
                    <option value="">
                      {pendingAuth.projects.length === 0
                        ? "Loading projects…"
                        : "Choose a project…"}
                    </option>
                    {pendingAuth.projects.map((project) => (
                      <option
                        key={project.id_string}
                        value={project.id_string}
                        className="bg-gray-800"
                      >
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Display name */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
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
                    pendingAuth.selectedProjectName
                      ? `Zoho (${pendingAuth.selectedPortalName} / ${pendingAuth.selectedProjectName})`
                      : "My Zoho Connector"
                  }
                  className="w-full h-10 px-3 bg-gray-900/60 border border-gray-600/50 text-gray-100 text-sm rounded-lg placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
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
                  pendingAuth.stage === "saving" ||
                  !pendingAuth.selectedPortalId ||
                  !pendingAuth.selectedProjectId
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

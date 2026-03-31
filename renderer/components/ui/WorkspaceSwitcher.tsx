import React, { useState, useEffect, useRef } from "react";
import { useStore } from "../../store/useStore";
import type { WorkspaceWithRole } from "../../types";

export function WorkspaceSwitcher() {
  const { activeWorkspace, setActiveWorkspace } = useStore();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadWorkspaces = async () => {
    if (workspaces.length > 0) return; // Already loaded
    setLoading(true);
    try {
      const r = await window.api.getUserWorkspaces();
      if (r.success && r.data) {
        setWorkspaces(r.data);
        // Auto-set active workspace if none selected
        if (!activeWorkspace && r.data.length > 0) {
          setActiveWorkspace(r.data[0]);
          window.api.setActiveWorkspace(r.data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!open) loadWorkspaces();
    setOpen((v) => !v);
  };

  const handleSelect = (ws: WorkspaceWithRole) => {
    setActiveWorkspace(ws);
    window.api.setActiveWorkspace(ws.id);
    setOpen(false);
    window.api.showNotification("Workspace Switched", `Switched to ${ws.name}`);
  };

  const ROLE_COLORS: Record<string, string> = {
    admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    pm: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    dev: "bg-green-500/20 text-green-300 border-green-500/30",
    qa: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    client: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  };

  const ROLE_LABELS: Record<string, string> = {
    admin: "Admin",
    pm: "PM",
    dev: "Dev",
    qa: "QA",
    client: "Client",
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-md hover:bg-gray-800/70 transition-all text-sm text-gray-400 hover:text-gray-200 max-w-[200px]"
      >
        <svg
          className="w-3.5 h-3.5 text-gray-500 flex-shrink-0"
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
        <span className="truncate font-medium">
          {activeWorkspace?.name ?? "Select workspace"}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-500 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-gray-900 border border-gray-700/50 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-2">
            {loading ? (
              <div className="space-y-1 mt-1">
                {[...Array(2)].map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse flex items-center gap-2 px-2 py-2.5 rounded-lg"
                  >
                    <div className="w-7 h-7 bg-gray-700 rounded-md" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-gray-700 rounded w-2/3" />
                      <div className="h-2.5 bg-gray-700 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : workspaces.length === 0 ? (
              <p className="text-center text-gray-500 py-4 text-xs px-2">
                No workspaces found.
              </p>
            ) : (
              (() => {
                // Group workspaces by tenantId to detect multi-org membership
                const tenantIds = Array.from(
                  new Set(workspaces.map((w) => w.tenantId))
                );
                const isMultiOrg = tenantIds.length > 1;

                return (
                  <div className="space-y-1">
                    {tenantIds.map((tenantId) => {
                      const tenantWorkspaces = workspaces.filter(
                        (w) => w.tenantId === tenantId
                      );
                      const tenantLabel =
                        tenantWorkspaces[0]?.tenantName ?? "Organization";

                      return (
                        <div key={tenantId}>
                          {isMultiOrg && (
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5 mt-1 first:mt-0 truncate">
                              {tenantLabel}
                            </p>
                          )}
                          {!isMultiOrg && (
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-1.5">
                              Your Workspaces
                            </p>
                          )}
                          <div className="space-y-0.5">
                            {tenantWorkspaces.map((ws) => {
                              const isActive = activeWorkspace?.id === ws.id;
                              return (
                                <button
                                  key={ws.id}
                                  onClick={() => handleSelect(ws)}
                                  className={`w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-left transition-all ${
                                    isActive
                                      ? "bg-blue-600/20 border border-blue-500/30"
                                      : "hover:bg-gray-800/60 border border-transparent"
                                  }`}
                                >
                                  <div
                                    className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                                      isActive
                                        ? "bg-blue-600 text-white"
                                        : "bg-gray-700/50 text-gray-400"
                                    }`}
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
                                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                      />
                                    </svg>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p
                                      className={`text-sm font-medium truncate ${
                                        isActive
                                          ? "text-blue-300"
                                          : "text-gray-200"
                                      }`}
                                    >
                                      {ws.name}
                                    </p>
                                    <span
                                      className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded-full border font-medium mt-0.5 ${
                                        ROLE_COLORS[ws.role] ??
                                        ROLE_COLORS.client
                                      }`}
                                    >
                                      {ROLE_LABELS[ws.role] ?? ws.role}
                                    </span>
                                  </div>
                                  {isActive && (
                                    <svg
                                      className="w-4 h-4 text-blue-400 flex-shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2.5}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}

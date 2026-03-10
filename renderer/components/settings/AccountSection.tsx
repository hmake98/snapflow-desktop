import React, { useState, useEffect } from "react";
import { Button } from "../ui/Button";
import { WorkspacesSection } from "./WorkspacesSection";
import { UsersSection } from "./UsersSection";
import type { Tenant, Workspace } from "../../types";

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

type Section = "profile" | "workspaces" | "team";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Sidebar nav item ──────────────────────────────────────────────────────────
function NavItem({
  icon,
  label,
  description,
  active,
  adminBadge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  active: boolean;
  adminBadge?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 transition-all duration-150 group ${
        active
          ? "bg-blue-600/15 border border-blue-500/25 text-blue-400"
          : "hover:bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-transparent"
      }`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          active
            ? "bg-blue-600/25 text-blue-400"
            : "bg-gray-800/80 text-gray-500 group-hover:text-gray-300"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium truncate ${active ? "text-blue-300" : ""}`}
          >
            {label}
          </span>
          {adminBadge && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-full leading-none">
              Admin
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 truncate mt-0.5">{description}</p>
      </div>
    </button>
  );
}

// ─── Field row (read mode) ─────────────────────────────────────────────────────
function FieldRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between py-3.5 border-b border-gray-800/60 last:border-0 gap-4">
      <span className="text-sm text-gray-500 w-36 flex-shrink-0 pt-px">
        {label}
      </span>
      <span
        className={`text-sm text-right flex-1 ${
          mono
            ? "font-mono text-gray-500 text-xs bg-gray-800/60 px-2.5 py-1 rounded-lg break-all"
            : "text-gray-100 font-medium"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export const AccountSection: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("profile");
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("dev");
  const [isTenantOwner, setIsTenantOwner] = useState(false);

  useEffect(() => {
    loadUser();
    loadWorkspaceAndTenant();
  }, []);

  const loadUser = async () => {
    try {
      const result = await window.api.getUser();
      if (result.success && result.data) {
        setUser(result.data);
        setFormData({ name: result.data.name, email: result.data.email });
      }
    } catch (error) {
      console.error("Failed to load user:", error);
      window.api.showNotification("Error", "Failed to load user information");
    }
  };

  const loadWorkspaceAndTenant = async () => {
    try {
      // Get current user first
      const userResult = await window.api.getUser();
      const currentUser = userResult.success ? userResult.data : null;

      // Get tenant
      const tenantResult = await window.api.getUserTenant();
      let currentTenant = null;
      let currentWorkspace = null;

      if (tenantResult.success && tenantResult.data) {
        currentTenant = tenantResult.data;
        setTenant(currentTenant);

        // Check if user is tenant owner
        if (currentUser && currentTenant.ownerId === currentUser.id) {
          setIsTenantOwner(true);
        }

        // Get first workspace for this tenant
        const workspacesResult = await window.api.listWorkspaces(
          currentTenant.id
        );
        if (workspacesResult.success && workspacesResult.data?.length > 0) {
          currentWorkspace = workspacesResult.data[0];
          setWorkspace(currentWorkspace);
        }
      }

      // Get user's workspaces with roles
      const userWsResult = await window.api.getUserWorkspaces();
      if (userWsResult.success && userWsResult.data?.length > 0) {
        // Check if user is admin in any workspace
        const adminWs = userWsResult.data.find(
          (w: { role: string }) => w.role === "admin"
        );
        if (adminWs) setIsAdmin(true);

        // Find user's role in the current workspace (if workspace exists)
        if (currentWorkspace) {
          const userWsInWorkspace = userWsResult.data.find(
            (w: { id: string; role: string }) => w.id === currentWorkspace.id
          );
          if (userWsInWorkspace) {
            setCurrentUserRole(userWsInWorkspace.role);
          }
        }
      }

      // Update isAdmin to include tenant owner
      if (
        currentUser &&
        currentTenant &&
        currentTenant.ownerId === currentUser.id
      ) {
        setIsAdmin(true);
      }
    } catch (error) {
      console.error("Failed to load workspace and tenant:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const result = await window.api.updateUser(user.id, {
        name: formData.name,
        email: formData.email,
      });
      if (result.success) {
        setUser(result.data);
        setEditing(false);
        window.api.showNotification(
          "Profile Updated",
          "Profile saved successfully"
        );
      } else {
        window.api.showNotification(
          "Error",
          result.error || "Failed to update profile"
        );
      }
    } catch {
      window.api.showNotification("Error", "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (user) setFormData({ name: user.name, email: user.email });
    setEditing(false);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex gap-6">
        {/* sidebar skeleton */}
        <div className="w-56 flex-shrink-0 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse h-14 bg-gray-800/50 rounded-xl"
            />
          ))}
        </div>
        {/* content skeleton */}
        <div className="flex-1 animate-pulse space-y-4">
          <div className="h-24 bg-gray-800/50 rounded-xl" />
          <div className="h-48 bg-gray-800/50 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Failed to load account information</p>
      </div>
    );
  }

  // ── Nav items ──────────────────────────────────────────────────────────────
  const navItems: {
    id: Section;
    label: string;
    description: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
  }[] = [
    {
      id: "profile",
      label: "Profile",
      description: "Name, email & details",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      ),
    },
    {
      id: "workspaces",
      label: "Workspaces",
      description: "Org & workspace settings",
      adminOnly: true,
      icon: (
        <svg
          className="w-4 h-4"
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
      ),
    },
    {
      id: "team",
      label: "Team Members",
      description: "Invite & manage roles",
      adminOnly: true,
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
  ];

  const visibleNav = navItems.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="flex gap-6 items-start">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-52 flex-shrink-0 space-y-1 sticky top-0">
        {/* User card at top of sidebar */}
        <div className="flex flex-col items-center text-center px-3 py-5 mb-3 bg-gray-900/60 border border-gray-800/50 rounded-xl">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-600/20 mb-3">
            {getInitials(user.name || user.email)}
          </div>
          <p className="text-sm font-semibold text-gray-100 truncate w-full">
            {user.name}
          </p>
          <p className="text-xs text-gray-500 truncate w-full mt-0.5">
            {user.email}
          </p>
          {isTenantOwner && (
            <span className="mt-2 text-[10px] px-2 py-0.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full">
              Owner
            </span>
          )}
          {!isTenantOwner && isAdmin && (
            <span className="mt-2 text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-full">
              Admin
            </span>
          )}
        </div>

        {visibleNav.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            description={item.description}
            active={activeSection === item.id}
            adminBadge={item.adminOnly}
            onClick={() => setActiveSection(item.id)}
          />
        ))}
      </aside>

      {/* ── Content panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* ── Profile ─────────────────────────────────────────────────────── */}
        {activeSection === "profile" && (
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/60 bg-gray-900/30">
              <div>
                <h3 className="text-base font-semibold text-gray-100">
                  Profile Information
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage your personal details
                </p>
              </div>
              {!editing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  leftIcon={
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
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  }
                >
                  Edit
                </Button>
              )}
            </div>

            <div className="px-6 py-2">
              {editing ? (
                <div className="space-y-4 py-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Full Name
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full h-10 px-4 bg-gray-800/80 border border-gray-600/50 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition-all"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="w-full h-10 px-4 bg-gray-800/80 border border-gray-600/50 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition-all"
                      placeholder="your@email.com"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSave}
                      isLoading={saving}
                      disabled={!formData.name || !formData.email}
                    >
                      Save Changes
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancel}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <FieldRow label="Full Name" value={user.name} />
                  <FieldRow label="Email Address" value={user.email} />
                  <FieldRow label="User ID" value={user.id} mono />
                  <FieldRow
                    label="Member Since"
                    value={new Date(user.createdAt).toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      }
                    )}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Workspaces ───────────────────────────────────────────────────── */}
        {activeSection === "workspaces" && isAdmin && (
          <>
            {tenant ? (
              <WorkspacesSection tenant={tenant} currentUserId={user.id} />
            ) : (
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-10 text-center">
                <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="w-6 h-6 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <p className="text-gray-400 font-medium">
                  Organisation not found
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Complete onboarding to access workspace management.
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Team Members ─────────────────────────────────────────────────── */}
        {activeSection === "team" && isAdmin && (
          <>
            {workspace && user ? (
              <UsersSection
                workspace={workspace}
                currentUserId={user.id}
                currentUserRole={currentUserRole as any}
                isTenantOwner={isTenantOwner}
              />
            ) : (
              <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-10 text-center">
                <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="w-6 h-6 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                <p className="text-gray-400 font-medium">Workspace not found</p>
                <p className="text-sm text-gray-500 mt-1">
                  Complete onboarding to manage team members.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from "react";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";
import { WorkspacesSection } from "./WorkspacesSection";
import { UsersSection } from "./UsersSection";
import { useStore } from "../../store/useStore";
import type { Tenant, Workspace } from "../../types";

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

type Tab = "profile" | "workspaces" | "team";

export const AccountSection: React.FC = () => {
  // Pull role + workspace from the Zustand store so settings always reflect
  // the currently-active workspace without a separate IPC fetch.
  const {
    user: storeUser,
    currentUserRole: storeRole,
    activeWorkspace: storeWorkspace,
  } = useStore();

  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [isTenantOwner, setIsTenantOwner] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Derive role and isAdmin from the store — always in sync with active workspace.
  const currentUserRole = storeRole ?? "member";
  const isAdmin =
    currentUserRole === "owner" ||
    currentUserRole === "admin" ||
    isTenantOwner;

  useEffect(() => {
    loadUser();
    loadWorkspaceAndTenant();
  }, []);

  // When the store's active workspace changes (user switches workspace),
  // sync local workspace state so the Users/Workspaces tabs update instantly.
  useEffect(() => {
    if (storeWorkspace) {
      setWorkspace(storeWorkspace as Workspace);
    }
  }, [storeWorkspace?.id]);

  const loadUser = async () => {
    try {
      const result = await window.api.getUser();
      if (result.success && result.data) {
        setUser(result.data);
        setFormData({ name: result.data.name, email: result.data.email });
      }
    } catch (error) {
      console.error("Failed to load user:", error);
    }
  };

  const loadWorkspaceAndTenant = async () => {
    try {
      // Use the store user if already loaded; fall back to IPC call.
      const currentUser =
        storeUser ??
        (await window.api.getUser().then((r) => (r.success ? r.data : null)));

      const tenantResult = await window.api.getUserTenant();

      if (tenantResult.success && tenantResult.data) {
        const currentTenant = tenantResult.data;
        setTenant(currentTenant);

        // Mark as tenant owner — this supplements the store role for the
        // isTenantOwner flag used in the UsersSection gating.
        if (currentUser && currentTenant.ownerId === currentUser.id) {
          setIsTenantOwner(true);
        }

        // Use the active workspace from the store if available (avoids listing
        // all workspaces just to pick the first one).
        if (storeWorkspace) {
          setWorkspace(storeWorkspace as Workspace);
        } else {
          const workspacesResult = await window.api.listWorkspaces(
            currentTenant.id
          );
          if (workspacesResult.success && workspacesResult.data?.length > 0) {
            setWorkspace(workspacesResult.data[0]);
          }
        }
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
        window.api.showNotification("Profile Updated", "Profile saved successfully");
      } else {
        window.api.showNotification("Error", result.error || "Failed to update profile");
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

  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      window.api.showNotification("Invalid file", "Please select a JPG, PNG, GIF, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      window.api.showNotification("File too large", "Avatar must be under 2 MB.");
      return;
    }

    const extension = file.name.split(".").pop() ?? "jpg";
    const arrayBuffer = await file.arrayBuffer();
    const fileData = Array.from(new Uint8Array(arrayBuffer));

    // Show local preview immediately
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarUploading(true);

    try {
      const result = await window.api.uploadAvatar(
        user.id,
        fileData,
        file.type,
        extension
      );
      if (result.success) {
        setUser(result.data);
        window.api.showNotification("Avatar Updated", "Your profile picture has been saved.");
      } else {
        setAvatarPreview(null);
        window.api.showNotification("Upload failed", result.error ?? "Could not upload avatar.");
      }
    } catch {
      setAvatarPreview(null);
      window.api.showNotification("Upload failed", "Could not upload avatar.");
    } finally {
      setAvatarUploading(false);
      // Reset input so the same file can be re-selected if needed
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setAvatarUploading(true);
    try {
      const result = await window.api.removeAvatar(user.id);
      if (result.success) {
        setUser(result.data);
        setAvatarPreview(null);
        window.api.showNotification("Avatar Removed", "Your profile picture has been removed.");
      } else {
        window.api.showNotification("Error", result.error ?? "Could not remove avatar.");
      }
    } catch {
      window.api.showNotification("Error", "Could not remove avatar.");
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 bg-gray-800/50 rounded-lg" />
        <div className="h-36 bg-gray-800/50 rounded-lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-8 text-center">
        <p className="text-gray-400">Failed to load account information</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: "profile", label: "Profile" },
    { id: "workspaces", label: "Workspaces", adminOnly: true },
    { id: "team", label: "Team Members", adminOnly: true },
  ];
  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  // Role badge config
  const roleBadge = isTenantOwner
    ? { label: "Owner", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" }
    : currentUserRole === "admin"
      ? { label: "Admin", cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" }
      : { label: "Member", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" };

  return (
    <div className="flex flex-col h-full">
      {/* ── Sub-tab bar (only when there are multiple tabs) ───────────────── */}
      {visibleTabs.length > 1 && (
        <div className="border-b border-gray-800/50 px-6 flex items-center gap-0.5">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "text-blue-400 border-blue-500"
                  : "text-gray-500 border-transparent hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content area — scrollable ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* Profile tab */}
        {activeTab === "profile" && (
          <div className="max-w-3xl space-y-3">
            {/* Avatar card */}
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/40">
                <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  Profile Photo
                </span>
                {(avatarPreview || user.avatarUrl) && !avatarUploading && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="text-xs text-gray-500 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="px-4 py-3 flex items-center gap-4">
                <div className="relative flex-shrink-0 group">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Profile"
                      className="w-14 h-14 rounded-full object-cover ring-2 ring-gray-700/60"
                    />
                  ) : (
                    <Avatar
                      src={user.avatarUrl}
                      name={user.name}
                      email={user.email}
                      size={56}
                    />
                  )}
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:cursor-not-allowed"
                    title="Change avatar"
                  >
                    {avatarUploading ? (
                      <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
                  >
                    {avatarUploading ? "Uploading…" : "Change photo"}
                  </button>
                  <p className="text-2xs text-gray-500 mt-0.5">JPG, PNG, GIF or WebP — max 2 MB</p>
                </div>
              </div>
            </div>

            {/* Profile fields */}
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/40">
                <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  Profile Information
                </span>
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="text-xs text-gray-500 hover:text-gray-200 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>

              {editing ? (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">
                      Full Name
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full h-9 px-3 bg-gray-900/60 border border-gray-600/50 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/60 transition-all"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full h-9 px-3 bg-gray-900/60 border border-gray-600/50 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/60 transition-all"
                      placeholder="your@email.com"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSave}
                      isLoading={saving}
                      disabled={!formData.name || !formData.email}
                    >
                      Save Changes
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-700/30">
                  {[
                    { label: "Full Name", value: user.name },
                    { label: "Email", value: user.email },
                    {
                      label: "Member Since",
                      value: new Date(user.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      }),
                    },
                    { label: "User ID", value: user.id, mono: true },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5 gap-4">
                      <span className="text-sm text-gray-500 flex-shrink-0 w-28">{label}</span>
                      <span
                        className={
                          mono
                            ? "text-2xs font-mono text-gray-500 bg-gray-900/50 px-2 py-0.5 rounded truncate max-w-[240px]"
                            : "text-sm text-gray-200 text-right truncate"
                        }
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                  {/* Role row */}
                  <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                    <span className="text-sm text-gray-500 flex-shrink-0 w-28">Role</span>
                    <span className={`text-2xs font-medium px-2 py-0.5 border rounded-full ${roleBadge.cls}`}>
                      {roleBadge.label}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Workspaces tab */}
        {activeTab === "workspaces" && isAdmin && (
          tenant ? (
            <WorkspacesSection tenant={tenant} currentUserId={user.id} />
          ) : (
            <div className="max-w-3xl">
              <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-8 text-center">
                <div className="w-10 h-10 bg-gray-700/40 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-400">Organisation not found</p>
                <p className="text-xs text-gray-600 mt-1">Complete onboarding to manage workspaces.</p>
              </div>
            </div>
          )
        )}

        {/* Team Members tab */}
        {activeTab === "team" && isAdmin && (
          (workspace && user) ? (
            <UsersSection
              workspace={workspace}
              currentUserId={user.id}
              currentUserRole={currentUserRole as any}
              isTenantOwner={isTenantOwner}
            />
          ) : (
            <div className="max-w-3xl">
              <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-8 text-center">
                <div className="w-10 h-10 bg-gray-700/40 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-400">Workspace not found</p>
                <p className="text-xs text-gray-600 mt-1">Complete onboarding to manage team members.</p>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

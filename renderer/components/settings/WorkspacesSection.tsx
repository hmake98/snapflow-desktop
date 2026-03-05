import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "../ui/Button";
import type {
  Workspace,
  WorkspaceMemberWithUser,
  UserRole,
  Tenant,
} from "../../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkspacesSectionProps {
  tenant: Tenant;
  currentUserId: string;
}

type ModalMode = "add" | "edit" | null;

interface WorkspaceFormState {
  name: string;
  description: string;
}

type ConfirmDeleteState = { id: string; name: string } | null;

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  pm: "Project Manager",
  dev: "Developer",
  qa: "QA",
  client: "Client",
};

const ROLE_COLORS: Record<UserRole, string> = {
  owner: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  pm: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  dev: "bg-green-500/20 text-green-300 border-green-500/30",
  qa: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  client: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

// Workspace-assignable roles (exclude "owner" which is tenant-level)
const WORKSPACE_ROLES: UserRole[] = ["admin", "pm", "dev", "qa", "client"];

// ─── WorkspaceMembersPanel ─────────────────────────────────────────────────────

function WorkspaceMembersPanel({
  workspace,
  currentUserId,
  onClose,
}: {
  workspace: Workspace;
  currentUserId: string;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<WorkspaceMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.api.listWorkspaceMembersWithUsers(workspace.id);
      if (r.success) setMembers(r.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleRoleChange = async (
    member: WorkspaceMemberWithUser,
    role: Exclude<UserRole, "owner">
  ) => {
    setUpdatingId(member.userId);
    try {
      const r = await window.api.updateMemberRole(
        workspace.id,
        member.userId,
        role
      );
      if (r.success) {
        toast.success(`Role updated to ${ROLE_LABELS[role]}`);
        setMembers((p) =>
          p.map((m) => (m.userId === member.userId ? { ...m, role } : m))
        );
      } else {
        toast.error(r.error ?? "Failed to update role");
      }
    } catch {
      toast.error("Failed to update role");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemove = async (member: WorkspaceMemberWithUser) => {
    setRemovingId(member.userId);
    try {
      const r = await window.api.removeWorkspaceMember(
        workspace.id,
        member.userId
      );
      if (r.success) {
        toast.success(`${member.user.name} removed`);
        setMembers((p) => p.filter((m) => m.userId !== member.userId));
      } else {
        toast.error(r.error ?? "Failed to remove member");
      }
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700/50 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h3 className="text-base font-semibold text-gray-100">
              Members — {workspace.name}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage members and roles for this workspace
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 flex items-center justify-center transition-all"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Members list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-1">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse flex items-center gap-3 p-3 rounded-xl bg-gray-800/30"
              >
                <div className="w-9 h-9 rounded-full bg-gray-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-700 rounded w-1/2" />
                </div>
                <div className="w-28 h-8 bg-gray-700 rounded-full" />
                <div className="w-8 h-8 bg-gray-700 rounded-lg" />
              </div>
            ))
          ) : members.length === 0 ? (
            <p className="text-center text-gray-500 py-10 text-sm">
              No members in this workspace.
            </p>
          ) : (
            members.map((member) => {
              const isSelf = member.userId === currentUserId;
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-800/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {(member.user.name || member.user.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-100 truncate">
                        {member.user.name || "Unknown"}
                      </p>
                      {isSelf && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {member.user.email}
                    </p>
                  </div>
                  {/* Role selector */}
                  <div className="relative w-36">
                    <select
                      value={member.role}
                      disabled={isSelf || updatingId === member.userId}
                      onChange={(e) =>
                        handleRoleChange(
                          member,
                          e.target.value as Exclude<UserRole, "owner">
                        )
                      }
                      className={`w-full h-8 pl-3 pr-7 text-xs font-medium rounded-full border appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed transition-all ${ROLE_COLORS[member.role]} bg-transparent`}
                    >
                      {WORKSPACE_ROLES.map((r) => (
                        <option
                          key={r}
                          value={r}
                          className="bg-gray-800 text-gray-100"
                        >
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                      <svg
                        className="w-3 h-3 opacity-60"
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
                    </div>
                  </div>
                  {/* Remove button */}
                  {!isSelf && (
                    <button
                      disabled={removingId === member.userId}
                      onClick={() => handleRemove(member)}
                      className="w-8 h-8 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all disabled:opacity-40"
                      title={`Remove ${member.user.name}`}
                    >
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
                          d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main WorkspacesSection ───────────────────────────────────────────────────

export const WorkspacesSection: React.FC<WorkspacesSectionProps> = ({
  tenant,
  currentUserId,
}) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Workspace | null>(null);
  const [form, setForm] = useState<WorkspaceFormState>({
    name: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState>(null);
  const [deleting, setDeleting] = useState(false);
  const [membersWorkspace, setMembersWorkspace] = useState<Workspace | null>(
    null
  );

  // Tenant editing
  const [editingTenant, setEditingTenant] = useState(false);
  const [tenantName, setTenantName] = useState(tenant.name);
  const [savingTenant, setSavingTenant] = useState(false);

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.api.listWorkspaces(tenant.id);
      if (r.success) setWorkspaces(r.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenant.id]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const openAdd = () => {
    setForm({ name: "", description: "" });
    setEditTarget(null);
    setModalMode("add");
  };

  const openEdit = (ws: Workspace) => {
    setForm({ name: ws.name, description: ws.description ?? "" });
    setEditTarget(ws);
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setEditTarget(null);
  };

  const handleSaveTenant = async () => {
    if (!tenantName.trim()) return;
    setSavingTenant(true);
    try {
      const r = await window.api.updateTenant(tenant.id, tenantName.trim());
      if (r.success) {
        toast.success("Organization name updated");
        setEditingTenant(false);
      } else {
        toast.error(r.error ?? "Failed to update organization");
      }
    } catch {
      toast.error("Failed to update organization");
    } finally {
      setSavingTenant(false);
    }
  };

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (modalMode === "add") {
        const r = await window.api.createWorkspace(
          tenant.id,
          form.name.trim(),
          form.description.trim() || undefined
        );
        if (r.success) {
          toast.success(`Workspace "${form.name}" created`);
          setWorkspaces((p) => [r.data, ...p]);
          closeModal();
        } else {
          toast.error(r.error ?? "Failed to create workspace");
        }
      } else if (modalMode === "edit" && editTarget) {
        const r = await window.api.updateWorkspace(
          editTarget.id,
          form.name.trim(),
          form.description.trim() || undefined
        );
        if (r.success) {
          toast.success("Workspace updated");
          setWorkspaces((p) =>
            p.map((w) => (w.id === editTarget.id ? r.data : w))
          );
          closeModal();
        } else {
          toast.error(r.error ?? "Failed to update workspace");
        }
      }
    } catch {
      toast.error("Failed to save workspace");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const r = await window.api.deleteWorkspace(confirmDelete.id);
      if (r.success) {
        toast.success(`Workspace "${confirmDelete.name}" deleted`);
        setWorkspaces((p) => p.filter((w) => w.id !== confirmDelete.id));
        setConfirmDelete(null);
      } else {
        toast.error(r.error ?? "Failed to delete workspace");
      }
    } catch {
      toast.error("Failed to delete workspace");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* ── Organization name ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-100">
              Organization
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Rename your organization (tenant)
            </p>
          </div>
          {!editingTenant && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTenantName(tenant.name);
                setEditingTenant(true);
              }}
              leftIcon={
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
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              }
            >
              Edit
            </Button>
          )}
        </div>

        {editingTenant ? (
          <div className="flex items-center gap-3">
            <input
              autoFocus
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="flex-1 h-10 px-4 bg-gray-800/80 border border-gray-600/50 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition-all"
              placeholder="Organization name"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={savingTenant || !tenantName.trim()}
              onClick={handleSaveTenant}
            >
              {savingTenant ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={savingTenant}
              onClick={() => setEditingTenant(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600/20 border border-blue-500/30 rounded-lg flex items-center justify-center">
              <svg
                className="w-4 h-4 text-blue-400"
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
            </div>
            <div>
              <p className="text-sm font-medium text-gray-100">{tenant.name}</p>
              <p className="text-xs text-gray-500 font-mono">{tenant.slug}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Workspaces list ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-100">
              Workspaces
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}{" "}
              in this organization
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={openAdd}
            leftIcon={
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
            }
          >
            Add Workspace
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-gray-800/40 border border-gray-700/30 rounded-2xl p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-40" />
                    <div className="h-3 bg-gray-700 rounded w-24" />
                  </div>
                  <div className="flex gap-2">
                    <div className="w-20 h-8 bg-gray-700 rounded-lg" />
                    <div className="w-20 h-8 bg-gray-700 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-2xl p-10 text-center">
            <div className="w-14 h-14 bg-gray-700/50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-gray-500"
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
            <p className="text-gray-400 font-medium mb-1">No workspaces yet</p>
            <p className="text-sm text-gray-500">
              Create a workspace to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className="bg-gradient-to-br from-gray-800/40 to-gray-900/40 border border-gray-700/50 rounded-2xl p-5 hover:border-gray-600/50 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-indigo-600/20 border border-indigo-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-indigo-400"
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
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-100 truncate">
                        {ws.name}
                      </p>
                      {ws.description && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {ws.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-600 font-mono mt-1">
                        {ws.slug} · Created {formatDate(ws.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMembersWorkspace(ws)}
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
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      }
                    >
                      Members
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(ws)}
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
                    <button
                      onClick={() =>
                        setConfirmDelete({ id: ws.id, name: ws.name })
                      }
                      className="w-8 h-8 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all"
                      title="Delete workspace"
                    >
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add / Edit Workspace Modal ────────────────────────────────────── */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-100 mb-4">
              {modalMode === "add" ? "Create Workspace" : "Edit Workspace"}
            </h3>
            <form onSubmit={handleSaveWorkspace} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Name *
                </label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full h-10 px-4 bg-gray-800/80 border border-gray-600/50 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition-all"
                  placeholder="e.g. Mobile Team"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 bg-gray-800/80 border border-gray-600/50 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition-all resize-none"
                  placeholder="Optional description"
                />
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={saving || !form.name.trim()}
                >
                  {saving
                    ? "Saving…"
                    : modalMode === "add"
                      ? "Create"
                      : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-100">
                  Delete workspace?
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  <span className="text-gray-200 font-medium">
                    {confirmDelete.name}
                  </span>{" "}
                  and all its data will be permanently removed.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Members panel modal ───────────────────────────────────────────── */}
      {membersWorkspace && (
        <WorkspaceMembersPanel
          workspace={membersWorkspace}
          currentUserId={currentUserId}
          onClose={() => setMembersWorkspace(null)}
        />
      )}
    </div>
  );
};

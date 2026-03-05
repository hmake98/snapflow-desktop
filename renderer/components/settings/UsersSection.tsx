import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "../ui/Button";
import type { WorkspaceMemberWithUser, UserRole, Workspace } from "../../types";

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  pm: "Project Manager",
  qa: "QA",
  dev: "Developer",
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

const ALL_ROLES: UserRole[] = ["owner", "admin", "pm", "dev", "qa", "client"];
// Workspace-assignable roles (exclude "owner" which is tenant-level)
const WORKSPACE_ROLES: UserRole[] = ["admin", "pm", "dev", "qa", "client"];

interface InviteFormState {
  email: string;
  role: Exclude<UserRole, "owner">;
}

type ConfirmRemoveState = {
  memberId: string;
  userId: string;
  userName: string;
} | null;

interface UsersSectionProps {
  workspace: Workspace;
  currentUserId: string;
  currentUserRole: UserRole;
  isTenantOwner?: boolean;
}

export const UsersSection: React.FC<UsersSectionProps> = ({
  workspace,
  currentUserId,
  currentUserRole,
  isTenantOwner = false,
}) => {
  const [members, setMembers] = useState<WorkspaceMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>({
    email: "",
    role: "dev" as Exclude<UserRole, "owner">,
  });
  const [inviting, setInviting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ConfirmRemoveState>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");

  const isAdmin = currentUserRole === "admin" || isTenantOwner;

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.api.listWorkspaceMembersWithUsers(
        workspace.id
      );
      if (result.success && result.data) {
        setMembers(result.data);
      } else {
        toast.error(result.error ?? "Failed to load members");
      }
    } catch (error) {
      console.error("Failed to load members:", error);
      toast.error("Failed to load workspace members");
    } finally {
      setLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email.trim()) return;

    setInviting(true);
    try {
      const result = await window.api.inviteTeamMember(
        workspace.id,
        inviteForm.email.trim(),
        inviteForm.role
      );

      if (result.success) {
        toast.success(
          `Invite sent to ${inviteForm.email} — they'll receive an email to join.`
        );
        setInviteForm({ email: "", role: "dev" });
        setShowInviteForm(false);
      } else {
        toast.error(result.error ?? "Failed to send invite");
      }
    } catch (error) {
      console.error("Invite error:", error);
      toast.error("Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!confirmRemove) return;

    setRemovingId(confirmRemove.userId);
    try {
      const result = await window.api.removeWorkspaceMember(
        workspace.id,
        confirmRemove.userId
      );

      if (result.success) {
        toast.success(`${confirmRemove.userName} has been removed`);
        setMembers((prev) =>
          prev.filter((m) => m.userId !== confirmRemove.userId)
        );
      } else {
        toast.error(result.error ?? "Failed to remove member");
      }
    } catch (error) {
      console.error("Remove error:", error);
      toast.error("Failed to remove member");
    } finally {
      setRemovingId(null);
      setConfirmRemove(null);
    }
  };

  const handleRoleChange = async (
    member: WorkspaceMemberWithUser,
    newRole: Exclude<UserRole, "owner">
  ) => {
    if (member.role === newRole) return;

    setUpdatingRoleId(member.userId);
    try {
      const result = await window.api.updateMemberRole(
        workspace.id,
        member.userId,
        newRole
      );

      if (result.success) {
        toast.success(
          `${member.user.name}'s role updated to ${ROLE_LABELS[newRole]}`
        );
        setMembers((prev) =>
          prev.map((m) =>
            m.userId === member.userId ? { ...m, role: newRole } : m
          )
        );
      } else {
        toast.error(result.error ?? "Failed to update role");
      }
    } catch (error) {
      console.error("Role update error:", error);
      toast.error("Failed to update role");
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Filter members by search query and role
  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || member.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // ─── Non-admin view ─────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-2xl p-8 max-w-4xl">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-700/50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-300 mb-2">
            Admin Access Required
          </h3>
          <p className="text-sm text-gray-500">
            Only workspace admins can view and manage team members.
          </p>
        </div>
      </div>
    );
  }

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 max-w-4xl">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-xl p-4 animate-pulse"
          >
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gray-700 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-700 rounded w-1/4" />
                <div className="h-3 bg-gray-700 rounded w-1/3" />
              </div>
              <div className="w-24 h-6 bg-gray-700 rounded-full" />
              <div className="w-28 h-3 bg-gray-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Main admin view ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-6">
      {/* Header row */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">
              {filteredMembers.length === members.length
                ? `${members.length} member${members.length !== 1 ? "s" : ""}`
                : `${filteredMembers.length} of ${members.length} member${members.length !== 1 ? "s" : ""}`}{" "}
              in{" "}
              <span className="text-gray-200 font-medium">
                {workspace.name}
              </span>
            </p>
          </div>
          <Button
            onClick={() => setShowInviteForm(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm"
            disabled={showInviteForm}
          >
            + Invite Member
          </Button>
        </div>

        {/* Search and filter row */}
        {members.length > 0 && (
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <select
              value={roleFilter}
              onChange={(e) =>
                setRoleFilter(e.target.value as UserRole | "all")
              }
              className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Roles</option>
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Invite form */}
        {showInviteForm && (
          <form
            onSubmit={handleInvite}
            className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg"
          >
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="team@example.com"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  disabled={inviting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm({
                      ...inviteForm,
                      role: e.target.value as Exclude<UserRole, "owner">,
                    })
                  }
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                  disabled={inviting}
                >
                  {WORKSPACE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!inviteForm.email.trim() || inviting}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {inviting ? "Sending..." : "Send Invite"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteForm({ email: "", role: "dev" });
                  }}
                  disabled={inviting}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-100 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Members list */}
      {filteredMembers.length === 0 ? (
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
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <p className="text-gray-400 font-medium mb-1">
            {members.length === 0
              ? "No members yet"
              : "No members match your search"}
          </p>
          <p className="text-sm text-gray-500">
            {members.length === 0
              ? "Invite your team to get started."
              : "Try adjusting your search or filters."}
          </p>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_144px_112px_32px] gap-4 px-5 py-3 border-b border-gray-700/50 bg-gray-800/30">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Member
            </span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider text-center">
              Role
            </span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider text-right">
              Joined
            </span>
            <span />
          </div>

          {/* Member rows */}
          <div className="divide-y divide-gray-700/30">
            {filteredMembers.map((member) => {
              const isSelf = member.userId === currentUserId;
              const isUpdatingRole = updatingRoleId === member.userId;
              const isRemoving = removingId === member.userId;

              return (
                <div
                  key={member.id}
                  className="grid grid-cols-[1fr_144px_112px_32px] gap-4 px-5 py-4 items-center hover:bg-gray-800/30 transition-colors"
                >
                  {/* User info */}
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 shadow-md">
                      {getInitials(member.user.name || member.user.email)}
                    </div>
                    <div className="min-w-0">
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
                  </div>

                  {/* Role selector */}
                  <div className="flex justify-center">
                    {isAdmin && !isSelf ? (
                      <div className="relative">
                        <select
                          value={member.role}
                          disabled={isUpdatingRole}
                          onChange={(e) =>
                            handleRoleChange(
                              member,
                              e.target.value as Exclude<UserRole, "owner">
                            )
                          }
                          className={`w-full h-8 pl-3 pr-7 text-xs font-medium rounded-full border appearance-none cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed ${ROLE_COLORS[member.role]} bg-transparent`}
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
                          {isUpdatingRole ? (
                            <svg
                              className="w-3 h-3 animate-spin text-current"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-3 h-3 text-current opacity-60"
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
                          )}
                        </div>
                      </div>
                    ) : (
                      <span
                        className={`inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-full border ${ROLE_COLORS[member.role]}`}
                      >
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                  </div>

                  {/* Joined date */}
                  <div className="text-right">
                    <span className="text-xs text-gray-500">
                      {formatDate(member.joinedAt)}
                    </span>
                  </div>

                  {/* Remove button */}
                  <div className="w-8 flex justify-center">
                    {isAdmin && !isSelf && (
                      <button
                        disabled={isRemoving}
                        onClick={() =>
                          setConfirmRemove({
                            memberId: member.id,
                            userId: member.userId,
                            userName: member.user.name || member.user.email,
                          })
                        }
                        className="w-7 h-7 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all disabled:opacity-50"
                        title={`Remove ${member.user.name}`}
                      >
                        {isRemoving ? (
                          <svg
                            className="w-4 h-4 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                        ) : (
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
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Remove confirmation dialog */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center space-x-3 mb-4">
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
                  Remove member?
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  This will remove{" "}
                  <span className="text-gray-200 font-medium">
                    {confirmRemove.userName}
                  </span>{" "}
                  from the workspace.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRemove(null)}
                disabled={!!removingId}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleRemoveMember}
                disabled={!!removingId}
              >
                {removingId ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

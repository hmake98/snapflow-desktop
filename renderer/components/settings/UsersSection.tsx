import React, { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";
import type { WorkspaceMemberWithUser, UserRole, Workspace } from "../../types";

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const ROLE_COLORS: Record<UserRole, string> = {
  owner: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  admin: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  member: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const ROLE_DESCRIPTIONS: Partial<Record<UserRole, string>> = {
  admin: "Manage workspace, invite & remove members",
  member: "Create & view snaps, run captures",
};

const ALL_ROLES: UserRole[] = ["owner", "admin", "member"];
const WORKSPACE_ROLES: UserRole[] = ["admin", "member"];

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
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>({
    email: "",
    role: "member" as Exclude<UserRole, "owner">,
  });
  const [inviting, setInviting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ConfirmRemoveState>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");

  const isAdmin =
    currentUserRole === "owner" ||
    currentUserRole === "admin" ||
    isTenantOwner;

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.api.listWorkspaceMembersWithUsers(
        workspace.id
      );
      if (result.success && result.data) {
        setMembers(result.data);
      } else {
        window.api.showNotification(
          "Error",
          result.error ?? "Failed to load members"
        );
      }
    } catch {
      window.api.showNotification("Error", "Failed to load workspace members");
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
        window.api.showNotification(
          "Invite Sent",
          `Invite sent to ${inviteForm.email}`
        );
        setInviteForm({ email: "", role: "member" });
        setShowInviteModal(false);
      } else {
        window.api.showNotification(
          "Error",
          result.error ?? "Failed to send invite"
        );
      }
    } catch {
      window.api.showNotification("Error", "Failed to send invite");
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
        window.api.showNotification(
          "Member Removed",
          `${confirmRemove.userName} has been removed`
        );
        setMembers((prev) =>
          prev.filter((m) => m.userId !== confirmRemove.userId)
        );
      } else {
        window.api.showNotification(
          "Error",
          result.error ?? "Failed to remove member"
        );
      }
    } catch {
      window.api.showNotification("Error", "Failed to remove member");
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
        window.api.showNotification(
          "Role Updated",
          `${member.user.name}'s role updated to ${ROLE_LABELS[newRole]}`
        );
        setMembers((prev) =>
          prev.map((m) =>
            m.userId === member.userId ? { ...m, role: newRole } : m
          )
        );
      } else {
        window.api.showNotification(
          "Error",
          result.error ?? "Failed to update role"
        );
      }
    } catch {
      window.api.showNotification("Error", "Failed to update role");
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

  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || member.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (!isAdmin) {
    return (
      <div className="max-w-3xl">
        <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-8 text-center">
          <div className="w-10 h-10 bg-gray-700/40 rounded-lg flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-5 h-5 text-gray-500"
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
          <p className="text-sm font-medium text-gray-400">
            Admin access required
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Only workspace admins can manage team members.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-3">
      {/* ── Members card ───────────────────────────────────────────────── */}
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/40">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Team Members
            </span>
            <span className="text-2xs text-gray-600 normal-case font-normal">
              {members.length} in {workspace.name}
            </span>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 transition-colors"
          >
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            Invite Member
          </button>
        </div>

        {/* Search + filter */}
        {!loading && members.length > 1 && (
          <div className="flex gap-2 px-4 py-2.5 border-b border-gray-700/30 bg-gray-900/20">
            <div className="relative flex-1">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search members…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 h-7 bg-gray-900/60 border border-gray-700/50 rounded-md text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500/60 transition-colors"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | "all")}
              className="h-7 px-2 bg-gray-900/60 border border-gray-700/50 rounded-md text-xs text-gray-400 focus:outline-none focus:border-gray-500/60 transition-colors"
            >
              <option value="all">All roles</option>
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse flex items-center gap-3 p-2.5 rounded-lg bg-gray-900/30"
              >
                <div className="w-8 h-8 bg-gray-700 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-700 rounded w-1/4" />
                  <div className="h-2.5 bg-gray-700 rounded w-1/3" />
                </div>
                <div className="w-20 h-6 bg-gray-700 rounded-full" />
              </div>
            ))}
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-10 h-10 bg-gray-700/40 rounded-lg flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-5 h-5 text-gray-500"
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
            <p className="text-sm font-medium text-gray-400">
              {members.length === 0
                ? "No members yet"
                : "No members match your filters"}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {members.length === 0
                ? "Invite your team to get started."
                : "Try adjusting your search."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/30">
            {filteredMembers.map((member) => {
              const isSelf = member.userId === currentUserId;
              const isUpdatingRole = updatingRoleId === member.userId;
              const isRemoving = removingId === member.userId;

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-900/30 transition-colors"
                >
                  {/* Avatar + identity */}
                  <Avatar
                    src={member.user.avatarUrl}
                    name={member.user.name}
                    email={member.user.email}
                    size={32}
                    className="ring-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-100 truncate">
                        {member.user.name || "Unknown"}
                      </p>
                      {isSelf && (
                        <span className="text-2xs px-1.5 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/25 rounded-full flex-shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {member.user.email}
                    </p>
                  </div>

                  {/* Joined date */}
                  <span className="hidden sm:inline text-2xs text-gray-600 flex-shrink-0">
                    {formatDate(member.joinedAt)}
                  </span>

                  {/* Role */}
                  <div className="flex-shrink-0">
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
                          className={`h-7 pl-2.5 pr-6 text-2xs font-medium rounded-full border appearance-none cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed ${ROLE_COLORS[member.role]} bg-transparent`}
                        >
                          {WORKSPACE_ROLES.map((r) => (
                            <option
                              key={r}
                              value={r}
                              className="bg-gray-900 text-gray-100"
                            >
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                          {isUpdatingRole ? (
                            <svg
                              className="w-2.5 h-2.5 animate-spin text-current"
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
                              className="w-2.5 h-2.5 opacity-60"
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
                        className={`inline-flex items-center h-7 px-2.5 text-2xs font-medium rounded-full border ${ROLE_COLORS[member.role]}`}
                      >
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                  </div>

                  {/* Remove */}
                  <div className="flex-shrink-0 w-7">
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
                        className="w-7 h-7 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all disabled:opacity-40"
                        title={`Remove ${member.user.name}`}
                      >
                        {isRemoving ? (
                          <svg
                            className="w-3.5 h-3.5 animate-spin"
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
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Invite Modal ── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/50 rounded-xl w-full max-w-md mx-4 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/40">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  Invite Member
                </span>
                <span className="text-2xs text-gray-600 normal-case font-normal">
                  to {workspace.name}
                </span>
              </div>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteForm({ email: "", role: "member" });
                }}
                className="w-7 h-7 rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800 flex items-center justify-center transition-all"
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

            <form onSubmit={handleInvite} className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteForm.email}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, email: e.target.value })
                    }
                    className="w-full pl-9 pr-3 h-9 bg-gray-900/60 border border-gray-600/50 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/60 transition-all"
                    disabled={inviting}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {WORKSPACE_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() =>
                        setInviteForm({
                          ...inviteForm,
                          role: role as Exclude<UserRole, "owner">,
                        })
                      }
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                        inviteForm.role === role
                          ? "border-blue-500/50 bg-blue-500/10"
                          : "border-gray-700/50 bg-gray-900/40 hover:border-gray-600/60 hover:bg-gray-800/40"
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${inviteForm.role === role ? "bg-blue-400" : "bg-gray-600"}`}
                      />
                      <div className="min-w-0">
                        <span
                          className={`text-xs font-medium block ${inviteForm.role === role ? "text-blue-300" : "text-gray-300"}`}
                        >
                          {ROLE_LABELS[role]}
                        </span>
                        <span className="text-2xs text-gray-600 block truncate">
                          {ROLE_DESCRIPTIONS[role]}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteForm({ email: "", role: "member" });
                  }}
                  disabled={inviting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!inviteForm.email.trim() || inviting}
                >
                  {inviting ? "Sending…" : "Send Invite"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Remove confirm ── */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/50 rounded-xl w-full max-w-sm mx-4 shadow-2xl overflow-hidden">
            <div className="flex items-center px-4 py-2.5 border-b border-gray-700/40">
              <span className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Remove Member
              </span>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 bg-red-500/15 border border-red-500/25 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-4 h-4 text-red-400"
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
                <p className="text-sm text-gray-300 leading-relaxed">
                  <span className="font-medium text-gray-100">
                    {confirmRemove.userName}
                  </span>{" "}
                  will lose access to this workspace.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
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
        </div>
      )}
    </div>
  );
};

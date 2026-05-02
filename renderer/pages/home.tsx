import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Head from "next/head";
import { useRouter } from "next/router";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { ChipsInput } from "../components/ui/ChipsInput";
import { SearchInput } from "../components/ui/SearchInput";
import { FilterBar, SortControl } from "../components/ui/FilterBar";
import { Skeleton } from "../components/ui/Skeleton";
import {
  NoSnapsEmptyState,
  NoResultsEmptyState,
} from "../components/ui/EmptyState";
import { Pagination } from "../components/ui/Pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogVisuallyHidden,
} from "../components/ui/Dialog";
import { WorkspaceSwitcher } from "../components/ui/WorkspaceSwitcher";
import { useStore } from "../store/useStore";
import { LocalImage } from "../components/ui/LocalImage";
import { ProfileDropdown } from "../components/ui/ProfileDropdown";
import { OfflineBanner } from "../components/ui/OfflineBanner";
import { useSyncQueue } from "../hooks/useSyncQueue";
import type { Issue } from "../types";

// ─── Profile Dropdown ─────────────────────────────────────────────────────────

// ─── Home Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const {
    user,
    setUser,
    issues,
    setIssues,
    deleteIssue,
    updateIssue,
    activeWorkspace,
    setActiveWorkspace,
    resetStore,
  } = useStore();

  const syncQueue = useSyncQueue(() => loadData());

  const [loading, setLoading] = useState(true);
  // Subtle background-refresh indicator — shown when stale data is already
  // visible and we're silently fetching fresh data behind the scenes.
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Connectors loaded once at page level; passed as a prop to sync dropdowns
  // so that 12 cards don't each make their own IPC call on mount.
  const [connectors, setConnectors] = useState<any[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "screenshot" | "session">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "github" | "zoho"
  >("all");
  const [sortBy, setSortBy] = useState<"date" | "name">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [issueToDelete, setIssueToDelete] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewIssue, setPreviewIssue] = useState<Issue | null>(null);
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  const [isPastingBug, setIsPastingBug] = useState(false);
  const [activeCarouselIdx, setActiveCarouselIdx] = useState(0);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [generateDescriptionError, setGenerateDescriptionError] = useState<
    string | null
  >(null);

  /**
   * Monotonically-incrementing fetch token.
   * Every call to loadSnapsForWorkspace claims a new token; when the async
   * result arrives it checks the token is still current before writing to
   * state. This means rapid workspace switches can never produce a
   * "stale response wins" race condition.
   */
  const fetchIdRef = useRef(0);

  useEffect(() => {
    loadData();
  }, []);

  // Single source of truth for snaps: whenever the active workspace changes,
  // immediately wipe stale data and fetch fresh snaps for the new workspace.
  useEffect(() => {
    if (activeWorkspace?.id) {
      loadSnapsForWorkspace(activeWorkspace.id);
    }
  }, [activeWorkspace?.id]);

  const loadSnapsForWorkspace = async (wsId?: string) => {
    // Claim this fetch slot — any in-flight fetch with an older token is stale.
    const myToken = ++fetchIdRef.current;

    // ── Clear immediately so the UI never shows another workspace's snaps ──
    setIssues([]);
    setConnectors([]);
    setPreviewDialogOpen(false);
    setPreviewIssue(null);
    setLoading(true);

    if (!wsId) {
      setLoading(false);
      return;
    }

    try {
      // Use the user already in the store — avoids an extra IPC round-trip.
      const userId = user?.id;
      if (!userId) {
        const userResult = await window.api.getUser();
        if (!userResult.success || !userResult.data) {
          setLoading(false);
          return;
        }
      }

      const effectiveUserId = user?.id ?? (await window.api.getUser()).data?.id;
      if (!effectiveUserId) {
        setLoading(false);
        return;
      }

      const [issuesResult, connectorsResult] = await Promise.all([
        window.api.listIssues(effectiveUserId, wsId),
        window.api.listConnectors(wsId),
      ]);

      // Discard if a newer fetch has already started (workspace switched again)
      if (myToken !== fetchIdRef.current) return;

      if (issuesResult.success) {
        setIssues(issuesResult.data || []);
      }
      if (connectorsResult.success) {
        setConnectors(connectorsResult.data || []);
      }
    } catch (error) {
      console.error("[Home] Failed to load snaps for workspace:", error);
    } finally {
      if (myToken === fetchIdRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  // Listen for auto-sync completion and refresh issues for the current workspace
  useEffect(() => {
    const unsubscribe = window.api.onAutoSyncCompleted(async () => {
      // activeWorkspace?.id is captured in closure — always the current value
      if (activeWorkspace?.id) {
        await loadSnapsForWorkspace(activeWorkspace.id);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [activeWorkspace?.id]);

  const loadData = async () => {
    // loadData's job is auth/onboarding checks + workspace bootstrap.
    // Snap fetching is delegated entirely to loadSnapsForWorkspace, which is
    // triggered by the activeWorkspace?.id effect above. This prevents the
    // double-fetch that used to happen when _app.tsx pre-populated the store
    // before home.tsx mounted.
    try {
      const [userResult, onboardingResult, wsResult] = await Promise.all([
        window.api.getUser(),
        window.api.getOnboardingStatus(),
        window.api.getUserWorkspaces(),
      ]);

      if (!userResult.success || !userResult.data) {
        router.push("/auth");
        return;
      }

      setUser(userResult.data);

      if (!onboardingResult.success || !onboardingResult.data?.isComplete) {
        router.push("/onboarding");
        return;
      }

      // If _app.tsx already set the active workspace, honour it — don't
      // override with wsResult.data[0] which might be a different workspace.
      if (wsResult.success && wsResult.data?.length) {
        if (!activeWorkspace) {
          // First load — pick the first workspace and activate it.
          const first = wsResult.data[0];
          setActiveWorkspace(first);
          setWorkspaceId(first.id);
          window.api.setActiveWorkspace(first.id);
          // The effect on activeWorkspace?.id will fire and call loadSnapsForWorkspace.
        } else {
          // activeWorkspace is already set by _app.tsx; just sync the local workspaceId.
          setWorkspaceId(activeWorkspace.id);
          // loadSnapsForWorkspace was already triggered by the activeWorkspace?.id effect.
          // Nothing more to do here.
        }
      }
    } catch (error) {
      console.error("[Home] Failed to load data:", error);
      window.api.showNotification("SnapFlow", "Failed to load data");
      router.push("/auth");
    }
  };

  const handleSync = async (issue: Issue, connectorId: string) => {
    const shouldProceed = await syncQueue.syncIssue(issue.id, connectorId);
    if (!shouldProceed) return;
    try {
      updateIssue(issue.id, { syncStatus: "syncing" });
      const result = await window.api.syncIssue(issue.id, connectorId);
      if (result.success) {
        const message = result.data?.message || "Successfully synced to GitHub";
        window.api.showNotification("Synced to GitHub", message);
        // Lightweight refresh — no need to re-run auth/onboarding checks.
        loadSnapsForWorkspace(activeWorkspace?.id);
      } else {
        window.api.showNotification(
          "GitHub Sync Failed",
          result.error || "Sync failed"
        );
        updateIssue(issue.id, { syncStatus: "failed" });
      }
    } catch (err) {
      window.api.showNotification(
        "GitHub Sync Failed",
        err instanceof Error ? err.message : "An error occurred"
      );
      updateIssue(issue.id, { syncStatus: "failed" });
    }
  };


  const confirmDelete = (issueId: string) => {
    setIssueToDelete(issueId);
    setDeleteDialogOpen(true);
  };

  const openPreview = (issue: Issue) => {
    setPreviewIssue(issue);
    setPreviewDialogOpen(true);
    setIsEditingDescription(false);
    setEditedDescription("");
    setActiveCarouselIdx(0);
    setGenerateDescriptionError(null);
  };

  const handleDeleteIssue = async () => {
    if (!issueToDelete) return;

    try {
      const result = await window.api.deleteIssue(issueToDelete);
      if (result.success) {
        deleteIssue(issueToDelete);
        setDeleteDialogOpen(false);
        setIssueToDelete(null);
      } else {
        window.api.showNotification(
          "Delete Failed",
          result.error || "Could not delete item"
        );
      }
    } catch {
      window.api.showNotification(
        "Delete Failed",
        "An error occurred while deleting"
      );
    }
  };

  const handleUpdateTags = async (issueId: string, tags: string[]) => {
    try {
      const result = await window.api.updateIssue(issueId, { tags });
      if (result.success) {
        updateIssue(issueId, { tags });
        if (previewIssue && previewIssue.id === issueId) {
          setPreviewIssue({ ...previewIssue, tags });
        }
      } else {
        window.api.showNotification(
          "Update Failed",
          result.error || "Failed to update tags"
        );
      }
    } catch {
      window.api.showNotification(
        "Update Failed",
        "An error occurred while updating tags"
      );
    }
  };

  const handleUpdateDescription = async (
    issueId: string,
    description: string
  ) => {
    try {
      const result = await window.api.updateIssue(issueId, { description });
      if (result.success) {
        updateIssue(issueId, { description });
        if (previewIssue && previewIssue.id === issueId) {
          setPreviewIssue({ ...previewIssue, description });
        }
        setIsEditingDescription(false);
      } else {
        window.api.showNotification(
          "Update Failed",
          result.error || "Failed to update description"
        );
      }
    } catch {
      window.api.showNotification(
        "Update Failed",
        "An error occurred while updating description"
      );
    }
  };

  const startEditingDescription = () => {
    setEditedDescription(previewIssue?.description || "");
    setIsEditingDescription(true);
  };

  const cancelEditingDescription = () => {
    setIsEditingDescription(false);
    setEditedDescription("");
  };

  const handleUpdateTitle = async (issueId: string, title: string) => {
    if (!title.trim()) {
      window.api.showNotification("Validation Error", "Title cannot be empty");
      return;
    }

    try {
      const result = await window.api.updateIssue(issueId, { title });
      if (result.success) {
        updateIssue(issueId, { title });
        if (previewIssue && previewIssue.id === issueId) {
          setPreviewIssue({ ...previewIssue, title });
        }
        setIsEditingTitle(false);
      } else {
        window.api.showNotification(
          "Update Failed",
          result.error || "Failed to update title"
        );
      }
    } catch {
      window.api.showNotification(
        "Update Failed",
        "An error occurred while updating title"
      );
    }
  };

  const startEditingTitle = () => {
    setEditedTitle(previewIssue?.title || "");
    setIsEditingTitle(true);
  };

  const cancelEditingTitle = () => {
    setIsEditingTitle(false);
    setEditedTitle("");
  };

  const saveDescription = () => {
    if (previewIssue) {
      handleUpdateDescription(previewIssue.id, editedDescription);
    }
  };

  // Get all unique tags from issues
  const allTags = Array.from(
    new Set(issues.flatMap((issue) => issue.tags || []))
  ).sort();

  const filteredIssues = issues
    .filter((issue) => {
      const isSession = !!(issue as any).sessionData;
      const matchesFilter =
        filter === "all" ||
        (filter === "session" && isSession) ||
        (filter === "screenshot" && !isSession && issue.type === "screenshot");

      const hasGitHubSync = issue.syncedTo?.some(
        (s) => s.platform === "github"
      );
      const hasZohoSync = issue.syncedTo?.some((s) => s.platform === "zoho");

      const matchesStatusFilter =
        statusFilter === "all" ||
        (statusFilter === "github" && hasGitHubSync) ||
        (statusFilter === "zoho" && hasZohoSync);

      const matchesSearch =
        searchQuery === "" ||
        issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTagsFilter =
        tagsFilter.length === 0 ||
        (issue.tags && tagsFilter.some((tag) => issue.tags?.includes(tag)));
      return (
        matchesFilter &&
        matchesStatusFilter &&
        matchesSearch &&
        matchesTagsFilter
      );
    })
    .sort((a, b) => {
      if (sortBy === "date") {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      } else {
        // Sort by name
        const nameA = a.title.toLowerCase();
        const nameB = b.title.toLowerCase();
        if (sortOrder === "asc") {
          return nameA.localeCompare(nameB);
        } else {
          return nameB.localeCompare(nameA);
        }
      }
    });

  // Pagination calculations
  const totalPages = Math.ceil(filteredIssues.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedIssues = filteredIssues.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, statusFilter, searchQuery, tagsFilter, sortBy, sortOrder]);

  const _getGitHubSyncBadge = (issue: Issue) => {
    const githubSync = issue.syncedTo?.find(
      (sync) => sync.platform === "github"
    );

    if (githubSync) {
      return <Badge variant="success">🐙 GitHub</Badge>;
    }

    return null;
  };

  const _getZohoSyncBadge = (issue: Issue) => {
    const zohoSync = issue.syncedTo?.find((sync) => sync.platform === "zoho");

    if (zohoSync) {
      return <Badge variant="info">📊 Zoho</Badge>;
    }

    return null;
  };

  // GitHub Sync Modal Dialog Component
  const GitHubSyncDropdown = ({
    issue,
    connectors: allConnectors,
    className = "",
  }: {
    issue: Issue;
    connectors: any[];
    className?: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const connectors = allConnectors.filter(
      (c: any) => c.type === "github" && c.enabled
    );

    // Get the connector this issue is currently synced to
    const syncedConnector = issue.syncedTo?.find(
      (sync) => sync.platform === "github"
    );
    const syncedConnectorId = syncedConnector?.connectorId;

    const handleSelectRepository = (connectorId: string) => {
      handleSync(issue, connectorId);
      setIsOpen(false);
    };

    if (connectors.length === 0) {
      return (
        <Button
          variant="ghost"
          size="sm"
          disabled
          className={className}
          title="No GitHub repositories configured. Go to Settings to add one."
        >
          <svg
            className="w-4 h-4 opacity-50"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        </Button>
      );
    }

    if (connectors.length === 1) {
      const connector = connectors[0];
      const isAlreadySynced = syncedConnectorId === connector.id;

      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleSync(issue, connector.id)}
          disabled={issue.syncStatus === "syncing" || isAlreadySynced}
          isLoading={issue.syncStatus === "syncing"}
          className={className}
          title={
            isAlreadySynced
              ? `Already synced to ${connector.name}`
              : `Sync to ${connector.name}`
          }
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          {isAlreadySynced && (
            <svg
              className="w-3 h-3 text-green-400 ml-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </Button>
      );
    }

    // Centered Modal Dialog for Multiple Connectors
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          disabled={issue.syncStatus === "syncing"}
          isLoading={issue.syncStatus === "syncing"}
          className={className}
          title="Sync to GitHub repository"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        </Button>

        {/* Centered Modal Dialog */}
        {typeof window !== "undefined" &&
          createPortal(
            <AnimatePresence mode="wait">
              {isOpen && (
                <>
                  {/* Backdrop */}
                  <motion.div
                    key="backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                    }}
                  />

                  {/* Modal */}
                  <div
                    key="modal-container"
                    className="fixed inset-0 flex items-center justify-center z-[9999] p-4 pointer-events-none"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="bg-gray-900/98 backdrop-blur-xl border border-gray-700/70 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
                            <svg
                              className="w-5 h-5 text-blue-400"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-100">
                              Select Repository
                            </h3>
                            <p className="text-xs text-gray-400">
                              Choose where to sync this issue
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setIsOpen(false)}
                          className="w-8 h-8 rounded-lg hover:bg-gray-800/70 transition-colors flex items-center justify-center text-gray-400 hover:text-gray-200"
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Repository List */}
                      <div className="flex-1 overflow-y-auto p-4">
                        <div className="space-y-2">
                          {connectors.map((connector, index) => {
                            const isAlreadySynced =
                              syncedConnectorId === connector.id;
                            return (
                              <motion.button
                                key={connector.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isAlreadySynced) {
                                    handleSelectRepository(connector.id);
                                  }
                                }}
                                disabled={isAlreadySynced}
                                className={`w-full p-4 rounded-xl border transition-all duration-200 flex items-start gap-3 group ${
                                  isAlreadySynced
                                    ? "bg-green-500/10 border-green-500/30 cursor-not-allowed"
                                    : "bg-gray-800/30 border-gray-700/50 hover:bg-gray-800/60 hover:border-gray-600/50 active:scale-[0.98] cursor-pointer"
                                }`}
                              >
                                <div
                                  className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                    isAlreadySynced
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-gray-700/50 text-gray-400 group-hover:bg-gray-700/80 group-hover:text-gray-300"
                                  }`}
                                >
                                  {isAlreadySynced ? (
                                    <svg
                                      className="w-6 h-6"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      className="w-6 h-6"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p
                                      className={`text-base font-semibold truncate ${
                                        isAlreadySynced
                                          ? "text-green-300"
                                          : "text-gray-100 group-hover:text-white"
                                      }`}
                                    >
                                      {connector.name}
                                    </p>
                                    {isAlreadySynced && (
                                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-md uppercase tracking-wide flex-shrink-0">
                                        Synced
                                      </span>
                                    )}
                                  </div>
                                  <p
                                    className={`text-sm font-mono truncate ${
                                      isAlreadySynced
                                        ? "text-green-400/70"
                                        : "text-gray-500 group-hover:text-gray-400"
                                    }`}
                                  >
                                    {connector.config.owner}/
                                    {connector.config.repo}
                                  </p>
                                </div>
                                {!isAlreadySynced && (
                                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg
                                      className="w-5 h-5 text-gray-400"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 5l7 7-7 7"
                                      />
                                    </svg>
                                  </div>
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="px-6 py-4 border-t border-gray-800/50 bg-gray-900/50 flex-shrink-0">
                        <button
                          onClick={() => {
                            setIsOpen(false);
                            router.push("/settings?tab=connectors");
                          }}
                          className="w-full text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center justify-center gap-2 py-2 rounded-lg hover:bg-blue-500/10"
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
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          Manage Repositories
                        </button>
                      </div>
                    </motion.div>
                  </div>
                </>
              )}
            </AnimatePresence>,
            document.body
          )}
      </>
    );
  };

  const ZohoSyncDropdown = ({
    issue,
    connectors: allConnectors,
    className = "",
  }: {
    issue: Issue;
    connectors: any[];
    className?: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const connectors = allConnectors.filter(
      (c: any) => c.type === "zoho" && c.enabled
    );

    // Get the connector this issue is currently synced to
    const syncedConnector = issue.syncedTo?.find(
      (sync) => sync.platform === "zoho"
    );
    const syncedConnectorId = syncedConnector?.connectorId;

    const handleSelectConnector = (connectorId: string) => {
      handleZohoSync(issue, connectorId);
      setIsOpen(false);
    };

    if (connectors.length === 0) {
      return (
        <Button
          variant="ghost"
          size="sm"
          disabled
          className={className}
          title="No Zoho projects configured. Go to Settings to add one."
        >
          <svg
            className="w-4 h-4 text-orange-500 opacity-50"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <text x="2" y="18" fontSize="20" fontWeight="bold">
              Z
            </text>
          </svg>
        </Button>
      );
    }

    if (connectors.length === 1) {
      const connector = connectors[0];
      const isAlreadySynced = syncedConnectorId === connector.id;

      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleSelectConnector(connector.id)}
          disabled={issue.syncStatus === "syncing" || isAlreadySynced}
          isLoading={issue.syncStatus === "syncing"}
          className={className}
          title={
            isAlreadySynced
              ? `Already synced to ${connector.config?.projectName || connector.name}`
              : `Sync to ${connector.config?.projectName || connector.name}`
          }
        >
          <svg
            className="w-4 h-4 text-orange-500"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <text x="2" y="18" fontSize="20" fontWeight="bold">
              Z
            </text>
          </svg>
          {isAlreadySynced && (
            <svg
              className="w-3 h-3 text-green-400 ml-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </Button>
      );
    }

    // Modal for Multiple Connectors
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          disabled={issue.syncStatus === "syncing"}
          isLoading={issue.syncStatus === "syncing"}
          className={className}
          title="Sync to Zoho project"
        >
          <svg
            className="w-4 h-4 text-orange-500"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <text x="2" y="18" fontSize="20" fontWeight="bold">
              Z
            </text>
          </svg>
        </Button>

        {/* Modal Dialog */}
        {typeof window !== "undefined" &&
          createPortal(
            <AnimatePresence mode="wait">
              {isOpen && (
                <>
                  <motion.div
                    key="backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                    }}
                    className="fixed inset-0 bg-black/50 z-40"
                  />
                  <div className="fixed inset-0 flex items-center justify-center z-50">
                    <motion.div
                      key="modal"
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm mx-4"
                    >
                      <h3 className="text-lg font-semibold text-gray-100 mb-4">
                        Select Zoho Project
                      </h3>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {connectors.map((connector) => {
                          const isAlreadySynced =
                            syncedConnectorId === connector.id;
                          return (
                            <button
                              key={connector.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectConnector(connector.id);
                              }}
                              disabled={isAlreadySynced}
                              className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                                isAlreadySynced
                                  ? "bg-green-500/20 text-green-400 cursor-default border border-green-500/30"
                                  : "bg-gray-800/50 hover:bg-gray-800 text-gray-100 border border-gray-700"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium">
                                    {connector.config?.projectName ||
                                      connector.name}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {connector.config?.portalName || "Portal"}
                                  </div>
                                </div>
                                {isAlreadySynced && (
                                  <svg
                                    className="w-4 h-4 text-green-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  </div>
                </>
              )}
            </AnimatePresence>,
            document.body
          )}
      </>
    );
  };

  const handleZohoSync = async (issue: Issue, connectorId: string) => {
    const shouldProceed = await syncQueue.syncIssueToZoho(
      issue.id,
      connectorId
    );
    if (!shouldProceed) return;
    updateIssue(issue.id, { syncStatus: "syncing" });
    try {
      const result = await window.api.syncIssueToZoho(issue.id, connectorId);
      if (result.success) {
        window.api.showNotification(
          "Synced to Zoho",
          "Issue successfully synced to Zoho Projects"
        );
        // Lightweight refresh — skip auth/onboarding.
        loadSnapsForWorkspace(activeWorkspace?.id);
      } else {
        window.api.showNotification(
          "Zoho Sync Failed",
          result.error || "Sync failed"
        );
        updateIssue(issue.id, { syncStatus: "failed" });
      }
    } catch (error) {
      window.api.showNotification(
        "Zoho Sync Failed",
        error instanceof Error ? error.message : "Sync failed"
      );
      updateIssue(issue.id, { syncStatus: "failed" });
    }
  };

  const handleLogout = async () => {
    // Wipe ALL store state atomically so the next user starts clean.
    // Do this before calling logout() to prevent any brief render with stale data.
    resetStore();
    try {
      await window.api.logout();
      window.api.showNotification(
        "Signed Out",
        "You have been logged out of SnapFlow"
      );
    } catch (error) {
      console.error("[Logout] error:", error);
      window.api.showNotification("Signed Out", "Session ended");
    } finally {
      router.push("/auth");
    }
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Home - SnapFlow</title>
        </Head>
        <div className="min-h-screen bg-gray-950 pt-8">
          <header className="bg-gray-950 border-b border-gray-800/40 sticky top-8 z-20 flex items-center justify-between h-11 px-4">
            <Skeleton className="h-7 w-40 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </header>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8 space-y-4">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-24 rounded-full" />
                  ))}
                </div>
                <div className="flex gap-3 w-full lg:w-auto">
                  <Skeleton className="h-9 w-64 rounded-lg" />
                  <Skeleton className="h-9 w-28 rounded-lg" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="bg-gray-800/30 border border-gray-700/50 rounded-xl overflow-hidden"
                >
                  <Skeleton className="h-40 w-full rounded-none" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Home - SnapFlow</title>
      </Head>
      <div className="min-h-screen bg-gray-950 pt-8">
        {/* App header — sits below the global traffic light bar (pt-8) */}
        <header className="bg-gray-950 border-b border-gray-800/40 sticky top-8 z-20 flex items-center justify-between h-11 px-4">
          {/* Left: workspace switcher + silent refresh indicator */}
          <div className="flex items-center gap-2 min-w-0">
            <WorkspaceSwitcher />
            {isRefreshing && (
              <div
                className="w-3.5 h-3.5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin flex-shrink-0"
                title="Refreshing…"
              />
            )}
          </div>

          {/* Right: profile */}
          <ProfileDropdown
            user={user}
            onSettings={() => router.push("/settings")}
            onLogout={handleLogout}
          />
        </header>

        {/* Offline / queued sync indicator */}
        <OfflineBanner />

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Enhanced Filters and Search */}
          <motion.div
            className="mb-8 space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            {/* Search and Type Filters */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <FilterBar
                options={[
                  {
                    id: "all",
                    label: "All",
                    count: issues.length,
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
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                    ),
                  },
                  {
                    id: "screenshot",
                    label: "Screenshots",
                    count: issues.filter(
                      (i) => !(i as any).sessionData && i.type === "screenshot"
                    ).length,
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
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    ),
                  },
                  {
                    id: "session",
                    label: "Sessions",
                    count: issues.filter((i) => !!(i as any).sessionData)
                      .length,
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
                          d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                        />
                      </svg>
                    ),
                  },
                ]}
                activeFilter={filter}
                onFilterChange={(filterId) => setFilter(filterId as any)}
                variant="pills"
                className="flex-shrink-0"
              />

              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search your snaps..."
                className="w-full lg:w-80"
                variant="glass"
                suggestions={issues.map((issue) => issue.title).slice(0, 5)}
              />
            </div>

            {/* Status Filter and Sorting */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400 font-medium whitespace-nowrap">
                  Status:
                </span>
                <FilterBar
                  options={[
                    { id: "all", label: "All", count: issues.length },
                    {
                      id: "github",
                      label: "GitHub Sync",
                      count: issues.filter((i) =>
                        i.syncedTo?.some((s) => s.platform === "github")
                      ).length,
                    },
                    {
                      id: "zoho",
                      label: "Zoho Sync",
                      count: issues.filter((i) =>
                        i.syncedTo?.some((s) => s.platform === "zoho")
                      ).length,
                    },
                  ]}
                  activeFilter={statusFilter}
                  onFilterChange={(filterId) =>
                    setStatusFilter(filterId as any)
                  }
                  variant="pills"
                  showCounts={true}
                />
              </div>

              <SortControl
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortByChange={(value) => setSortBy(value as any)}
                onSortOrderChange={setSortOrder}
                options={[
                  { value: "date", label: "Date" },
                  { value: "name", label: "Name" },
                ]}
              />
            </div>

            {/* Tags Filter */}
            {allTags.length > 0 && (
              <motion.div
                className="flex items-start gap-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.3 }}
              >
                <span className="text-sm text-gray-400 font-medium whitespace-nowrap pt-1.5">
                  Filter by tags:
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => {
                      const isSelected = tagsFilter.includes(tag);
                      return (
                        <motion.button
                          key={tag}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            if (isSelected) {
                              setTagsFilter(
                                tagsFilter.filter((t) => t !== tag)
                              );
                            } else {
                              setTagsFilter([...tagsFilter, tag]);
                            }
                          }}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-200 ${
                            isSelected
                              ? "bg-blue-600/30 text-blue-300 border-blue-600/50 hover:bg-blue-600/40"
                              : "bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 border-gray-700/50 hover:border-gray-600/50"
                          }`}
                        >
                          {isSelected && (
                            <span className="inline-block mr-1">✓</span>
                          )}
                          {tag}
                        </motion.button>
                      );
                    })}
                  </div>
                  {tagsFilter.length > 0 && (
                    <button
                      onClick={() => setTagsFilter([])}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors mt-2 inline-flex items-center"
                    >
                      <svg
                        className="w-3 h-3 mr-1"
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
                      Clear all tags
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Issues Grid */}
          {filteredIssues.length === 0 ? (
            issues.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <NoSnapsEmptyState />
              </motion.div>
            ) : (
              <NoResultsEmptyState
                onClearFilters={() => {
                  setFilter("all");
                  setStatusFilter("all");
                  setSearchQuery("");
                  setTagsFilter([]);
                }}
              />
            )
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {paginatedIssues.map((issue, index) => (
                  <motion.div
                    key={issue.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.12) }}
                    whileHover={{ y: -4, transition: { duration: 0.15 } }}
                  >
                    <Card
                      className="overflow-hidden h-full flex flex-col group hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-300"
                      interactive
                      variant="elevated"
                    >
                      {/* Thumbnail */}
                      <div
                        className="relative h-40 bg-gray-800 overflow-hidden cursor-pointer"
                        onClick={() => openPreview(issue)}
                      >
                        {issue.thumbnailPath || issue.filePath ? (
                          <>
                            <LocalImage
                              src={issue.thumbnailPath || issue.filePath}
                              alt={issue.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            {/* Preview overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div className="bg-white/10 backdrop-blur-sm rounded-full p-4">
                                  <svg
                                    className="w-8 h-8 text-white"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                                    />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          /* issue.type === "recording" && issue.filePath — commented out
                        ) : issue.type === "recording" && issue.filePath ? (
                          <>
                            <video
                              src={`snapflow://${issue.filePath}`}
                              className="w-full h-full object-cover"
                              muted
                              preload="metadata"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div className="bg-white/10 backdrop-blur-sm rounded-full p-4">
                                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : */ <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                              <svg
                                className="w-16 h-16 mx-auto mb-2 text-gray-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              <p className="text-sm text-gray-500">
                                No preview
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Type Badge Overlay */}
                        <div className="absolute top-3 right-3">
                          <Badge
                            variant={
                              (issue as any).sessionData
                                ? "info"
                                : issue.type === "screenshot"
                                  ? "primary"
                                  : "secondary"
                            }
                            className="shadow-lg"
                          >
                            {(issue as any).sessionData
                              ? "🎬 Session"
                              : issue.type === "screenshot"
                                ? "📸 Screenshot"
                                : "🎥 Recording"}
                          </Badge>
                        </div>
                      </div>

                      <CardContent className="flex-1 flex flex-col p-4 pt-3">
                        {/* Title */}
                        <h3 className="font-semibold text-base text-gray-100 mb-2 line-clamp-1 leading-snug">
                          {issue.title}
                        </h3>

                        {/* Issue ID */}
                        <div className="mb-3 pb-3 border-b border-gray-800">
                          <span className="font-mono bg-gray-800/50 px-2 py-0.5 rounded text-[10px] text-gray-500">
                            {issue.id}
                          </span>
                        </div>

                        {/* Date and Time */}
                        <div className="mb-3 space-y-1.5">
                          <div className="flex items-center text-xs text-gray-400">
                            <svg
                              className="w-3.5 h-3.5 mr-1.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <span>
                              {format(new Date(issue.timestamp), "MMM d, yyyy")}
                            </span>
                          </div>
                          <div className="flex items-center text-xs text-gray-400">
                            <svg
                              className="w-3.5 h-3.5 mr-1.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span>
                              {format(new Date(issue.timestamp), "h:mm:ss a")}
                            </span>
                          </div>
                        </div>

                        {/* Tags */}
                        {issue.tags && issue.tags.length > 0 && (
                          <div className="mb-3">
                            <div className="flex flex-wrap gap-1.5">
                              {issue.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center px-2 py-0.5 bg-blue-600/20 text-blue-300 rounded text-[10px] font-medium border border-blue-600/30"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Sync Status and Actions */}
                        <div className="flex items-center justify-between mt-auto gap-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant="primary">☁️ Synced</Badge>
                          </div>

                          <div className="flex items-center space-x-0.5">
                            <GitHubSyncDropdown
                              issue={issue}
                              connectors={connectors}
                              className="hover:bg-gray-800"
                            />
                            <ZohoSyncDropdown
                              issue={issue}
                              connectors={connectors}
                              className="hover:bg-gray-800"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => confirmDelete(issue.id)}
                              title="Delete issue"
                              className="hover:bg-red-500/10 hover:text-red-400"
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
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              {/* Enhanced Pagination */}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={(items) => {
                  setItemsPerPage(items);
                  setCurrentPage(1);
                }}
                totalItems={filteredIssues.length}
                startIndex={startIndex}
                endIndex={endIndex}
                className="mt-8"
              />
            </>
          )}
        </main>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Issue</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this issue? This action cannot
                be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteIssue}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Full Resolution Preview Dialog */}
        <Dialog
          open={previewDialogOpen}
          onOpenChange={(open) => {
            setPreviewDialogOpen(open);
            if (!open) {
              setIsEditingDescription(false);
              setEditedDescription("");
              setActiveCarouselIdx(0);
              setGenerateDescriptionError(null);
            }
          }}
        >
          <DialogContent
            hideCloseButton
            className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] p-0 overflow-hidden bg-gray-950 border-gray-800"
          >
            <DialogVisuallyHidden>
              <DialogTitle>{previewIssue?.title || "Snap Preview"}</DialogTitle>
              <DialogDescription>
                {previewIssue?.type === "screenshot"
                  ? "Screenshot"
                  : "Recording"}{" "}
                preview and details
              </DialogDescription>
            </DialogVisuallyHidden>
            {previewIssue && (
              <div className="flex flex-col md:flex-row w-full h-full">
                {/* Main Image Preview */}
                <div className="flex-1 bg-gray-950 overflow-hidden min-h-0 flex flex-col">
                  {(previewIssue as any).sessionData?.screenshotPaths?.length >
                  0 ? (
                    <SessionScreenshotCarousel
                      paths={(previewIssue as any).sessionData.screenshotPaths}
                      title={previewIssue.title}
                      onIndexChange={setActiveCarouselIdx}
                    />
                  ) : previewIssue.filePath ? (
                    <div className="flex-1 overflow-auto p-4">
                      <LocalImage
                        src={previewIssue.filePath}
                        alt={previewIssue.title}
                        className="w-full h-full"
                        style={{
                          imageRendering: "crisp-edges" as any,
                          objectFit: "contain",
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-4">
                      <div className="text-center">
                        <svg
                          className="w-20 h-20 mx-auto mb-4 text-gray-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <p className="text-gray-500">
                          Full resolution image not available
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Sidebar - Details */}
                <div className="w-full md:w-96 bg-gray-900 border-t md:border-t-0 md:border-l border-gray-800 flex flex-col h-auto md:h-full max-h-[50vh] md:max-h-full shrink-0">
                  {/* Header with Close Button */}
                  <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-100">
                      Snap Details
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewDialogOpen(false)}
                      className="h-10 w-10 p-0 hover:bg-gray-800"
                    >
                      <svg
                        className="w-6 h-6"
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
                    </Button>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4 min-h-0">
                    {/* Title */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Title
                        </label>
                        {!isEditingTitle && (
                          <button
                            onClick={startEditingTitle}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {isEditingTitle ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editedTitle}
                            onChange={(e) => setEditedTitle(e.target.value)}
                            placeholder="Enter title..."
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                handleUpdateTitle(previewIssue.id, editedTitle)
                              }
                              className="flex-1 text-xs h-8"
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditingTitle}
                              className="flex-1 text-xs h-8"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm sm:text-base font-medium text-gray-100 break-words">
                          {previewIssue.title}
                        </p>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Description
                        </label>
                        <div className="flex items-center gap-2">
                          {!isEditingDescription &&
                            !!(previewIssue as any).sessionData &&
                            !previewIssue.description && (
                              <button
                                disabled={isGeneratingDescription}
                                onClick={async () => {
                                  setIsGeneratingDescription(true);
                                  setGenerateDescriptionError(null);
                                  try {
                                    const result =
                                      await window.api.aiGenerateDescriptionFromSnap(
                                        previewIssue.id
                                      );
                                    if (result?.success && result.data) {
                                      await handleUpdateDescription(
                                        previewIssue.id,
                                        result.data
                                      );
                                    } else {
                                      setGenerateDescriptionError(
                                        result?.error ?? "AI generation failed."
                                      );
                                    }
                                  } catch {
                                    setGenerateDescriptionError(
                                      "Failed to reach AI service."
                                    );
                                  } finally {
                                    setIsGeneratingDescription(false);
                                  }
                                }}
                                className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isGeneratingDescription ? (
                                  <>
                                    <svg
                                      className="w-3 h-3 animate-spin"
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
                                    Generating…
                                  </>
                                ) : (
                                  <>
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
                                        d="M13 10V3L4 14h7v7l9-11h-7z"
                                      />
                                    </svg>
                                    Auto Generate
                                  </>
                                )}
                              </button>
                            )}
                          {!isEditingDescription && (
                            <button
                              onClick={startEditingDescription}
                              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {previewIssue.description ? "Edit" : "Add"}
                            </button>
                          )}
                        </div>
                      </div>
                      {generateDescriptionError && (
                        <p className="text-xs text-red-400 mb-1.5">
                          {generateDescriptionError}
                        </p>
                      )}
                      {isEditingDescription ? (
                        <div className="space-y-2">
                          <textarea
                            value={editedDescription}
                            onChange={(e) =>
                              setEditedDescription(e.target.value)
                            }
                            placeholder="Enter description..."
                            rows={4}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg text-xs sm:text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={saveDescription}
                              className="flex-1 text-xs h-8"
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditingDescription}
                              className="flex-1 text-xs h-8"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : previewIssue.description ? (
                        <div className="max-h-32 sm:max-h-40 overflow-y-auto bg-gray-800/30 rounded-lg px-3 py-2">
                          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                            {previewIssue.description}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 italic">
                          No description
                        </p>
                      )}
                    </div>

                    {/* Type */}
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                        Type
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            (previewIssue as any).sessionData
                              ? "info"
                              : previewIssue.type === "screenshot"
                                ? "primary"
                                : "secondary"
                          }
                          className="text-xs"
                        >
                          {(previewIssue as any).sessionData
                            ? "🎬 Session"
                            : previewIssue.type === "screenshot"
                              ? "📸 Screenshot"
                              : "🎥 Recording"}
                        </Badge>
                        {(previewIssue as any).sessionData && (
                          <span className="text-xs text-gray-500">
                            {(previewIssue as any).sessionData.screenshotCount}{" "}
                            screenshots ·{" "}
                            {Math.round(
                              (previewIssue as any).sessionData.duration / 1000
                            )}
                            s
                          </span>
                        )}
                      </div>
                    </div>

                    {/* External Links - Open in Web */}
                    {previewIssue.syncedTo &&
                      previewIssue.syncedTo.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 block">
                            External Links
                          </label>
                          <div className="space-y-2">
                            {previewIssue.syncedTo.map((sync) => (
                              <button
                                key={`${sync.platform}-${sync.externalId}`}
                                onClick={() => {
                                  if (sync.url) {
                                    window.api.openExternalUrl(sync.url);
                                  }
                                }}
                                disabled={!sync.url}
                                title={
                                  !sync.url
                                    ? `Re-sync to ${sync.platform === "github" ? "GitHub" : "Zoho"} to enable this link`
                                    : `Open in ${sync.platform === "github" ? "GitHub" : "Zoho"}`
                                }
                                className="w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                                style={{
                                  backgroundColor:
                                    sync.platform === "github"
                                      ? "#1f2937"
                                      : "#7c2d12",
                                  color:
                                    sync.platform === "github"
                                      ? "#60a5fa"
                                      : "#fb923c",
                                }}
                              >
                                {sync.platform === "github" ? (
                                  <>
                                    <svg
                                      className="w-4 h-4"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                    </svg>
                                    Open in GitHub
                                  </>
                                ) : sync.platform === "zoho" ? (
                                  <>
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      strokeWidth="2"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                      />
                                    </svg>
                                    Open in Zoho
                                  </>
                                ) : (
                                  <>
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      strokeWidth="2"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                      />
                                    </svg>
                                    Open
                                  </>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Date & Time - Compact */}
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                        Created At
                      </label>
                      <div className="space-y-1">
                        <div className="flex items-center text-xs sm:text-sm text-gray-300">
                          <svg
                            className="w-3.5 h-3.5 mr-1.5 text-gray-400 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="truncate">
                            {format(
                              new Date(previewIssue.timestamp),
                              "MMM d, yyyy"
                            )}
                          </span>
                          <span className="mx-2 text-gray-600">•</span>
                          <svg
                            className="w-3.5 h-3.5 mr-1.5 text-gray-400 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span className="truncate">
                            {format(new Date(previewIssue.timestamp), "h:mm a")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Tags */}
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                        Tags
                      </label>
                      <ChipsInput
                        value={previewIssue.tags || []}
                        onChange={(tags) =>
                          handleUpdateTags(previewIssue.id, tags)
                        }
                        placeholder="Add tags..."
                      />
                    </div>

                    {/* ID */}
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">
                        ID
                      </label>
                      <p className="text-xs text-gray-300 font-mono bg-gray-800/50 px-2.5 py-1.5 rounded-lg break-all">
                        {(previewIssue as any).sessionData
                          ? `${previewIssue.id}-s${activeCarouselIdx + 1}`
                          : previewIssue.id}
                      </p>
                    </div>


                    {/* File Path - Collapsible on mobile */}
                    <details className="group">
                      <summary className="text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer list-none flex items-center justify-between">
                        <span>File Location</span>
                        <svg
                          className="w-4 h-4 transition-transform group-open:rotate-180"
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
                      </summary>
                      <p className="text-xs text-gray-400 font-mono bg-gray-800/30 px-2.5 py-1.5 rounded-lg break-all mt-1.5">
                        {(previewIssue as any).sessionData?.screenshotPaths?.[
                          activeCarouselIdx
                        ] ?? previewIssue.filePath}
                      </p>
                    </details>
                  </div>

                  {/* Action Buttons - Footer */}
                  <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-t border-gray-800 flex-shrink-0">
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      <div className="flex-1">
                        <GitHubSyncDropdown
                          issue={previewIssue}
                          connectors={connectors}
                          className="w-full justify-center text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
                        />
                      </div>
                      <div className="flex-1">
                        <ZohoSyncDropdown
                          issue={previewIssue}
                          connectors={connectors}
                          className="w-full justify-center text-xs h-9 bg-orange-600 hover:bg-orange-700 text-white"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPastingBug}
                        onClick={async () => {
                          setIsPastingBug(true);
                          try {
                            const result = await window.api.copyBugData({
                              title: previewIssue.title,
                              description: previewIssue.description,
                              cloudFileUrl: previewIssue.cloudFileUrl,
                              type: previewIssue.type,
                              filePath: previewIssue.filePath,
                              syncedTo: previewIssue.syncedTo,
                            });
                            if (result.success) {
                              window.api.showNotification("Copied", "Bug report copied to clipboard");
                            } else {
                              window.api.showNotification(
                                "Copy Failed",
                                result.error || "Failed to copy bug report"
                              );
                            }
                          } finally {
                            setIsPastingBug(false);
                          }
                        }}
                        className="w-full text-xs h-9"
                      >
                        <svg
                          className="w-3.5 h-3.5 mr-1.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        {isPastingBug ? "Copying..." : "Paste Bug"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setPreviewDialogOpen(false);
                          confirmDelete(previewIssue.id);
                        }}
                        className="w-full text-xs h-9"
                      >
                        <svg
                          className="w-3.5 h-3.5 mr-1.5"
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
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Recording picker is now in _app.tsx (global, works from any page) */}
      </div>
    </>
  );
}

// ── Session Screenshot Carousel ──────────────────────────────────────────────

function SessionScreenshotCarousel({
  paths,
  title,
  onIndexChange,
}: {
  paths: string[];
  title: string;
  onIndexChange?: (idx: number) => void;
}) {
  const [activeIdx, setActiveIdx] = React.useState(0);

  const setIdx = (idx: number) => {
    setActiveIdx(idx);
    onIndexChange?.(idx);
  };

  const prev = () => setIdx(Math.max(0, activeIdx - 1));
  const next = () => setIdx(Math.min(paths.length - 1, activeIdx + 1));

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Main image */}
      <div className="flex-1 relative flex items-center justify-center p-4 min-h-0 overflow-hidden">
        <LocalImage
          key={paths[activeIdx]}
          src={paths[activeIdx]}
          alt={`${title} – screenshot ${activeIdx + 1}`}
          className="max-w-full max-h-full object-contain rounded-lg"
          style={{ imageRendering: "crisp-edges" as any }}
        />

        {/* Prev / Next */}
        {paths.length > 1 && (
          <>
            <button
              onClick={prev}
              disabled={activeIdx === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-gray-900/90 border border-gray-700/60 flex items-center justify-center text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all shadow-lg"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={next}
              disabled={activeIdx === paths.length - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-gray-900/90 border border-gray-700/60 flex items-center justify-center text-gray-300 hover:bg-gray-800 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all shadow-lg"
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </>
        )}

        {/* Counter */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gray-900/80 border border-gray-700/50 text-xs text-gray-400 select-none">
          {activeIdx + 1} / {paths.length}
        </div>
      </div>

      {/* Thumbnail strip */}
      {paths.length > 1 && (
        <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/60 px-3 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {paths.map((p, i) => (
              <button
                key={p}
                onClick={() => setIdx(i)}
                className={[
                  "flex-shrink-0 w-16 h-10 rounded overflow-hidden border-2 transition-all duration-150",
                  activeIdx === i
                    ? "border-blue-500 shadow-md shadow-blue-500/20"
                    : "border-gray-700/40 hover:border-gray-600 opacity-60 hover:opacity-100",
                ].join(" ")}
              >
                <LocalImage
                  src={p}
                  alt={`Thumbnail ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Head from "next/head";
import { useRouter } from "next/router";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { GitHubIcon, ZohoIcon } from "../components/ui/BrandIcons";
import { Badge } from "../components/ui/Badge";
import { ChipsInput } from "../components/ui/ChipsInput";
import { SearchInput } from "../components/ui/SearchInput";
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
import { useStore } from "../store/useStore";
import { LocalImage } from "../components/ui/LocalImage";
import { AppShell } from "../components/layout";
import { useSyncQueue } from "../hooks/useSyncQueue";
import type { Issue } from "../types";

// ─── BugReport (mirrors main/services/ai.ts) ──────────────────────────────────

interface BugReport {
  title: string;
  summary: string;
  steps: string[];
  expected: string;
  actual: string;
  severity: "critical" | "high" | "medium" | "low";
}

/** Render a structured BugReport (returned by the AI service for session
 *  snaps) into the markdown blob we store in `description`. */
function formatBugReportMarkdown(report: BugReport): string {
  const lines: string[] = [];
  lines.push(`## Summary\n${report.summary ?? ""}`);
  if (Array.isArray(report.steps) && report.steps.length > 0) {
    lines.push(
      `\n## Steps to Reproduce\n${report.steps
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n")}`
    );
  }
  if (report.expected) {
    lines.push(`\n## Expected Behavior\n${report.expected}`);
  }
  if (report.actual) {
    lines.push(`\n## Actual Behavior\n${report.actual}`);
  }
  if (report.severity) {
    const sev =
      report.severity.charAt(0).toUpperCase() + report.severity.slice(1);
    lines.push(`\n## Severity\n${sev}`);
  }
  return lines.join("\n");
}

// Tracks workspaces that have already been synced from cloud this session.
// Module-level so it survives page navigation remounts.
const syncedWorkspaces = new Set<string>();

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
  } = useStore();

  const syncQueue = useSyncQueue(() => loadData());

  const [loading, setLoading] = useState(true);
  // Subtle background-refresh indicator — shown when stale data is already
  // visible and we're silently fetching fresh data behind the scenes.
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Connectors loaded once at page level; passed as a prop to sync dropdowns
  // so that 12 cards don't each make their own IPC call on mount.
  const [connectors, setConnectors] = useState<any[]>([]);
  const [_workspaceId, setWorkspaceId] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "screenshot" | "session">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "github" | "zoho">(
    "all"
  );
  const [sortBy, setSortBy] = useState<"date" | "name">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  // Tracks whether persisted prefs have been hydrated from disk. We don't
  // want to persist setter calls that fire from defaults during the first
  // render, since that would overwrite the user's saved prefs with defaults.
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Cloud-sync progress (snaps being downloaded from cloud → local). Surfaces
  // a clear banner so users don't think snaps are missing after switching
  // accounts or devices.
  const [cloudSync, setCloudSync] = useState<{
    active: boolean;
    current: number;
    total: number;
  }>({ active: false, current: 0, total: 0 });
  const [cloudSyncToast, setCloudSyncToast] = useState<string | null>(null);
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

  // Hydrate persisted home-screen prefs once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await window.api.getHomePrefs();
        if (cancelled || !result?.success || !result.data) {
          setPrefsLoaded(true);
          return;
        }
        const prefs = result.data;
        setViewMode(prefs.viewMode);
        setSortBy(prefs.sortBy);
        setSortOrder(prefs.sortOrder);
        setFilter(prefs.typeFilter);
        setStatusFilter(prefs.statusFilter);
      } catch (err) {
        console.warn("[Home] Failed to load home prefs:", err);
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist home-screen prefs when any pref changes (after hydration).
  useEffect(() => {
    if (!prefsLoaded) return;
    window.api
      .setHomePrefs({
        viewMode,
        sortBy,
        sortOrder,
        typeFilter: filter,
        statusFilter,
      })
      .catch((err) => console.warn("[Home] Failed to save home prefs:", err));
  }, [prefsLoaded, viewMode, sortBy, sortOrder, filter, statusFilter]);

  // Listen for cloud sync progress events emitted by syncService.fetchFromCloud.
  useEffect(() => {
    const unsubscribe = window.api.onCloudSyncProgress?.((data) => {
      if (data.phase === "start") {
        setCloudSync({
          active: true,
          current: 0,
          total: data.total ?? 0,
        });
        setCloudSyncToast(null);
      } else if (data.phase === "progress") {
        setCloudSync((prev) => ({
          active: true,
          current: data.current ?? prev.current,
          total: data.total ?? prev.total,
        }));
      } else if (data.phase === "complete") {
        setCloudSync({ active: false, current: 0, total: 0 });
        const synced = data.syncedCount ?? 0;
        const failed = data.failedCount ?? 0;
        if (synced > 0) {
          setCloudSyncToast(
            `Synced ${synced} ${synced === 1 ? "snap" : "snaps"} from cloud${
              failed > 0 ? ` (${failed} failed)` : ""
            }`
          );
        } else if (failed > 0) {
          setCloudSyncToast(
            `Cloud sync finished with ${failed} ${
              failed === 1 ? "error" : "errors"
            }`
          );
        }
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Auto-dismiss the completion toast after a few seconds.
  useEffect(() => {
    if (!cloudSyncToast) return;
    const timer = setTimeout(() => setCloudSyncToast(null), 4000);
    return () => clearTimeout(timer);
  }, [cloudSyncToast]);

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

      setLoading(false);

      // Pull from cloud only on first visit per workspace per session.
      // Subsequent navigations back to home skip this — local data is already
      // up to date. onAutoSyncCompleted handles refreshes when something changes.
      if (!syncedWorkspaces.has(wsId)) {
        syncedWorkspaces.add(wsId);
        setIsRefreshing(true);
        try {
          const cloudResult = await window.api.syncFromCloud(
            effectiveUserId,
            wsId
          );
          // Discard if workspace switched while we were pulling
          if (myToken !== fetchIdRef.current) return;
          if (cloudResult?.success && cloudResult.data?.syncedCount) {
            const refreshed = await window.api.listIssues(
              effectiveUserId,
              wsId
            );
            if (myToken !== fetchIdRef.current) return;
            if (refreshed.success) {
              setIssues(refreshed.data || []);
            }
          }
        } catch (err) {
          console.warn("[Home] Cloud pull failed (non-fatal):", err);
          syncedWorkspaces.delete(wsId); // allow retry next visit on failure
        } finally {
          if (myToken === fetchIdRef.current) {
            setIsRefreshing(false);
          }
        }
      }
      return;
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
          <GitHubIcon className="w-4 h-4 opacity-50" />
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
          <GitHubIcon className="w-4 h-4" />
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
          <GitHubIcon className="w-4 h-4" />
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
                    className="fixed inset-0 bg-gray-950/80 z-[9998]"
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
                      className="bg-gray-900 border border-gray-800 rounded-md shadow-lg shadow-black/40 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center">
                            <GitHubIcon className="w-5 h-5 text-blue-400" />
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
                                    : "bg-gray-800/30 border-gray-800 hover:bg-gray-800/60 hover:border-gray-600/50 active:scale-[0.98] cursor-pointer"
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
                                    <GitHubIcon className="w-6 h-6" />
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
                                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-2xs font-bold rounded-md uppercase tracking-wide flex-shrink-0">
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
                      <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 flex-shrink-0">
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
          <ZohoIcon className="w-4 h-4 text-orange-500 opacity-50" />
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
          <ZohoIcon className="w-4 h-4 text-orange-500" />
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
          <ZohoIcon className="w-4 h-4 text-orange-500" />
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

  if (loading) {
    return (
      <>
        <Head>
          <title>Home - SnapFlow</title>
        </Head>
        <AppShell>
          <div className="max-w-6xl mx-auto px-6 py-5">
            <div className="mb-5 space-y-3">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-7 w-20 rounded-md" />
                  ))}
                </div>
                <div className="flex gap-2 w-full lg:w-auto">
                  <Skeleton className="h-9 w-60 rounded-md" />
                  <Skeleton className="h-9 w-24 rounded-md" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="card overflow-hidden">
                  <Skeleton className="h-36 w-full rounded-none" />
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-5 w-14 rounded" />
                      <Skeleton className="h-5 w-14 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Home - SnapFlow</title>
      </Head>
      <AppShell>
        {isRefreshing && (
          <div className="flex-shrink-0 px-4 py-1.5 bg-gray-950 border-b border-gray-800 flex items-center gap-2 text-xs text-gray-500">
            <div className="w-3 h-3 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
            <span>Refreshing…</span>
          </div>
        )}

        {/* Cloud sync banner — visible while snaps are being pulled from cloud */}
        {cloudSync.active && (
          <div className="bg-blue-600/15 border-b border-blue-500/30 text-blue-200 text-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-3">
              <div className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-300 rounded-full animate-spin flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate">
                {cloudSync.total > 0
                  ? `Syncing snaps from cloud — ${cloudSync.current} of ${cloudSync.total}…`
                  : "Syncing snaps from cloud…"}
              </span>
              {cloudSync.total > 0 && (
                <div className="hidden sm:block w-32 h-1.5 bg-blue-900/40 rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full bg-blue-400 transition-all duration-200"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((cloudSync.current / cloudSync.total) * 100)
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cloud sync completion toast — auto-dismisses after a few seconds */}
        {!cloudSync.active && cloudSyncToast && (
          <div className="bg-emerald-600/15 border-b border-emerald-500/30 text-emerald-200 text-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-3">
              <svg
                className="w-4 h-4 flex-shrink-0"
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
              <span className="flex-1 min-w-0 truncate">{cloudSyncToast}</span>
              <button
                type="button"
                onClick={() => setCloudSyncToast(null)}
                className="text-emerald-300 hover:text-emerald-100 text-xs"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Toolbar — hidden until the user has snaps */}
          {issues.length > 0 &&
            (() => {
              const typeCounts = {
                all: issues.length,
                screenshot: issues.filter(
                  (i) => !(i as any).sessionData && i.type === "screenshot"
                ).length,
                session: issues.filter((i) => !!(i as any).sessionData).length,
              };
              const statusCounts = {
                all: issues.length,
                github: issues.filter((i) =>
                  i.syncedTo?.some((s) => s.platform === "github")
                ).length,
                zoho: issues.filter((i) =>
                  i.syncedTo?.some((s) => s.platform === "zoho")
                ).length,
              };
              const TYPE_OPTIONS: {
                id: "all" | "screenshot" | "session";
                label: string;
              }[] = [
                { id: "all", label: "All" },
                { id: "screenshot", label: "Screenshots" },
                { id: "session", label: "Sessions" },
              ];
              const STATUS_OPTIONS: {
                id: "all" | "github" | "zoho";
                label: string;
              }[] = [
                { id: "all", label: "All" },
                { id: "github", label: "GitHub" },
                { id: "zoho", label: "Zoho" },
              ];
              const showStatusRow =
                statusCounts.github > 0 || statusCounts.zoho > 0;
              return (
                <motion.div
                  className="mb-6 space-y-3"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                >
                  {/* Primary toolbar — segmented type + search + sort + view */}
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    {/* Type segmented control */}
                    <div
                      className="inline-flex bg-gray-900 border border-gray-800 rounded-md p-0.5 flex-shrink-0"
                      role="group"
                      aria-label="Filter by type"
                    >
                      {TYPE_OPTIONS.map((opt) => {
                        const active = filter === opt.id;
                        const count = typeCounts[opt.id];
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setFilter(opt.id as any)}
                            aria-pressed={active}
                            className={`h-7 px-3 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                              active
                                ? "bg-blue-600/25 text-blue-200 shadow-sm"
                                : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/40"
                            }`}
                          >
                            {opt.label}
                            <span
                              className={`text-2xs px-1.5 py-0.5 rounded-full font-semibold tabular-nums ${
                                active
                                  ? "bg-blue-500/30 text-blue-100"
                                  : "bg-gray-700/50 text-gray-500"
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Search */}
                    <div className="flex-1 min-w-0">
                      <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search your snaps..."
                        className="w-full max-w-md"
                        variant="glass"
                        suggestions={issues
                          .map((issue) => issue.title)
                          .slice(0, 5)}
                      />
                    </div>

                    {/* Sort + view toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Compact sort */}
                      <div
                        className="inline-flex bg-gray-900 border border-gray-800 rounded-md p-0.5"
                        role="group"
                        aria-label="Sort by"
                      >
                        {[
                          { value: "date" as const, label: "Date" },
                          { value: "name" as const, label: "Name" },
                        ].map((opt) => {
                          const active = sortBy === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setSortBy(opt.value)}
                              aria-pressed={active}
                              className={`h-7 px-2.5 text-xs font-medium rounded-md transition-all ${
                                active
                                  ? "bg-blue-600/25 text-blue-200"
                                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                        }
                        title={
                          sortOrder === "asc"
                            ? "Sorted ascending — click to flip"
                            : "Sorted descending — click to flip"
                        }
                        className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-gray-800 bg-gray-800/40 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors"
                      >
                        <svg
                          className={`w-3.5 h-3.5 transition-transform ${
                            sortOrder === "desc" ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                          />
                        </svg>
                      </button>

                      <div
                        className="inline-flex rounded-lg border border-gray-800 bg-gray-800/40 p-0.5"
                        role="group"
                        aria-label="View mode"
                      >
                        <button
                          type="button"
                          onClick={() => setViewMode("grid")}
                          aria-pressed={viewMode === "grid"}
                          title="Grid view"
                          className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                            viewMode === "grid"
                              ? "bg-blue-600/25 text-blue-200"
                              : "text-gray-500 hover:text-gray-200"
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
                              d="M4 6h6v6H4zM14 6h6v6h-6zM4 16h6v4H4zM14 16h6v4h-6z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("list")}
                          aria-pressed={viewMode === "list"}
                          title="List view"
                          className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                            viewMode === "list"
                              ? "bg-blue-600/25 text-blue-200"
                              : "text-gray-500 hover:text-gray-200"
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
                              d="M4 6h16M4 12h16M4 18h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Secondary row — sync status chips + tag chips, only when relevant */}
                  {(showStatusRow || allTags.length > 0) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                      {showStatusRow && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs font-semibold uppercase tracking-wide text-gray-500">
                            Sync
                          </span>
                          {STATUS_OPTIONS.map((opt) => {
                            const active = statusFilter === opt.id;
                            const count = statusCounts[opt.id];
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setStatusFilter(opt.id as any)}
                                aria-pressed={active}
                                className={`h-6 px-2.5 text-2xs font-medium rounded-full border transition-all flex items-center gap-1 ${
                                  active
                                    ? "bg-blue-500/15 text-blue-300 border-blue-500/40"
                                    : "bg-transparent text-gray-400 border-gray-700/60 hover:border-gray-600 hover:text-gray-200"
                                }`}
                              >
                                {opt.label}
                                <span className="tabular-nums opacity-70">
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {allTags.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-2xs font-semibold uppercase tracking-wide text-gray-500">
                            Tags
                          </span>
                          {allTags.map((tag) => {
                            const isSelected = tagsFilter.includes(tag);
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  setTagsFilter(
                                    isSelected
                                      ? tagsFilter.filter((t) => t !== tag)
                                      : [...tagsFilter, tag]
                                  );
                                }}
                                className={`h-6 px-2.5 text-2xs font-medium rounded-full border transition-all ${
                                  isSelected
                                    ? "bg-blue-500/15 text-blue-300 border-blue-500/40"
                                    : "bg-transparent text-gray-400 border-gray-700/60 hover:border-gray-600 hover:text-gray-200"
                                }`}
                              >
                                {isSelected && <span className="mr-1">✓</span>}
                                {tag}
                              </button>
                            );
                          })}
                          {tagsFilter.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setTagsFilter([])}
                              className="h-6 px-2 text-2xs text-gray-500 hover:text-gray-200 transition-colors"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })()}

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
                className={
                  viewMode === "list"
                    ? "bg-gray-800/20 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800/60"
                    : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                }
              >
                {paginatedIssues.map((issue, index) => {
                  const isSession = !!(issue as any).sessionData;
                  const typeMeta = isSession
                    ? {
                        label: "Session",
                        cls: "bg-purple-500/15 text-purple-300 border-purple-500/30",
                        icon: (
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
                              d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                            />
                          </svg>
                        ),
                      }
                    : issue.type === "screenshot"
                      ? {
                          label: "Screenshot",
                          cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",
                          icon: (
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
                        }
                      : {
                          label: "Recording",
                          cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                          icon: (
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
                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          ),
                        };
                  const hasThumb = !!(
                    issue.thumbnailPath ||
                    issue.filePath ||
                    issue.cloudThumbnailUrl ||
                    issue.cloudFileUrl
                  );
                  const isSynced =
                    !!issue.cloudFileUrl ||
                    !!issue.cloudThumbnailUrl ||
                    (issue.syncedTo?.length ?? 0) > 0;

                  // ───────── List row ─────────
                  if (viewMode === "list") {
                    return (
                      <motion.div
                        key={issue.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index * 0.02, 0.12) }}
                        className="group flex items-center gap-4 px-3 py-2.5 hover:bg-gray-800/40 transition-colors"
                      >
                        {/* Thumb */}
                        <button
                          type="button"
                          onClick={() => openPreview(issue)}
                          className="relative flex-shrink-0 w-24 h-16 rounded-md bg-gray-800 border border-gray-800 overflow-hidden hover:ring-2 hover:ring-blue-500/40 transition-all"
                        >
                          {hasThumb ? (
                            <LocalImage
                              src={issue.thumbnailPath || issue.filePath}
                              cloudFallback={
                                issue.cloudThumbnailUrl || issue.cloudFileUrl
                              }
                              alt={issue.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600">
                              <svg
                                className="w-6 h-6"
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
                            </div>
                          )}
                        </button>

                        {/* Title + meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3
                              className="text-sm font-semibold text-gray-100 truncate cursor-pointer hover:text-blue-300 transition-colors"
                              onClick={() => openPreview(issue)}
                              title={issue.title}
                            >
                              {issue.title}
                            </h3>
                            <span
                              className={`flex-shrink-0 inline-flex items-center gap-1 h-5 px-1.5 text-2xs font-medium rounded-full border ${typeMeta.cls}`}
                            >
                              {typeMeta.icon}
                              {typeMeta.label}
                            </span>
                            {isSynced && (
                              <span
                                title="Synced to cloud"
                                className="flex-shrink-0 inline-flex items-center gap-1 h-5 px-1.5 text-2xs font-medium rounded-full border bg-blue-500/10 text-blue-300 border-blue-500/25"
                              >
                                <svg
                                  className="w-2.5 h-2.5"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M19.35 10.04A7.49 7.49 0 0012 4 7.5 7.5 0 004.66 9.96 5.5 5.5 0 005.5 21h13.5a4.5 4.5 0 00.35-10.96z" />
                                </svg>
                                Synced
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                            <span>
                              {format(
                                new Date(issue.timestamp),
                                "MMM d, yyyy · h:mm a"
                              )}
                            </span>
                            {issue.tags && issue.tags.length > 0 && (
                              <span className="flex items-center gap-1 truncate">
                                {issue.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center px-1.5 py-0.5 bg-gray-700/40 text-gray-300 rounded text-2xs border border-gray-700/60"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {issue.tags.length > 3 && (
                                  <span className="text-2xs text-gray-600">
                                    +{issue.tags.length - 3}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex-shrink-0 flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <GitHubSyncDropdown
                            issue={issue}
                            connectors={connectors}
                            className="hover:bg-gray-700/60"
                          />
                          <ZohoSyncDropdown
                            issue={issue}
                            connectors={connectors}
                            className="hover:bg-gray-700/60"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => confirmDelete(issue.id)}
                            title="Delete"
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
                      </motion.div>
                    );
                  }

                  // ───────── Grid card ─────────
                  return (
                    <motion.div
                      key={issue.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.03, 0.12) }}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                    >
                      <Card
                        className="overflow-hidden h-full flex flex-col group hover:border-gray-600/70 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-200"
                        hover={false}
                        animate={false}
                        variant="default"
                      >
                        {/* Thumbnail */}
                        <button
                          type="button"
                          className="relative w-full aspect-video bg-gray-800 overflow-hidden block"
                          onClick={() => openPreview(issue)}
                        >
                          {hasThumb ? (
                            <>
                              <LocalImage
                                src={issue.thumbnailPath || issue.filePath}
                                cloudFallback={
                                  issue.cloudThumbnailUrl || issue.cloudFileUrl
                                }
                                alt={issue.title}
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10 pointer-events-none" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <div className="bg-white/15 backdrop-blur-sm rounded-full p-2.5">
                                    <svg
                                      className="w-5 h-5 text-white"
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
                            <div className="w-full h-full flex items-center justify-center">
                              <svg
                                className="w-10 h-10 text-gray-600"
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
                            </div>
                          )}

                          {/* Type chip — top-left */}
                          <span
                            className={`absolute top-2 left-2 inline-flex items-center gap-1 h-5 px-1.5 text-2xs font-medium rounded-full border backdrop-blur-sm ${typeMeta.cls}`}
                          >
                            {typeMeta.icon}
                            {typeMeta.label}
                          </span>

                          {/* Sync dot — top-right */}
                          {isSynced && (
                            <span
                              title="Synced to cloud"
                              className="absolute top-2 right-2 inline-flex items-center gap-1 h-5 px-1.5 text-2xs font-medium rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30 backdrop-blur-sm"
                            >
                              <svg
                                className="w-2.5 h-2.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M19.35 10.04A7.49 7.49 0 0012 4 7.5 7.5 0 004.66 9.96 5.5 5.5 0 005.5 21h13.5a4.5 4.5 0 00.35-10.96z" />
                              </svg>
                              Synced
                            </span>
                          )}
                        </button>

                        <div className="flex-1 flex flex-col gap-2 px-3.5 pt-3 pb-3">
                          {/* Title */}
                          <h3
                            className="font-semibold text-sm text-gray-100 line-clamp-2 leading-snug cursor-pointer hover:text-blue-300 transition-colors"
                            onClick={() => openPreview(issue)}
                            title={`${issue.title} (${issue.id})`}
                          >
                            {issue.title}
                          </h3>

                          {/* Meta — single tight line */}
                          <div className="flex items-center gap-1.5 text-2xs text-gray-500">
                            <svg
                              className="w-3 h-3 flex-shrink-0"
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
                                new Date(issue.timestamp),
                                "MMM d, yyyy · h:mm a"
                              )}
                            </span>
                          </div>

                          {/* Tags */}
                          {issue.tags && issue.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {issue.tags.slice(0, 4).map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center px-1.5 py-0.5 bg-gray-700/40 text-gray-300 rounded text-2xs border border-gray-700/60"
                                >
                                  {tag}
                                </span>
                              ))}
                              {issue.tags.length > 4 && (
                                <span className="text-2xs text-gray-600 px-1 py-0.5">
                                  +{issue.tags.length - 4}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Footer — actions */}
                          <div className="flex items-center justify-between pt-2 mt-auto border-t border-gray-800/60">
                            <span
                              className="text-2xs font-mono text-gray-600 truncate"
                              title={issue.id}
                            >
                              {issue.id}
                            </span>
                            <div className="flex items-center gap-0.5 -mr-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                              <GitHubSyncDropdown
                                issue={issue}
                                connectors={connectors}
                                className="hover:bg-gray-700/60"
                              />
                              <ZohoSyncDropdown
                                issue={issue}
                                connectors={connectors}
                                className="hover:bg-gray-700/60"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => confirmDelete(issue.id)}
                                title="Delete"
                                className="hover:bg-red-500/10 hover:text-red-400"
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
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
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
            className="!top-[calc(50%+1rem)] max-w-[95vw] w-[95vw] max-h-[calc(95vh-2rem)] h-[calc(95vh-2rem)] p-0 overflow-hidden bg-gray-950 border border-gray-800 rounded-xl shadow-2xl"
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
                      cloudUrls={
                        (previewIssue as any).sessionData?.cloudScreenshotUrls
                      }
                      title={previewIssue.title}
                      onIndexChange={setActiveCarouselIdx}
                    />
                  ) : previewIssue.filePath || previewIssue.cloudFileUrl ? (
                    <div className="flex-1 overflow-auto p-4">
                      <LocalImage
                        src={previewIssue.filePath}
                        cloudFallback={previewIssue.cloudFileUrl}
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
                <div className="w-full md:w-[520px] bg-gray-900 border-t md:border-t-0 md:border-l border-gray-800 flex flex-col h-auto md:h-full max-h-[50vh] md:max-h-full shrink-0">
                  {/* Header with Close Button */}
                  <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-sm font-semibold text-gray-100">
                        Snap Details
                      </h2>
                      <span className="text-2xs text-gray-500 font-mono truncate">
                        {(previewIssue as any).sessionData
                          ? `${previewIssue.id}-s${activeCarouselIdx + 1}`
                          : previewIssue.id}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewDialogOpen(false)}
                      title="Close"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
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

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4 min-h-0">
                    {/* Title */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                          Title
                        </label>
                        {!isEditingTitle && (
                          <button
                            onClick={startEditingTitle}
                            className="text-xs text-gray-500 hover:text-gray-200 transition-colors"
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
                            className="w-full h-9 px-3 bg-gray-900/60 border border-gray-600/50 text-gray-100 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500/60 transition-all"
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
                        <div className="bg-gray-900/40 border border-gray-800 rounded-lg px-4 py-2.5">
                          <p className="text-sm font-medium text-gray-100 break-words leading-snug">
                            {previewIssue.title}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                          Description
                        </label>
                        <div className="flex items-center gap-2">
                          {(() => {
                            // AI button visibility rules:
                            //  • Session snaps: original behaviour — show when
                            //    no description exists yet; the timeline gives
                            //    the AI the context it needs.
                            //  • Screenshot snaps: only show when the user has
                            //    written a proper description (≥20 chars). A
                            //    screenshot alone can't tell the AI what's
                            //    actually wrong, so we require notes first.
                            if (isEditingDescription) return null;
                            const isSession = !!(previewIssue as any)
                              .sessionData;
                            const trimmed = (
                              previewIssue.description ?? ""
                            ).trim();
                            const showButton = isSession
                              ? trimmed.length === 0
                              : trimmed.length >= 20;
                            if (!showButton) return null;
                            const label = isSession
                              ? "Auto Generate"
                              : "Improve with AI";
                            const busyLabel = isSession
                              ? "Generating…"
                              : "Refining…";
                            return (
                              <button
                                disabled={isGeneratingDescription}
                                onClick={async () => {
                                  setIsGeneratingDescription(true);
                                  setGenerateDescriptionError(null);
                                  try {
                                    const result = isSession
                                      ? await window.api.aiGenerateDescriptionFromSnap(
                                          previewIssue.id
                                        )
                                      : await window.api.aiGenerateScreenshotDescription(
                                          {
                                            filePath: previewIssue.filePath,
                                            userNotes:
                                              previewIssue.description ?? "",
                                          }
                                        );
                                    if (result?.success && result.data) {
                                      const text = isSession
                                        ? formatBugReportMarkdown(
                                            result.data as BugReport
                                          )
                                        : (result.data as string);
                                      await handleUpdateDescription(
                                        previewIssue.id,
                                        text
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
                                    {busyLabel}
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
                                    {label}
                                  </>
                                )}
                              </button>
                            );
                          })()}
                          {!isEditingDescription && (
                            <button
                              onClick={startEditingDescription}
                              className="text-xs text-gray-500 hover:text-gray-200 transition-colors"
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
                            rows={14}
                            className="w-full min-h-[240px] px-3 py-2 bg-gray-900/60 border border-gray-600/50 text-gray-100 rounded-lg text-sm placeholder-gray-500 resize-y focus:outline-none focus:border-blue-500/60 transition-all"
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
                        <div className="max-h-40 overflow-y-auto bg-gray-900/40 border border-gray-800 rounded-lg px-4 py-2.5">
                          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                            {previewIssue.description}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-900/40 border border-gray-800 border-dashed rounded-lg px-4 py-2.5">
                          <p className="text-xs text-gray-500 italic">
                            No description
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Type */}
                    <div>
                      <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
                        Type
                      </label>
                      {(() => {
                        const isSession = !!(previewIssue as any).sessionData;
                        const meta = isSession
                          ? {
                              label: "Session",
                              cls: "bg-purple-500/15 text-purple-300 border-purple-500/30",
                              icon: (
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
                                    d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                                  />
                                </svg>
                              ),
                            }
                          : previewIssue.type === "screenshot"
                            ? {
                                label: "Screenshot",
                                cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",
                                icon: (
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
                              }
                            : {
                                label: "Recording",
                                cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                                icon: (
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
                                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                  </svg>
                                ),
                              };
                        return (
                          <div className="bg-gray-900/40 border border-gray-800 rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 h-5 px-1.5 text-2xs font-medium rounded-full border ${meta.cls}`}
                            >
                              {meta.icon}
                              {meta.label}
                            </span>
                            {isSession && (
                              <span className="text-xs text-gray-500">
                                {
                                  (previewIssue as any).sessionData
                                    .screenshotCount
                                }{" "}
                                screenshots ·{" "}
                                {Math.round(
                                  (previewIssue as any).sessionData.duration /
                                    1000
                                )}
                                s
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* External Links - Open in Web */}
                    {previewIssue.syncedTo &&
                      previewIssue.syncedTo.length > 0 && (
                        <div>
                          <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2 block">
                            External Links
                          </label>
                          <div className="space-y-1.5">
                            {previewIssue.syncedTo.map((sync) => {
                              const isGithub = sync.platform === "github";
                              const isZoho = sync.platform === "zoho";
                              const platformLabel = isGithub
                                ? "GitHub"
                                : isZoho
                                  ? "Zoho"
                                  : sync.platform;
                              return (
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
                                      ? `Re-sync to ${platformLabel} to enable this link`
                                      : `Open in ${platformLabel}`
                                  }
                                  className="group w-full h-9 px-3 bg-gray-800/40 hover:bg-gray-800 border border-gray-800 hover:border-gray-600 rounded-lg text-sm text-gray-200 transition-all flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-800/40 disabled:hover:border-gray-800"
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    {isGithub ? (
                                      <GitHubIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                    ) : isZoho ? (
                                      <svg
                                        className="w-4 h-4 text-orange-400 flex-shrink-0"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                      >
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14H8l5-8H8V8h5l-5 8h5v2z" />
                                      </svg>
                                    ) : (
                                      <svg
                                        className="w-4 h-4 text-gray-400 flex-shrink-0"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                      </svg>
                                    )}
                                    <span className="font-medium">
                                      Open in {platformLabel}
                                    </span>
                                  </span>
                                  <svg
                                    className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 transition-colors flex-shrink-0"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                                    />
                                  </svg>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {/* Date & Time */}
                    <div>
                      <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
                        Created At
                      </label>
                      <div className="bg-gray-900/40 border border-gray-800 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm text-gray-300">
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
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span>
                          {format(
                            new Date(previewIssue.timestamp),
                            "MMM d, yyyy · h:mm a"
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Tags */}
                    <div>
                      <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
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

                    {/* File Path - Collapsible */}
                    <details className="group">
                      <summary className="text-sm font-semibold text-gray-400 uppercase tracking-wide cursor-pointer list-none flex items-center justify-between hover:text-gray-300 transition-colors">
                        <span>File Location</span>
                        <svg
                          className="w-3.5 h-3.5 text-gray-500 transition-transform group-open:rotate-180"
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
                      <p className="text-2xs text-gray-400 font-mono bg-gray-900/40 border border-gray-800 px-4 py-2.5 rounded-lg break-all mt-2 leading-relaxed">
                        {(previewIssue as any).sessionData?.screenshotPaths?.[
                          activeCarouselIdx
                        ] ?? previewIssue.filePath}
                      </p>
                    </details>
                  </div>

                  {/* Action Buttons - Footer */}
                  <div className="px-5 py-3 border-t border-gray-800 flex-shrink-0 bg-gray-900/60">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
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
                              window.api.showNotification(
                                "Copied",
                                "Bug report copied to clipboard"
                              );
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
                        className="flex-1 h-9"
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
                        {isPastingBug ? "Copying…" : "Copy bug report"}
                      </Button>
                      <GitHubSyncDropdown
                        issue={previewIssue}
                        connectors={connectors}
                        className="hover:bg-gray-800"
                      />
                      <ZohoSyncDropdown
                        issue={previewIssue}
                        connectors={connectors}
                        className="hover:bg-gray-800"
                      />
                      <button
                        type="button"
                        title="Delete snap"
                        onClick={() => {
                          setPreviewDialogOpen(false);
                          confirmDelete(previewIssue.id);
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-500/10 border border-gray-800 hover:border-red-500/40 transition-colors"
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
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Recording picker is now in _app.tsx (global, works from any page) */}
      </AppShell>
    </>
  );
}

// ── Session Screenshot Carousel ──────────────────────────────────────────────

function SessionScreenshotCarousel({
  paths,
  cloudUrls,
  title,
  onIndexChange,
}: {
  paths: string[];
  /** Parallel array of cloud URLs (one per path). Used as fallback when the
   *  local file is missing — e.g. snap synced from a different device. */
  cloudUrls?: string[];
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
          cloudFallback={cloudUrls?.[activeIdx]}
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
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gray-900/80 border border-gray-800 text-xs text-gray-400 select-none">
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
                    : "border-gray-800 hover:border-gray-600 opacity-60 hover:opacity-100",
                ].join(" ")}
              >
                <LocalImage
                  src={p}
                  cloudFallback={cloudUrls?.[i]}
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

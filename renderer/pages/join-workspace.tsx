import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import type { Workspace } from "../types";
import { CenteredLayout } from "../components/layout";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";

export default function JoinWorkspacePage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [role, setRole] = useState("dev");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const loadWorkspaceInfo = async () => {
      try {
        setLoading(true);
        setError("");

        const workspaceId = router.query.workspaceId as string;
        const queryRole = router.query.role as string;

        if (!workspaceId) {
          setError("No workspace ID provided");
          setLoading(false);
          return;
        }

        if (queryRole) {
          setRole(queryRole);
        }

        const result = await window.api.getWorkspaceInfo(workspaceId);
        if (!result.success || !result.data) {
          setError("Failed to load workspace information");
          setLoading(false);
          return;
        }

        setWorkspace(result.data.workspace);
        setTenantName(result.data.tenantName);
        setLoading(false);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An error occurred";
        setError(message);
        setLoading(false);
      }
    };

    loadWorkspaceInfo();
  }, [router.isReady, router.query]);

  const handleJoinWorkspace = async () => {
    try {
      if (!workspace) {
        setError("Workspace information missing");
        return;
      }

      setJoining(true);
      const result = await window.api.joinWorkspace(workspace.id, role);

      if (!result.success) {
        const errorMsg = result.error || "Failed to join workspace";
        setError(errorMsg);
        window.api.showNotification("Join Failed", errorMsg);
        setJoining(false);
        return;
      }

      window.api.showNotification(
        "Workspace Joined",
        `You've joined ${workspace.name}!`
      );

      await window.api.setActiveWorkspace(workspace.id);

      const next = result.data?.nextPendingInvite;
      if (next) {
        await router.push(
          `/join-workspace?workspaceId=${next.workspaceId}&role=${next.role}`
        );
        return;
      }

      if (result.data?.alreadyOnboarded) {
        await router.push("/home");
      } else {
        await router.push("/onboarding?mode=member");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      window.api.showNotification("Error", message);
      setJoining(false);
    }
  };

  const handleCancel = async () => {
    try {
      const tenantResult = await window.api.getUserTenant();
      if (tenantResult.success && tenantResult.data) {
        await router.push("/home");
      } else {
        await window.api.logout();
        await router.push("/auth");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      window.api.showNotification("Error", message);
    }
  };

  return (
    <>
      <Head>
        <title>Join Workspace – SnapFlow</title>
      </Head>

      <CenteredLayout maxWidth="md">
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <div className="border-t border-gray-800 my-3" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        )}

        {!loading && error && (
          <div className="text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-red-500/10 border border-red-500/25 mb-3">
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
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-h1">Unable to load invite</h1>
            <p className="text-muted mt-1">{error}</p>
            <Button
              variant="outline"
              size="md"
              fullWidth
              onClick={handleCancel}
              className="mt-5"
            >
              Go back
            </Button>
          </div>
        )}

        {!loading && !error && workspace && (
          <>
            <div className="text-center mb-5">
              <h1 className="text-h1">You've been invited</h1>
              <p className="text-muted mt-1">to join a SnapFlow workspace</p>
            </div>

            <div className="card-flat p-4 space-y-2.5 mb-5">
              <div className="flex items-center justify-between">
                <span className="text-caption">Workspace</span>
                <span className="text-sm font-medium text-gray-100 truncate ml-3">
                  {workspace.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-caption">Organization</span>
                <span className="text-sm font-medium text-gray-100 truncate ml-3">
                  {tenantName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-caption">Role</span>
                <span className="text-sm font-medium text-gray-100 capitalize">
                  {role}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                variant="primary"
                size="md"
                fullWidth
                onClick={handleJoinWorkspace}
                isLoading={joining}
              >
                Join workspace
              </Button>
              <Button
                variant="ghost"
                size="md"
                fullWidth
                onClick={handleCancel}
                disabled={joining}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </CenteredLayout>
    </>
  );
}

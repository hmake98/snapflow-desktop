import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { toast } from "sonner";
import type { Workspace } from "../types";
import { WindowControls } from "../components/ui/WindowControls";
import { Button } from "../components/ui/Button";

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

        // Load workspace info
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
        toast.error(errorMsg);
        setJoining(false);
        return;
      }

      toast.success("Successfully joined workspace! Setting up...");

      // Navigate to member onboarding
      await router.push("/onboarding?mode=member");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      toast.error(message);
      setJoining(false);
    }
  };

  const handleCancel = async () => {
    try {
      // Logout user
      await window.api.logout();
      // Navigate to auth page
      await router.push("/auth");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      toast.error(message);
    }
  };

  return (
    <>
      <Head>
        <title>Join Workspace - SnapFlow</title>
      </Head>

      <div className="h-screen w-screen bg-gradient-to-b from-gray-900 via-gray-950 to-black flex flex-col overflow-hidden">
        <WindowControls />

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            {loading ? (
              <div className="text-center space-y-4">
                <div className="inline-block">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 animate-pulse" />
                </div>
                <p className="text-gray-400">
                  Loading workspace information...
                </p>
              </div>
            ) : error ? (
              <div className="text-center space-y-4">
                <div className="inline-block">
                  <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                    <span className="text-red-500 text-xl">!</span>
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-gray-100">Error</h2>
                <p className="text-gray-400">{error}</p>
                <Button
                  onClick={handleCancel}
                  className="w-full bg-gray-800 hover:bg-gray-700 text-gray-100"
                >
                  Go Back
                </Button>
              </div>
            ) : workspace ? (
              <div className="text-center space-y-6">
                <div className="inline-block">
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <span className="text-2xl text-white">🎯</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-gray-100">
                    You've been invited to join
                  </h1>
                  <p className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                    {workspace.name}
                  </p>
                </div>

                <div className="space-y-1 text-gray-400">
                  <p>
                    <span className="text-gray-300 font-medium">
                      {tenantName}
                    </span>
                  </p>
                  <p className="text-sm">
                    Role:{" "}
                    <span className="text-gray-300 font-medium capitalize">
                      {role}
                    </span>
                  </p>
                </div>

                <div className="pt-4 space-y-3">
                  <Button
                    onClick={handleJoinWorkspace}
                    disabled={joining}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium py-2.5"
                  >
                    {joining ? "Joining..." : "Join Workspace"}
                  </Button>

                  <Button
                    onClick={handleCancel}
                    disabled={joining}
                    className="w-full bg-gray-800 hover:bg-gray-700 text-gray-100 font-medium py-2.5"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

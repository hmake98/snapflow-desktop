import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "../components/ui/Button";
import { SkeletonSyncCard } from "../components/ui/Skeleton";
import { WindowControls } from "../components/ui/WindowControls";
import {
  AccountSection,
  DisplaysSection,
  GitHubConnectorManager,
  UpdatesSection,
  CloudSyncIndicator,
} from "../components/settings";

type Tab = "account" | "connectors" | "sync" | "general";

interface User {
  id: string;
  name: string;
  email: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("account");
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  // Set active tab from query parameter
  useEffect(() => {
    if (router.query.tab) {
      const tab = router.query.tab as string;
      if (["account", "connectors", "sync", "general"].includes(tab)) {
        setActiveTab(tab as Tab);
      }
    }
  }, [router.query.tab]);

  const loadUser = async () => {
    try {
      setIsLoading(true);
      const result = await window.api.getUser();
      if (result.success) {
        setUser(result.data);
      }
    } catch (error) {
      console.error("Failed to load user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      console.log("[LOGOUT] === LOGOUT FLOW START ===");
      console.log("[LOGOUT] Current user:", user?.email);

      // Clear local state immediately
      console.log("[LOGOUT] Clearing local state...");
      setUser(null);

      console.log("[LOGOUT] Calling window.api.logout...");
      const result = await window.api.logout();

      console.log("[LOGOUT] Logout IPC returned");
      console.log("[LOGOUT] Result:", JSON.stringify(result, null, 2));

      if (result.success) {
        console.log("[LOGOUT] ✓ Logout successful!");
      }

      // Navigate using Next.js router
      console.log("[LOGOUT] Starting navigation to /auth...");
      console.log("[LOGOUT] Calling router.push('/auth')...");
      await router.push("/auth");
      console.log("[LOGOUT] ✓ router.push completed");
      console.log("[LOGOUT] === LOGOUT FLOW END ===");
    } catch (error) {
      console.error("[LOGOUT] ✗ Logout exception:", error);
      console.error(
        "[LOGOUT] Error details:",
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      );
      // Clear state and redirect even on error
      setUser(null);
      console.log("[LOGOUT] Attempting navigation after error...");
      router.push("/auth");
      console.log("[LOGOUT] === LOGOUT FLOW END (with error) ===");
    }
  };

  return (
    <>
      <Head>
        <title>Settings - SnapFlow</title>
      </Head>

      <div className="min-h-screen bg-gray-950">
        {/* Titlebar with Window Controls - Draggable */}
        <div
          className="glass-strong border-b border-white/5 sticky top-0 z-20 backdrop-blur-xl"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="flex items-center justify-end h-9 pl-4">
            <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
              <WindowControls />
            </div>
          </div>
        </div>

        {/* Main Header/Navbar - Same as Home Page */}
        <header className="glass-strong border-b border-white/10 sticky top-9 z-10 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/25">
                  <svg
                    className="w-6 h-6 text-white"
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
                </div>
                <h1 className="text-2xl font-bold text-blue-400">SnapFlow</h1>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-3 pl-3 border-l border-gray-700/50">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold shadow-lg">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-300">
                      {user?.name}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="h-8 px-3 text-sm inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 bg-transparent text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/50"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Secondary Navigation Bar */}
        <div className="glass-strong border-b border-white/5 backdrop-blur-xl sticky top-[104px] z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push("/home")}
                className="flex items-center space-x-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 rounded-lg px-3 py-2 transition-all duration-200"
                title="Back to Home"
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
                <span className="text-sm font-medium">Back to Home</span>
              </button>
              <div className="w-px h-4 bg-gray-600"></div>
              <div className="flex items-center space-x-2">
                <svg
                  className="w-4 h-4 text-gray-500"
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
                <span className="text-sm font-medium text-gray-300">
                  Settings
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Simple Tabs */}
          <div className="flex items-center space-x-2 mb-8">
            <Button
              variant={activeTab === "account" ? "primary" : "ghost"}
              onClick={() => setActiveTab("account")}
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
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              }
            >
              Account
            </Button>
            <Button
              variant={activeTab === "connectors" ? "primary" : "ghost"}
              onClick={() => setActiveTab("connectors")}
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
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              }
            >
              Connectors
            </Button>
            <Button
              variant={activeTab === "sync" ? "primary" : "ghost"}
              onClick={() => setActiveTab("sync")}
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              }
            >
              Sync
            </Button>
            <Button
              variant={activeTab === "general" ? "primary" : "ghost"}
              onClick={() => setActiveTab("general")}
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
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              }
            >
              General
            </Button>
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === "account" && (
              <>
                {/* Account Header */}
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-100 mb-2">
                    Account Settings
                  </h2>
                  <p className="text-sm text-gray-400">
                    Manage your personal information and account details
                  </p>
                </div>

                {/* Account Section */}
                <AccountSection />
              </>
            )}

            {activeTab === "connectors" && (
              <>
                {/* Simple Header */}
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-100 mb-2">
                    GitHub Integration
                  </h2>
                  <p className="text-sm text-gray-400">
                    Connect your repositories to automatically sync screenshots
                    as issues
                  </p>
                </div>

                {/* GitHub Connector Manager */}
                <GitHubConnectorManager />
              </>
            )}

            {activeTab === "sync" && (
              <>
                {/* Sync Header */}
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-100 mb-2">
                    Cloud Sync
                  </h2>
                  <p className="text-sm text-gray-400">
                    Back up and synchronize all your data to the cloud
                  </p>
                </div>

                {/* Cloud Sync Indicator */}
                {isLoading ? (
                  <SkeletonSyncCard />
                ) : user ? (
                  <CloudSyncIndicator userId={user.id} />
                ) : (
                  <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700/50 rounded-2xl p-8 hover:border-gray-600/50 transition-all duration-300 backdrop-blur-sm max-w-4xl">
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
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-300 mb-2">
                        User Not Found
                      </h3>
                      <p className="text-sm text-gray-500">
                        Please log in to access cloud sync features
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "general" && (
              <>
                {/* Updates Section */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-100 mb-4">
                    Software Updates
                  </h3>
                  <UpdatesSection />
                </div>

                {/* Displays Section */}
                <div className="pt-6 border-t border-gray-800">
                  <h3 className="text-lg font-semibold text-gray-100 mb-4">
                    Display Settings
                  </h3>
                  <DisplaysSection />
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

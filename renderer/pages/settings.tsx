import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "../components/ui/Button";
import { Skeleton } from "../components/ui/Skeleton";
import {
  AccountSection,
  DisplaysSection,
  GitHubConnectorManager,
  ZohoConnectorManager,
  UpdatesSection,
  // RecordingSection,
} from "../components/settings";
import { ProfileDropdown } from "../components/ui/ProfileDropdown";

type Tab = "account" | "connectors" | "general"; // | "recording";

interface User {
  id: string;
  name: string;
  email: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("account");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    loadUser();
  }, []);

  // Set active tab from query parameter
  useEffect(() => {
    if (router.query.tab) {
      const tab = router.query.tab as string;
      if (
        ["account", "connectors", "general" /* "recording" */].includes(tab)
      ) {
        setActiveTab(tab as Tab);
      }
    }
  }, [router.query.tab]);

  const loadUser = async () => {
    try {
      const result = await window.api.getUser();
      if (result.success) {
        setUser(result.data);
      }
    } catch (error) {
      console.error("Failed to load user:", error);
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <>
        <Head>
          <title>Settings - SnapFlow</title>
        </Head>
        <div className="min-h-screen bg-gray-950 pt-8">
          <header className="bg-gray-950 border-b border-gray-800/40 sticky top-8 z-20 flex items-center justify-between h-11 px-4">
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </header>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center space-x-2 mb-8">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-9 w-28 rounded-lg" />
              ))}
            </div>
            <div className="space-y-6">
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 space-y-5">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-16 h-16 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <div className="flex justify-end">
                  <Skeleton className="h-10 w-28 rounded-lg" />
                </div>
              </div>
            </div>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Settings - SnapFlow</title>
      </Head>

      <div className="min-h-screen bg-gray-950 pt-8">
        {/* App header — sits below the global traffic light bar */}
        <header className="bg-gray-950 border-b border-gray-800/40 sticky top-8 z-20 flex items-center justify-between h-11 px-4">
          <div className="flex items-center gap-2 text-gray-400">
            <button
              onClick={() => router.push("/home")}
              className="flex items-center gap-1.5 h-7 px-2 rounded-md hover:bg-gray-800/70 hover:text-gray-200 transition-all text-sm"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span>Settings</span>
            </button>
          </div>

          <ProfileDropdown
            user={user}
            onSettings={() => router.push("/settings")}
            onLogout={handleLogout}
          />
        </header>

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
            {/* Recording tab — commented out
            <Button
              variant={activeTab === "recording" ? "primary" : "ghost"}
              onClick={() => setActiveTab("recording")}
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
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              }
            >
              Recording
            </Button>
            */}
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === "account" && <AccountSection />}

            {activeTab === "connectors" && (
              <div className="max-w-4xl space-y-3">
                {/* Section header */}
                <div className="mb-6">
                  <h2 className="text-base font-semibold text-gray-100">
                    Integrations
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Connect external services to sync snaps and bug reports
                    automatically
                  </p>
                </div>

                {/* GitHub card */}
                <div className="bg-gradient-to-br from-gray-800/40 to-gray-900/40 border border-gray-700/50 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-700/40">
                    <div className="w-8 h-8 bg-gray-700/60 border border-gray-600/50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-gray-300"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-100">
                        GitHub
                      </p>
                      <p className="text-xs text-gray-500">
                        Sync snaps as issues to a repository
                      </p>
                    </div>
                  </div>
                  <div className="p-5">
                    <GitHubConnectorManager />
                  </div>
                </div>

                {/* Zoho card */}
                <div className="bg-gradient-to-br from-gray-800/40 to-gray-900/40 border border-gray-700/50 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-700/40">
                    <div className="w-8 h-8 bg-orange-600/15 border border-orange-500/25 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-orange-400"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14H8l5-8H8V8h5l-5 8h5v2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-100">
                        Zoho Projects
                      </p>
                      <p className="text-xs text-gray-500">
                        Sync snaps as tasks to a Zoho project
                      </p>
                    </div>
                  </div>
                  <div className="p-5">
                    <ZohoConnectorManager />
                  </div>
                </div>
              </div>
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

            {/* {activeTab === "recording" && <RecordingSection />} */}
          </div>
        </main>
      </div>
    </>
  );
}

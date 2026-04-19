import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "../components/ui/Button";
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
              <div className="space-y-6">
                {/* GitHub Section */}
                <div>
                  <div className="mb-4">
                    <h2 className="text-base font-semibold text-gray-100 mb-1">
                      GitHub Integration
                    </h2>
                    <p className="text-sm text-gray-500">
                      Connect your repositories to automatically sync
                      screenshots as issues
                    </p>
                  </div>
                  <GitHubConnectorManager />
                </div>

                <div className="border-t border-gray-800" />

                {/* Zoho Section */}
                <div>
                  <div className="mb-4">
                    <h2 className="text-base font-semibold text-gray-100 mb-1">
                      Zoho Projects Integration
                    </h2>
                    <p className="text-sm text-gray-500">
                      Connect your Zoho workspace to sync screenshots as tasks
                    </p>
                  </div>
                  <ZohoConnectorManager />
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

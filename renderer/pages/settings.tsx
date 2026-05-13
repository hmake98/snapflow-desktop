import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useStore } from "../store/useStore";
import {
  AccountSection,
  AiSection,
  DisplaysSection,
  GitHubConnectorManager,
  ZohoConnectorManager,
  UpdatesSection,
} from "../components/settings";
import { AppShell, Section } from "../components/layout";
import { Avatar } from "../components/ui/Avatar";

type Tab = "account" | "connectors" | "ai" | "general";

export default function SettingsPage() {
  const router = useRouter();
  const { user: storeUser, resetStore } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>("account");

  useEffect(() => {
    const tab = router.query.tab as string | undefined;
    if (tab && ["account", "connectors", "ai", "general"].includes(tab)) {
      setActiveTab(tab as Tab);
    }
  }, [router.query.tab]);

  const handleLogout = async () => {
    resetStore();
    try {
      await window.api.logout();
    } catch {
      // swallow — still navigate away
    } finally {
      router.push("/auth");
    }
  };

  const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "account",
      label: "Account",
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
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      ),
    },
    {
      id: "connectors",
      label: "Connectors",
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
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      ),
    },
    {
      id: "ai",
      label: "AI",
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
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      ),
    },
    {
      id: "general",
      label: "General",
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
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
  ];

  const TAB_TITLES: Record<Tab, { title: string; description: string }> = {
    account: {
      title: "Account",
      description: "Your profile, workspaces, and team.",
    },
    connectors: {
      title: "Connectors",
      description: "Sync snaps to external tools.",
    },
    ai: { title: "AI", description: "AI providers and capabilities." },
    general: {
      title: "General",
      description: "App updates and capture devices.",
    },
  };

  return (
    <>
      <Head>
        <title>Settings – SnapFlow</title>
      </Head>

      <AppShell>
        <div className="flex h-full">
          {/* Sidebar */}
          <aside className="w-56 flex-shrink-0 border-r border-gray-800 flex flex-col overflow-y-auto bg-gray-950">
            {/* Back to Home */}
            <div className="p-2 border-b border-gray-800">
              <button
                onClick={() => router.push("/home")}
                className="w-full flex items-center gap-2 px-2.5 h-8 rounded-md text-sm font-medium text-gray-400 hover:text-gray-100 hover:bg-gray-900 transition-colors"
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
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to home
              </button>
            </div>

            {storeUser && (
              <div className="px-3 py-3 border-b border-gray-800">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    src={(storeUser as any).avatarUrl}
                    name={storeUser.name}
                    email={storeUser.email}
                    size={32}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-100 truncate">
                      {storeUser.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {storeUser.email}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <nav className="flex-1 p-2 space-y-0.5">
              {NAV.map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-2 px-2.5 h-8 rounded-md text-sm font-medium transition-colors text-left ${
                    activeTab === id
                      ? "bg-gray-800 text-gray-50"
                      : "text-gray-400 hover:text-gray-100 hover:bg-gray-900"
                  }`}
                >
                  <span
                    className={
                      activeTab === id ? "text-blue-400" : "text-gray-500"
                    }
                  >
                    {icon}
                  </span>
                  {label}
                </button>
              ))}
            </nav>

            <div className="p-2 border-t border-gray-800">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-2.5 h-8 rounded-md text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
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
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Sign out
              </button>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-6 py-5">
              <header className="mb-5">
                <h1 className="text-display">{TAB_TITLES[activeTab].title}</h1>
                <p className="text-muted mt-1">
                  {TAB_TITLES[activeTab].description}
                </p>
              </header>

              <div className="space-y-4">
                {activeTab === "account" && <AccountSection />}

                {activeTab === "connectors" && (
                  <>
                    <Section
                      title="GitHub"
                      description="Sync snaps as issues to a repository."
                    >
                      <GitHubConnectorManager />
                    </Section>
                    <Section
                      title="Zoho Projects"
                      description="Sync snaps as tasks to a Zoho project."
                    >
                      <ZohoConnectorManager />
                    </Section>
                  </>
                )}

                {activeTab === "ai" && <AiSection />}

                {activeTab === "general" && (
                  <>
                    <UpdatesSection />
                    <DisplaysSection />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}

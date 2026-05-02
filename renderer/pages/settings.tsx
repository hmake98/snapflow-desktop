import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useStore } from "../store/useStore";
import {
  AccountSection,
  DisplaysSection,
  GitHubConnectorManager,
  ZohoConnectorManager,
  UpdatesSection,
} from "../components/settings";

type Tab = "account" | "connectors" | "general";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function SettingsPage() {
  const router = useRouter();
  const { user: storeUser, resetStore } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>("account");

  // Set active tab from query parameter
  useEffect(() => {
    const tab = router.query.tab as string | undefined;
    if (tab && ["account", "connectors", "general"].includes(tab)) {
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

  const NAV: {
    id: Tab;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: "account",
      label: "Account",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      id: "connectors",
      label: "Connectors",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
    {
      id: "general",
      label: "General",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <Head>
        <title>Settings – SnapFlow</title>
      </Head>

      {/* Full-height layout below the traffic-light bar */}
      <div className="h-screen bg-gray-950 pt-8 flex flex-col overflow-hidden">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <header className="flex-shrink-0 h-11 bg-gray-950 border-b border-gray-800/50 flex items-center justify-between px-4">
          <button
            onClick={() => router.push("/home")}
            className="flex items-center gap-1.5 h-7 px-2 rounded-md text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800/70 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Settings
          </button>
        </header>

        {/* ── Body: sidebar + content ──────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar ───────────────────────────────────────────────────── */}
          <aside className="w-52 flex-shrink-0 border-r border-gray-800/50 flex flex-col overflow-y-auto bg-gray-950">
            {/* User mini card */}
            {storeUser && (
              <div className="px-3 py-4 border-b border-gray-800/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {getInitials(storeUser.name || storeUser.email)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-200 truncate">
                      {storeUser.name}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {storeUser.email}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Nav items */}
            <nav className="flex-1 p-2 space-y-0.5">
              {NAV.map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm font-medium transition-all text-left ${
                    activeTab === id
                      ? "bg-blue-600/20 text-blue-300 border border-blue-500/30"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent"
                  }`}
                >
                  <span className={activeTab === id ? "text-blue-400" : "text-gray-500"}>
                    {icon}
                  </span>
                  {label}
                </button>
              ))}
            </nav>

            {/* Sign out at bottom */}
            <div className="p-2 border-t border-gray-800/50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </div>
          </aside>

          {/* ── Content area ──────────────────────────────────────────────── */}
          <main className="flex-1 overflow-y-auto bg-gray-950">
            {activeTab === "account" && (
              <AccountSection />
            )}

            {activeTab === "connectors" && (
              <div className="p-6 max-w-2xl space-y-3">
                {/* GitHub */}
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-700/40">
                    <div className="w-5 h-5 bg-gray-700/60 border border-gray-600/50 rounded flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">GitHub</span>
                    <span className="text-xs text-gray-600 font-normal normal-case tracking-normal">Sync snaps as issues to a repository</span>
                  </div>
                  <div className="p-4">
                    <GitHubConnectorManager />
                  </div>
                </div>

                {/* Zoho */}
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-700/40">
                    <div className="w-5 h-5 bg-orange-600/15 border border-orange-500/25 rounded flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14H8l5-8H8V8h5l-5 8h5v2z" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Zoho Projects</span>
                    <span className="text-xs text-gray-600 font-normal normal-case tracking-normal">Sync snaps as tasks to a Zoho project</span>
                  </div>
                  <div className="p-4">
                    <ZohoConnectorManager />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "general" && (
              <div className="p-6 max-w-2xl space-y-3">
                <UpdatesSection />
                <DisplaysSection />
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

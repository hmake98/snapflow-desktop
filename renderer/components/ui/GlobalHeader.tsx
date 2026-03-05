import React from "react";
import { useRouter } from "next/router";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { toast } from "sonner";

interface GlobalHeaderProps {
  user: { name?: string; email?: string } | null;
}

function ProfileDropdown({
  user,
  onSettings,
  onLogout,
}: {
  user: { name?: string; email?: string } | null;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 h-9 pl-2 pr-3 rounded-lg hover:bg-gray-800/60 transition-all group"
      >
        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-lg flex-shrink-0">
          {user?.name?.charAt(0).toUpperCase() ?? "?"}
        </div>
        <span className="text-sm font-medium text-gray-300 max-w-[120px] truncate">
          {user?.name ?? ""}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
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
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 border border-gray-700/50 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* User info */}
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-sm font-medium text-gray-200 truncate">
              {user?.name}
            </p>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {user?.email}
            </p>
          </div>

          {/* Menu items */}
          <div className="p-1.5 space-y-0.5">
            <button
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800/60 transition-colors text-sm text-gray-300 hover:text-gray-100"
            >
              Settings
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800/60 transition-colors text-sm text-gray-300 hover:text-gray-100"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function GlobalHeader({ user }: GlobalHeaderProps) {
  const router = useRouter();
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSettings = () => {
    router.push("/settings");
  };

  const handleLogout = async () => {
    try {
      await window.api.logout();
      await router.push("/auth");
    } catch (_error) {
      toast.error("Failed to logout");
    }
  };

  // Don't render on auth-related pages
  const hideOnPages = ["/auth", "/500", "/join-workspace"];
  if (hideOnPages.includes(router.pathname)) {
    return null;
  }

  if (!isMounted) {
    return null;
  }

  return (
    <header className="glass-strong border-b border-white/10 h-12 sticky top-9 z-10 backdrop-blur-xl flex items-center px-4">
      <div className="max-w-full mx-auto w-full flex items-center justify-between">
        {/* Left: Logo + Workspace Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-100 hidden sm:inline">
              SnapFlow
            </span>
          </div>
          <div className="hidden sm:block">
            <WorkspaceSwitcher />
          </div>
        </div>

        {/* Right: Mobile Workspace + Profile */}
        <div className="flex items-center gap-2">
          <div className="sm:hidden">
            <WorkspaceSwitcher />
          </div>
          <ProfileDropdown
            user={user}
            onSettings={handleSettings}
            onLogout={handleLogout}
          />
        </div>
      </div>
    </header>
  );
}

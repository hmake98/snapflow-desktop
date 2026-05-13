import React from "react";
import { useRouter } from "next/router";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

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
        className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-md hover:bg-gray-800 transition-colors"
      >
        <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
          {user?.name?.charAt(0).toUpperCase() ?? "?"}
        </div>
        <span className="text-sm font-medium text-gray-200 max-w-[120px] truncate">
          {user?.name ?? ""}
        </span>
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
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
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-gray-900 border border-gray-800 rounded-md shadow-lg shadow-black/40 z-50 overflow-hidden animate-fade-in">
          <div className="px-3 py-2.5 border-b border-gray-800">
            <p className="text-sm font-medium text-gray-100 truncate">
              {user?.name}
            </p>
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {user?.email}
            </p>
          </div>
          <div className="p-1">
            <button
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-gray-800 transition-colors text-sm text-gray-300 hover:text-gray-100"
            >
              Settings
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-gray-800 transition-colors text-sm text-gray-300 hover:text-gray-100"
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
      window.api.showNotification("Error", "Failed to logout");
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
    <header className="flex-shrink-0 h-11 bg-gray-950 border-b border-gray-800 flex items-center px-4">
      <div className="w-full flex items-center justify-between gap-3">
        {/* Left: Logo + Workspace Selector */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <svg
                className="w-3.5 h-3.5 text-white"
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
            <span className="text-sm font-semibold text-gray-100">
              SnapFlow
            </span>
          </div>
          <div className="h-5 w-px bg-gray-800" />
          <WorkspaceSwitcher />
        </div>

        {/* Right: Profile */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
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

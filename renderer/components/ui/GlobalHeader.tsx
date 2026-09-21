import React from "react";
import { useRouter } from "next/router";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { ProfileDropdown } from "./ProfileDropdown";

interface GlobalHeaderProps {
  user: { name?: string; email?: string; avatarUrl?: string } | null;
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

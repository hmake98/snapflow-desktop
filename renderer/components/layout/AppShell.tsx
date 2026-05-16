import React, { useEffect, useRef } from "react";
import { GlobalHeader } from "../ui/GlobalHeader";
import { showToast } from "../ui/Toast";
import { useStore } from "../../store/useStore";

interface AppShellProps {
  children: React.ReactNode;
  /** Render the GlobalHeader (workspace switcher + profile). Default true. */
  header?: boolean;
  /** Optional sub-header (e.g. settings nav) rendered above the scrollable main area. */
  subHeader?: React.ReactNode;
}

/**
 * Root wrapper for every authenticated page.
 *
 * Layout (top → bottom):
 *   ┌─── traffic-light spacer (8px, drag region, in _app.tsx) ───┐
 *   │── GlobalHeader (workspace + profile) ──────────────────────│
 *   │── subHeader slot (optional) ───────────────────────────────│
 *   └── <main> scrollable content ──────────────────────────────┘
 */
export function AppShell({
  children,
  header = true,
  subHeader,
}: Readonly<AppShellProps>) {
  const user = useStore((s) => s.user);
  const isOnline = useStore((s) => s.isOnline);
  const queueCount = useStore((s) => s.syncQueue.length);

  const prevIsOnline = useRef(true);
  const prevQueueCount = useRef(0);

  // Offline / back-online toasts
  useEffect(() => {
    const wentOffline = !isOnline && prevIsOnline.current;
    const cameOnline = isOnline && !prevIsOnline.current;

    if (wentOffline) {
      const body =
        queueCount > 0
          ? `${queueCount} ${queueCount === 1 ? "operation" : "operations"} queued`
          : undefined;
      showToast("You're offline", body, "warning");
    }

    if (cameOnline) {
      if (queueCount > 0) {
        showToast(
          "Back online",
          `Syncing ${queueCount} queued ${queueCount === 1 ? "operation" : "operations"}…`,
          "info"
        );
      } else {
        showToast("Back online", undefined, "success");
      }
    }

    prevIsOnline.current = isOnline;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // "All synced" toast when queue drains while online
  useEffect(() => {
    if (isOnline && queueCount === 0 && prevQueueCount.current > 0) {
      showToast("All synced", undefined, "success");
    }
    prevQueueCount.current = queueCount;
  }, [isOnline, queueCount]);

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-gray-100 pt-8">
      {header && <GlobalHeader user={user} />}
      {subHeader}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

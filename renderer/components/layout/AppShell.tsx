import React from "react";
import { GlobalHeader } from "../ui/GlobalHeader";
import { OfflineBanner } from "../ui/OfflineBanner";
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
 *   │── OfflineBanner (conditional) ─────────────────────────────│
 *   │── subHeader slot (optional) ───────────────────────────────│
 *   └── <main> scrollable content ──────────────────────────────┘
 */
export function AppShell({
  children,
  header = true,
  subHeader,
}: Readonly<AppShellProps>) {
  const user = useStore((s) => s.user);

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-gray-100 pt-8">
      {header && <GlobalHeader user={user} />}
      <OfflineBanner />
      {subHeader}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

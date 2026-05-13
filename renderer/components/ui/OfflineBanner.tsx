import React from "react";
import { useStore } from "../../store/useStore";

export function OfflineBanner() {
  const isOnline = useStore((s) => s.isOnline);
  const queueCount = useStore((s) => s.syncQueue.length);

  if (isOnline && queueCount === 0) return null;

  return (
    <div
      className={`flex-shrink-0 w-full px-4 py-1.5 flex items-center justify-center gap-2 text-xs font-medium ${
        isOnline
          ? "bg-green-900/30 border-b border-green-800/40 text-green-300"
          : "bg-amber-900/30 border-b border-amber-800/40 text-amber-300"
      }`}
    >
      {isOnline ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Back online — syncing {queueCount} queued{" "}
          {queueCount === 1 ? "operation" : "operations"}…
        </>
      ) : (
        <>
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M3 3l18 18"
            />
          </svg>
          You are offline
          {queueCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-amber-700/40 rounded-full">
              {queueCount} {queueCount === 1 ? "operation" : "operations"}{" "}
              queued
            </span>
          )}
        </>
      )}
    </div>
  );
}

import React from "react";

type MaxWidth = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const WIDTH_MAP: Record<MaxWidth, string> = {
  xs: "max-w-xs",
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

interface CenteredLayoutProps {
  children: React.ReactNode;
  /** Card width. Default md (≈420px) — desktop auth-card density. */
  maxWidth?: MaxWidth;
  /** Show the SnapFlow brand mark above the content. Default true. */
  brand?: boolean;
  /** Wrap children in a card surface. Default true. */
  card?: boolean;
}

/**
 * Centered layout for unauthenticated / linear flows
 * (auth, join-workspace, onboarding, 500).
 *
 * - Renders the traffic-light drag spacer at the top
 * - Centers content vertically and horizontally
 * - Optional brand mark + card wrapping
 */
export function CenteredLayout({
  children,
  maxWidth = "md",
  brand = true,
  card = true,
}: CenteredLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100 pt-8">
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <div className={`w-full ${WIDTH_MAP[maxWidth]}`}>
          {brand && <BrandMark />}
          {card ? (
            <div className="card p-6 animate-fade-in">{children}</div>
          ) : (
            <div className="animate-fade-in">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="mb-6 flex items-center justify-center gap-2.5">
      <div className="h-7 w-7 rounded-md bg-blue-600 flex items-center justify-center">
        <svg
          className="h-4 w-4 text-white"
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
      <span className="text-base font-semibold tracking-tight text-gray-50">
        SnapFlow
      </span>
    </div>
  );
}

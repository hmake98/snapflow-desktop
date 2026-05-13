import React from "react";

type MaxWidth =
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl"
  | "6xl"
  | "full";

const WIDTH_MAP: Record<MaxWidth, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  full: "max-w-full",
};

interface PageContentProps {
  children: React.ReactNode;
  maxWidth?: MaxWidth;
  className?: string;
}

/**
 * Standard content container — one source of truth for page padding
 * and max-width across the whole app.
 *
 * Padding: px-6 py-5 → desktop-comfortable.
 * Default max-width: 6xl (≈1152px) which suits 1440px desktop windows.
 */
export function PageContent({
  children,
  maxWidth = "6xl",
  className = "",
}: PageContentProps) {
  return (
    <div
      className={`mx-auto w-full ${WIDTH_MAP[maxWidth]} px-6 py-5 ${className}`}
    >
      {children}
    </div>
  );
}

import React from "react";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Render a divider underneath (default: true). */
  divider?: boolean;
}

/** Standard title row at the top of every page's main content. */
export function PageHeader({
  title,
  subtitle,
  actions,
  divider = true,
}: PageHeaderProps) {
  return (
    <header
      className={`flex items-start justify-between gap-4 ${divider ? "border-b border-gray-800 pb-4 mb-5" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-display truncate">{title}</h1>
        {subtitle && <p className="text-muted mt-1 truncate">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </header>
  );
}

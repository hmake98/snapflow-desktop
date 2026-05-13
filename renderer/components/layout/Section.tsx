import React from "react";

interface SectionProps {
  /** Optional section title. */
  title?: React.ReactNode;
  /** Optional helper text under the title. */
  description?: React.ReactNode;
  /** Right-aligned slot in the section header (e.g. buttons, badges). */
  actions?: React.ReactNode;
  /** Render the section as a flat (non-card) block. */
  flat?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Labeled card section.
 * Replaces the ad-hoc `<div className="bg-gray-900 rounded-xl p-6">…</div>`
 * pattern. Used inside settings tabs, onboarding steps, and home content.
 */
export function Section({
  title,
  description,
  actions,
  flat = false,
  className = "",
  children,
}: SectionProps) {
  const surfaceClass = flat ? "" : "card";

  return (
    <section className={`${surfaceClass} ${className}`}>
      {(title || actions) && (
        <header
          className={`flex items-start justify-between gap-3 ${flat ? "mb-3" : "px-5 py-4 border-b border-gray-800"}`}
        >
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-h2">{title}</h2>}
            {description && <p className="text-caption mt-1">{description}</p>}
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={flat ? "" : "px-5 py-4"}>{children}</div>
    </section>
  );
}

interface FormRowProps {
  label?: React.ReactNode;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/** Consistent form-field row used in onboarding, settings, auth. */
export function FormRow({
  label,
  helper,
  error,
  required,
  htmlFor,
  className = "",
  children,
}: FormRowProps) {
  return (
    <div className={`form-row ${className}`}>
      {label && (
        <label className="form-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : (
        helper && <p className="form-helper">{helper}</p>
      )}
    </div>
  );
}

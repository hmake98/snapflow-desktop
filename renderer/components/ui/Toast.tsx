import React, { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type ToastVariant = "info" | "success" | "error";

interface Toast {
  id: number;
  title: string;
  body?: string;
  variant: ToastVariant;
}

const inferVariant = (title: string, body?: string): ToastVariant => {
  const text = `${title} ${body ?? ""}`.toLowerCase();
  if (
    /\b(error|failed|fail|invalid|could not|cannot|too large|denied)\b/.test(
      text
    )
  ) {
    return "error";
  }
  if (
    /\b(saved|updated|removed|added|copied|created|deleted|sent|switched|success)\b/.test(
      text
    )
  ) {
    return "success";
  }
  return "info";
};

const VARIANT_STYLES: Record<
  ToastVariant,
  { ring: string; icon: React.ReactNode }
> = {
  info: {
    ring: "border-gray-700/60",
    icon: (
      <svg
        className="w-3.5 h-3.5 text-blue-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  success: {
    ring: "border-emerald-500/30",
    icon: (
      <svg
        className="w-3.5 h-3.5 text-emerald-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
  },
  error: {
    ring: "border-red-500/30",
    icon: (
      <svg
        className="w-3.5 h-3.5 text-red-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0l-7.1 12.25A2 2 0 005 19z"
        />
      </svg>
    ),
  },
};

const DEFAULT_DURATION = 3500;
const MAX_VISIBLE = 4;

let nextId = 0;

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (
        e as // eslint-disable-next-line no-undef
        CustomEvent<{
          title: string;
          body?: string;
          variant?: ToastVariant;
        }>
      ).detail;
      if (!detail || !detail.title) return;
      const id = ++nextId;
      const variant: ToastVariant =
        detail.variant ?? inferVariant(detail.title, detail.body);
      setToasts((prev) => {
        const next = [
          ...prev,
          { id, title: detail.title, body: detail.body, variant },
        ];
        // keep only the most recent MAX_VISIBLE
        return next.slice(-MAX_VISIBLE);
      });
      window.setTimeout(() => dismiss(id), DEFAULT_DURATION);
    };

    window.addEventListener("snapflow-toast", handler);
    return () => window.removeEventListener("snapflow-toast", handler);
  }, [dismiss]);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const style = VARIANT_STYLES[t.variant];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: 4,
                scale: 0.96,
                transition: { duration: 0.15 },
              }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className={`pointer-events-auto min-w-[260px] max-w-sm bg-gray-900 border ${style.ring} rounded-lg shadow-lg shadow-black/40 px-3.5 py-2.5 flex items-start gap-2.5`}
            >
              <div className="flex-shrink-0 mt-0.5">{style.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-100 truncate">
                  {t.title}
                </p>
                {t.body && (
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug break-words">
                    {t.body}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 text-gray-600 hover:text-gray-300 transition-colors -mr-1 -mt-0.5 p-1"
                aria-label="Dismiss notification"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

/**
 * Programmatic toast — call from anywhere in the renderer.
 * Equivalent to dispatching a "snapflow-toast" CustomEvent.
 */
export function showToast(
  title: string,
  body?: string,
  variant?: ToastVariant
): void {
  window.dispatchEvent(
    // eslint-disable-next-line no-undef
    new CustomEvent("snapflow-toast", { detail: { title, body, variant } })
  );
}

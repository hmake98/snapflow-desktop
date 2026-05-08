import React from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary" | "outline";
  };
  className?: string;
  size?: "sm" | "md" | "lg";
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  size = "md",
}) => {
  const sizeConfig = {
    sm: {
      container: "py-8",
      iconSize: "w-12 h-12",
      title: "text-lg",
      description: "text-sm",
      spacing: "space-y-3",
    },
    md: {
      container: "py-16",
      iconSize: "w-16 h-16",
      title: "text-xl",
      description: "text-base",
      spacing: "space-y-4",
    },
    lg: {
      container: "py-24",
      iconSize: "w-20 h-20",
      title: "text-2xl",
      description: "text-lg",
      spacing: "space-y-6",
    },
  };

  const config = sizeConfig[size];

  const defaultIcon = (
    <div
      className={clsx(
        "bg-gray-900 border border-gray-800 rounded-full flex items-center justify-center mx-auto",
        config.iconSize
      )}
    >
      <svg
        className={clsx(
          "text-gray-500",
          size === "sm" ? "w-6 h-6" : size === "md" ? "w-8 h-8" : "w-10 h-10"
        )}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
    </div>
  );

  return (
    <motion.div
      className={clsx("text-center", config.container, className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className={config.spacing}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          {icon || defaultIcon}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="space-y-2"
        >
          <h3 className={clsx("font-semibold text-gray-100", config.title)}>
            {title}
          </h3>
          {description && (
            <p
              className={clsx(
                "text-gray-500 max-w-md mx-auto",
                config.description
              )}
            >
              {description}
            </p>
          )}
        </motion.div>

        {action && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            <Button
              variant={action.variant || "primary"}
              onClick={action.onClick}
              className="animate-bounce-subtle"
            >
              {action.label}
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

// Preset empty states for common scenarios
export const NoSnapsEmptyState: React.FC<{ onCapture?: () => void }> = ({
  onCapture: _onCapture,
}) => {
  const isMac =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
  const mod = isMac ? "⌘" : "Ctrl";
  const alt = isMac ? "⌥" : "Alt";
  const shortcuts: { keys: string; label: string }[] = [
    { keys: `${mod}${alt} + 1`, label: "Capture full screen" },
    { keys: `${mod}${alt} + 2`, label: "Capture current screen" },
    { keys: `${mod}${alt} + A`, label: "Capture area" },
  ];

  return (
    <div className="text-center py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="space-y-7 max-w-md mx-auto"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <svg
              className="w-10 h-10 text-blue-400/80"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="space-y-2"
        >
          <h3 className="text-xl font-semibold text-gray-100">
            Capture your first snap
          </h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Open the SnapFlow tray icon, or use a keyboard shortcut to get
            started.
          </p>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="bg-gray-800/40 border border-gray-700/50 rounded-xl divide-y divide-gray-700/40 text-left overflow-hidden"
        >
          {shortcuts.map((s) => (
            <li
              key={s.keys}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <span className="text-sm text-gray-300">{s.label}</span>
              <kbd className="text-2xs font-mono text-gray-300 bg-gray-900/70 border border-gray-700/60 rounded px-2 py-0.5">
                {s.keys}
              </kbd>
            </li>
          ))}
        </motion.ul>
      </motion.div>
    </div>
  );
};

export const NoResultsEmptyState: React.FC<{ onClearFilters?: () => void }> = ({
  onClearFilters,
}) => (
  <EmptyState
    icon={
      <div className="w-16 h-16 bg-gray-900 border border-gray-800 rounded-full flex items-center justify-center mx-auto">
        <svg
          className="w-8 h-8 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
    }
    title="No results found"
    description="Try adjusting your search terms or filters to find what you're looking for"
    action={
      onClearFilters
        ? {
            label: "Clear Filters",
            onClick: onClearFilters,
            variant: "outline",
          }
        : undefined
    }
    size="sm"
  />
);

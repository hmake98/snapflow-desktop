import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { Button } from "./Button";
import { Badge } from "./Badge";

interface FilterOption {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface FilterBarProps {
  options: FilterOption[];
  activeFilter: string;
  onFilterChange: (filterId: string) => void;
  className?: string;
  variant?: "default" | "pills" | "tabs";
  showCounts?: boolean;
  allowMultiple?: boolean;
  activeFilters?: string[];
  onMultipleFilterChange?: (filterIds: string[]) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  options,
  activeFilter,
  onFilterChange,
  className,
  variant = "default",
  showCounts = true,
  allowMultiple = false,
  activeFilters = [],
  onMultipleFilterChange,
}) => {
  const handleFilterClick = (filterId: string) => {
    if (allowMultiple && onMultipleFilterChange) {
      const newFilters = activeFilters.includes(filterId)
        ? activeFilters.filter((id) => id !== filterId)
        : [...activeFilters, filterId];
      onMultipleFilterChange(newFilters);
    } else {
      onFilterChange(filterId);
    }
  };

  const isActive = (filterId: string) => {
    return allowMultiple
      ? activeFilters.includes(filterId)
      : activeFilter === filterId;
  };

  const renderDefault = () => (
    <div className={clsx("flex flex-wrap gap-2", className)}>
      {options.map((option, index) => (
        <motion.div
          key={option.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.2 }}
        >
          <Button
            variant={isActive(option.id) ? "primary" : "outline"}
            size="sm"
            onClick={() => handleFilterClick(option.id)}
            leftIcon={option.icon}
            className="relative"
          >
            {option.label}
            {showCounts && option.count !== undefined && (
              <Badge
                variant={isActive(option.id) ? "secondary" : "gray"}
                className="ml-2 px-1.5 py-0.5 text-xs"
              >
                {option.count}
              </Badge>
            )}
          </Button>
        </motion.div>
      ))}
    </div>
  );

  const renderPills = () => (
    <div className={clsx("flex flex-wrap gap-1.5", className)}>
      {options.map((option, index) => (
        <motion.button
          key={option.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.03, duration: 0.15 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleFilterClick(option.id)}
          className={clsx(
            "inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
            isActive(option.id)
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
              : "bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 hover:text-gray-100 border border-gray-700/50"
          )}
        >
          {option.icon && (
            <span className="mr-1.5 flex-shrink-0">{option.icon}</span>
          )}
          {option.label}
          {showCounts && option.count !== undefined && (
            <span
              className={clsx(
                "ml-1.5 px-1.5 py-0.5 rounded-full text-xs",
                isActive(option.id)
                  ? "bg-white/20 text-white"
                  : "bg-gray-700/50 text-gray-400"
              )}
            >
              {option.count}
            </span>
          )}
        </motion.button>
      ))}
    </div>
  );

  const renderTabs = () => (
    <div className={clsx("border-b border-gray-800", className)}>
      <nav className="flex space-x-8">
        {options.map((option, index) => (
          <motion.button
            key={option.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.2 }}
            onClick={() => handleFilterClick(option.id)}
            className={clsx(
              "relative py-2 px-1 text-sm font-medium transition-colors duration-200 border-b-2 flex items-center space-x-2",
              isActive(option.id)
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
            )}
          >
            {option.icon && (
              <span className="flex-shrink-0">{option.icon}</span>
            )}
            <span>{option.label}</span>
            {showCounts && option.count !== undefined && (
              <Badge
                variant={isActive(option.id) ? "primary" : "gray"}
                className="text-xs"
              >
                {option.count}
              </Badge>
            )}

            {/* Active indicator */}
            <AnimatePresence>
              {isActive(option.id) && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-blue-500 rounded-full"
                />
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </nav>
    </div>
  );

  switch (variant) {
    case "pills":
      return renderPills();
    case "tabs":
      return renderTabs();
    default:
      return renderDefault();
  }
};

interface SortControlProps {
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSortByChange: (sortBy: string) => void;
  onSortOrderChange: (order: "asc" | "desc") => void;
  options: { value: string; label: string }[];
  className?: string;
}

export const SortControl: React.FC<SortControlProps> = ({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
  options,
  className,
}) => {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <span className="text-sm text-gray-400 font-medium whitespace-nowrap">
        Sort by:
      </span>

      {/* Sort By Buttons */}
      <div className="flex rounded-lg border border-gray-800/50 bg-gray-900 overflow-hidden shadow-sm">
        {options.map((option, index) => (
          <motion.button
            key={option.value}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSortByChange(option.value)}
            className={clsx(
              "px-4 py-2 text-sm font-medium transition-all duration-200 relative",
              "first:rounded-l-lg last:rounded-r-lg",
              sortBy === option.value
                ? "bg-blue-600 text-white shadow-sm z-10"
                : "text-gray-300 hover:text-gray-100 hover:bg-gray-800/50",
              index > 0 && "border-l border-gray-700/50"
            )}
          >
            {option.label}
            {sortBy === option.value && (
              <motion.div
                layoutId="sortByIndicator"
                className="absolute inset-0 bg-blue-600 rounded-lg -z-10"
                initial={false}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      {/* Sort Order Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
        className={clsx(
          "flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-800/50 bg-gray-900 transition-all duration-200 shadow-sm",
          "text-gray-300 hover:text-gray-100 hover:bg-gray-800/50 hover:border-gray-700/50"
        )}
        title={`Currently sorting ${sortOrder === "asc" ? "ascending" : "descending"}. Click to sort ${sortOrder === "asc" ? "descending" : "ascending"}.`}
      >
        <motion.div
          animate={{ rotate: sortOrder === "desc" ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
            />
          </svg>
        </motion.div>
        <span className="text-xs font-medium">
          {sortOrder === "asc" ? "A→Z" : "Z→A"}
        </span>
      </motion.button>
    </div>
  );
};

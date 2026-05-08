import React, { useState, KeyboardEvent } from "react";
import clsx from "clsx";

export interface ChipsInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const ChipsInput = React.forwardRef<HTMLDivElement, ChipsInputProps>(
  (
    { value = [], onChange, placeholder = "Add tag...", className, disabled },
    ref
  ) => {
    const [inputValue, setInputValue] = useState("");

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
        e.preventDefault();
        const newTag = inputValue.trim().replace(/,$/, ""); // Remove trailing comma
        if (newTag && !value.includes(newTag)) {
          onChange([...value, newTag]);
        }
        setInputValue("");
      } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
        e.preventDefault();
        onChange(value.slice(0, -1));
      } else if (e.key === "Escape" && inputValue) {
        e.preventDefault();
        setInputValue("");
      }
    };

    const removeTag = (tagToRemove: string) => {
      onChange(value.filter((tag) => tag !== tagToRemove));
    };

    const handleBlur = () => {
      // Add tag on blur if there's input
      if (inputValue.trim()) {
        const newTag = inputValue.trim();
        if (!value.includes(newTag)) {
          onChange([...value, newTag]);
        }
        setInputValue("");
      }
    };

    return (
      <div
        ref={ref}
        className={clsx(
          "flex flex-wrap gap-1.5 items-center min-h-[40px] rounded-lg border bg-gray-900/40 px-3.5 py-2 text-sm transition-all duration-200",
          "border-gray-700/50 focus-within:border-blue-500/60",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {value.map((tag) => (
          <div
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/15 text-blue-300 rounded-full text-2xs font-medium border border-blue-500/30 animate-in fade-in duration-200"
          >
            <span>{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-blue-100 focus:outline-none transition-colors hover:scale-110"
                aria-label={`Remove ${tag}`}
              >
                <svg
                  className="w-3.5 h-3.5"
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
            )}
          </div>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled}
          className={clsx(
            "flex-1 min-w-[120px] bg-transparent text-gray-300 placeholder:text-gray-500 focus:outline-none",
            disabled && "cursor-not-allowed"
          )}
          aria-label="Tag input"
        />
      </div>
    );
  }
);

ChipsInput.displayName = "ChipsInput";

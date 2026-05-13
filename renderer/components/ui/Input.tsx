import React from "react";
import clsx from "clsx";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, error, helperText, leftIcon, rightIcon, id, ...props },
    ref
  ) => {
    const inputId = id ?? props.name;
    return (
      <div className="form-row w-full">
        {label && (
          <label className="form-label" htmlFor={inputId}>
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            className={clsx(
              "input",
              error && "input-error",
              leftIcon && "pl-9",
              rightIcon && "pr-9",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500">
              {rightIcon}
            </span>
          )}
        </div>
        {error ? (
          <p className="text-xs text-red-400">{error}</p>
        ) : (
          helperText && <p className="form-helper">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

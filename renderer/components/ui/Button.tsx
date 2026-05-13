import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import clsx from "clsx";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-950 disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 focus-visible:ring-blue-500/60",
        secondary:
          "bg-gray-800 text-gray-100 border border-gray-700 hover:bg-gray-700 hover:border-gray-600 active:bg-gray-800 focus-visible:ring-gray-500/60",
        success:
          "bg-green-600 text-white hover:bg-green-500 active:bg-green-700 focus-visible:ring-green-500/60",
        danger:
          "bg-red-600 text-white hover:bg-red-500 active:bg-red-700 focus-visible:ring-red-500/60",
        warning:
          "bg-yellow-500 text-white hover:bg-yellow-400 active:bg-yellow-600 focus-visible:ring-yellow-500/60",
        outline:
          "border border-gray-700 bg-transparent text-gray-200 hover:bg-gray-800 hover:border-gray-600 active:bg-gray-800/80 focus-visible:ring-gray-500/60",
        ghost:
          "bg-transparent text-gray-300 hover:bg-gray-800 hover:text-gray-100 active:bg-gray-800/80 focus-visible:ring-gray-500/60",
      },
      size: {
        xs: "h-7 px-2.5 text-xs",
        sm: "h-8 px-3 text-sm",
        md: "h-9 px-3.5 text-sm",
        lg: "h-10 px-5 text-sm",
        xl: "h-11 px-6 text-base",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Backwards-compat: previously toggled framer-motion animations. Now a no-op. */
  animate?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      isLoading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      animate: _animate,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={clsx(
          buttonVariants({ variant, size, fullWidth, className })
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <svg
            className="h-4 w-4 animate-spin flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
        )}
        {children}
        {rightIcon && !isLoading && (
          <span className="flex-shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import clsx from "clsx";
import { motion } from "framer-motion";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 disabled:pointer-events-none disabled:opacity-50 relative overflow-hidden group",
  {
    variants: {
      variant: {
        primary:
          "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500/50 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40",
        secondary:
          "bg-gray-800 text-gray-100 hover:bg-gray-700 active:bg-gray-600 focus-visible:ring-gray-500/50 shadow-lg shadow-gray-800/25",
        success:
          "bg-green-600 text-white hover:bg-green-700 active:bg-green-800 focus-visible:ring-green-500/50 shadow-lg shadow-green-600/25",
        danger:
          "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500/50 shadow-lg shadow-red-600/25",
        warning:
          "bg-yellow-500 text-white hover:bg-yellow-600 active:bg-yellow-700 focus-visible:ring-yellow-500/50 shadow-lg shadow-yellow-500/25",
        outline:
          "border-2 border-gray-700/50 bg-transparent backdrop-blur-sm text-gray-300 hover:bg-gray-800/50 hover:border-gray-600/50 hover:text-gray-100 focus-visible:ring-gray-500/50 transition-all duration-200",
        ghost:
          "bg-transparent text-gray-300 hover:bg-gray-800/50 hover:text-gray-100 active:bg-gray-700/50 focus-visible:ring-gray-500/50",
      },
      size: {
        xs: "h-7 px-2.5 text-xs",
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-base",
        lg: "h-12 px-6 text-lg",
        xl: "h-14 px-8 text-xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
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
  animate?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      isLoading,
      leftIcon,
      rightIcon,
      children,
      disabled,
      animate = true,
      ...props
    },
    ref
  ) => {
    const buttonClass = clsx(buttonVariants({ variant, size, className }));

    // Filter out props that conflict with framer-motion
    const {
      onDrag: _onDrag,
      onDragEnd: _onDragEnd,
      onDragStart: _onDragStart,
      onDragCapture: _onDragCapture,
      onDragEndCapture: _onDragEndCapture,
      onDragStartCapture: _onDragStartCapture,
      onAnimationStart: _onAnimationStart,
      onAnimationEnd: _onAnimationEnd,
      onAnimationStartCapture: _onAnimationStartCapture,
      onAnimationEndCapture: _onAnimationEndCapture,
      ...safeProps
    } = props;

    const buttonContent = (
      <>
        {/* Shimmer effect */}
        <div className="absolute inset-0 bg-white/0 hover:bg-white/5 transition-all duration-300" />

        {/* Content */}
        <div className="relative flex items-center justify-center">
          {isLoading ? (
            <svg
              className="mr-2 h-4 w-4 animate-spin"
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
          ) : leftIcon ? (
            <span className="mr-2 flex-shrink-0">{leftIcon}</span>
          ) : null}

          {children}

          {rightIcon && !isLoading && (
            <span className="ml-2 flex-shrink-0">{rightIcon}</span>
          )}
        </div>
      </>
    );

    if (animate) {
      return (
        <motion.button
          className={buttonClass}
          ref={ref}
          disabled={disabled || isLoading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          {...safeProps}
        >
          {buttonContent}
        </motion.button>
      );
    }

    return (
      <button
        className={buttonClass}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {buttonContent}
      </button>
    );
  }
);

Button.displayName = "Button";

import React from "react";
import clsx from "clsx";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  interactive?: boolean;
  variant?: "default" | "elevated" | "flat";
  /** Backwards-compat — animations now handled by CSS class .animate-fade-in if needed. */
  animate?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      hover = false,
      interactive = false,
      variant = "default",
      animate: _animate,
      children,
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      default: "rounded-lg border border-gray-800 bg-gray-900",
      elevated:
        "rounded-lg border border-gray-800 bg-gray-900 shadow-lg shadow-black/40",
      flat: "rounded-lg border border-gray-800/70 bg-gray-900/60",
    };

    const hoverClasses =
      hover || interactive
        ? "transition-colors duration-150 hover:border-gray-700 hover:bg-gray-900/80"
        : "";

    const interactiveClasses = interactive ? "cursor-pointer" : "";

    return (
      <div
        ref={ref}
        className={clsx(
          variantClasses[variant],
          hoverClasses,
          interactiveClasses,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={clsx(
      "flex flex-col gap-1 px-5 py-4 border-b border-gray-800",
      className
    )}
    {...props}
  />
));

CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={clsx("text-base font-semibold text-gray-100", className)}
    {...props}
  />
));

CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={clsx("text-xs text-gray-500", className)}
    {...props}
  />
));

CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={clsx("px-5 py-4", className)} {...props} />
));

CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={clsx(
      "flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-800",
      className
    )}
    {...props}
  />
));

CardFooter.displayName = "CardFooter";

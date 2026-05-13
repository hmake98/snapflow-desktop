import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import clsx from "clsx";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-1.5 h-5 text-2xs font-medium",
  {
    variants: {
      variant: {
        primary: "bg-blue-500/10 text-blue-300 border border-blue-500/25",
        secondary:
          "bg-purple-500/10 text-purple-300 border border-purple-500/25",
        success: "bg-green-500/10 text-green-300 border border-green-500/25",
        warning: "bg-yellow-500/10 text-yellow-300 border border-yellow-500/25",
        error: "bg-red-500/10 text-red-300 border border-red-500/25",
        info: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/25",
        gray: "bg-gray-800 text-gray-300 border border-gray-700/60",
      },
    },
    defaultVariants: {
      variant: "gray",
    },
  }
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(badgeVariants({ variant }), className)}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";

import * as React from "react";
import clsx from "clsx";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "framer-motion";

type TimelineColor =
  | "primary"
  | "secondary"
  | "muted"
  | "accent"
  | "destructive"
  | "warning";

// ── Variants ──────────────────────────────────────────────────────────────

const timelineVariants = cva("flex flex-col relative", {
  variants: {
    size: {
      sm: "gap-3",
      md: "gap-5",
      lg: "gap-8",
    },
  },
  defaultVariants: { size: "md" },
});

// ── Timeline ──────────────────────────────────────────────────────────────

interface TimelineProps
  extends
    React.ComponentPropsWithoutRef<"ol">,
    VariantProps<typeof timelineVariants> {
  iconSize?: "sm" | "md" | "lg";
}

const Timeline = React.forwardRef<React.ElementRef<"ol">, TimelineProps>(
  ({ className, iconSize, size, children, ...props }, ref) => {
    const items = React.Children.toArray(children);
    if (items.length === 0) return <TimelineEmpty />;

    return (
      <ol
        ref={ref}
        aria-label="Timeline"
        className={clsx(
          timelineVariants({ size }),
          "relative w-full py-4",
          className
        )}
        {...props}
      >
        {React.Children.map(children, (child, index) => {
          if (
            React.isValidElement(child) &&
            typeof child.type !== "string" &&
            "displayName" in child.type &&
            (child.type as { displayName?: string }).displayName ===
              "TimelineItem"
          ) {
            return React.cloneElement(
              child as React.ReactElement<TimelineItemProps>,
              {
                iconSize,
                showConnector: index !== items.length - 1,
              }
            );
          }
          return child;
        })}
      </ol>
    );
  }
);
Timeline.displayName = "Timeline";

// ── TimelineItem ──────────────────────────────────────────────────────────

interface TimelineItemProps extends Omit<
  HTMLMotionProps<"li">,
  "ref" | "title"
> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  iconColor?: TimelineColor;
  showConnector?: boolean;
  iconSize?: "sm" | "md" | "lg";
}

const TimelineItem = React.forwardRef<
  React.ElementRef<"li">,
  TimelineItemProps
>(
  (
    {
      className,
      title,
      description,
      icon,
      iconColor,
      showConnector = true,
      iconSize,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    },
    ref
  ) => {
    return (
      <motion.li
        ref={ref}
        className={clsx("relative flex gap-4", className)}
        initial={_initial}
        animate={_animate}
        transition={_transition}
        {...props}
      >
        {/* Left column: icon + connector */}
        <div className="flex flex-col items-center flex-shrink-0">
          <TimelineIcon icon={icon} color={iconColor} iconSize={iconSize} />
          {showConnector && <TimelineConnector className="flex-1 mt-2" />}
        </div>

        {/* Right column: content */}
        <div className="flex-1 min-w-0 pb-5">
          {title && (
            <TimelineHeader>
              <TimelineTitle>{title}</TimelineTitle>
            </TimelineHeader>
          )}
          {description && <TimelineContent>{description}</TimelineContent>}
        </div>
      </motion.li>
    );
  }
);
TimelineItem.displayName = "TimelineItem";

// ── TimelineConnector ─────────────────────────────────────────────────────

const TimelineConnector = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    status?: "completed" | "in-progress" | "pending";
    color?: TimelineColor;
  }
>(({ className, status = "completed", color, ...props }, ref) => (
  <div
    ref={ref}
    className={clsx(
      "w-px min-h-[16px]",
      {
        "bg-gray-700": !color && status === "completed",
        "bg-gray-800": !color && status === "pending",
        "bg-blue-500/50": color === "primary",
        "bg-gray-600": color === "muted",
      },
      className
    )}
    {...props}
  />
));
TimelineConnector.displayName = "TimelineConnector";

// ── TimelineIcon ──────────────────────────────────────────────────────────

const iconSizeMap = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

const iconInnerSizeMap = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

const iconColorMap: Record<string, string> = {
  primary: "bg-blue-600 text-white",
  secondary: "bg-gray-700 text-gray-200",
  muted: "bg-gray-800 text-gray-400",
  accent: "bg-indigo-600 text-white",
  destructive: "bg-red-600 text-white",
  warning: "bg-amber-600/80 text-white",
};

const TimelineIcon = ({
  icon,
  color = "muted",
  iconSize = "md",
}: {
  icon?: React.ReactNode;
  color?: TimelineColor;
  iconSize?: "sm" | "md" | "lg";
}) => (
  <div
    className={clsx(
      "relative flex items-center justify-center rounded-full ring-4 ring-gray-950 z-10 flex-shrink-0",
      iconSizeMap[iconSize],
      iconColorMap[color] ?? iconColorMap.muted
    )}
  >
    {icon ? (
      <div
        className={clsx(
          "flex items-center justify-center",
          iconInnerSizeMap[iconSize]
        )}
      >
        {icon}
      </div>
    ) : (
      <div
        className={clsx(
          "rounded-full bg-current opacity-70",
          iconInnerSizeMap[iconSize]
        )}
      />
    )}
  </div>
);

// ── TimelineHeader / Title / Content / Description ────────────────────────

const TimelineHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={clsx("flex items-center gap-2 mb-1", className)}
    {...props}
  />
));
TimelineHeader.displayName = "TimelineHeader";

const TimelineTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={clsx(
      "text-xs font-semibold text-gray-200 leading-none tracking-tight",
      className
    )}
    {...props}
  >
    {children}
  </h3>
));
TimelineTitle.displayName = "TimelineTitle";

const TimelineContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={clsx("flex flex-col gap-1.5", className)}
    {...props}
  />
));
TimelineContent.displayName = "TimelineContent";

const TimelineDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={clsx("text-xs text-gray-500", className)}
    {...props}
  />
));
TimelineDescription.displayName = "TimelineDescription";

const TimelineEmpty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={clsx(
      "flex flex-col items-center justify-center p-8 text-center",
      className
    )}
    {...props}
  >
    <p className="text-sm text-gray-500">{children ?? "No items to display"}</p>
  </div>
));
TimelineEmpty.displayName = "TimelineEmpty";

// ── Animated wrapper ──────────────────────────────────────────────────────

interface TimelineLayoutProps {
  children: React.ReactNode;
  animate?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  iconSize?: "sm" | "md" | "lg";
}

const TimelineLayout = ({
  children,
  animate = true,
  className,
  size = "sm",
  iconSize = "sm",
}: TimelineLayoutProps) => {
  const items = React.Children.toArray(children);
  return (
    <Timeline size={size} iconSize={iconSize} className={className}>
      {items.map((child, index) => {
        if (!animate || !React.isValidElement(child)) {
          return <React.Fragment key={index}>{child}</React.Fragment>;
        }

        return React.cloneElement(child, {
          key: child.key ?? index,
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.25,
            delay: index * 0.06,
            ease: "easeOut",
          },
        } as Partial<TimelineItemProps>);
      })}
    </Timeline>
  );
};

export {
  Timeline,
  TimelineLayout,
  TimelineItem,
  TimelineConnector,
  TimelineHeader,
  TimelineTitle,
  TimelineIcon,
  TimelineDescription,
  TimelineContent,
  TimelineEmpty,
};

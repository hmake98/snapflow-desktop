import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./Tooltip";

export const ZOHO_UNAVAILABLE_MESSAGE = "Zoho isn't set up in this app.";

// Disabled controls swallow pointer events, so the trigger is a wrapping span.
export function ZohoUnavailable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={className ?? "inline-flex"}>
            <span className="pointer-events-none opacity-50 inline-flex w-full">
              {children}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="px-2 py-1 text-xs">
          {ZOHO_UNAVAILABLE_MESSAGE}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

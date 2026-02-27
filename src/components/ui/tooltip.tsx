import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  side?: "top" | "bottom";
  className?: string;
}

export function Tooltip({ children, content, side = "top", className }: TooltipProps) {
  return (
    <div className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1a1a2e] px-2.5 py-1 text-xs font-medium text-white shadow-lg",
          "opacity-0 scale-90 transition-all duration-150 ease-out group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100",
          side === "top" && "bottom-full mb-2",
          side === "bottom" && "top-full mt-2"
        )}
      >
        {content}
        {/* Arrow */}
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2 border-4 border-transparent",
            side === "top" && "top-full border-t-[#1a1a2e]",
            side === "bottom" && "bottom-full border-b-[#1a1a2e]"
          )}
        />
      </span>
    </div>
  );
}

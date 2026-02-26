import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative animate-pulse rounded-md bg-border overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="shimmer-overlay" />
    </div>
  );
}

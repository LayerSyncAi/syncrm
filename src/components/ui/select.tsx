import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, disabled, ...props }, ref) => (
    <select
      ref={ref}
      disabled={disabled}
      className={cn(
        "h-10 w-full rounded-[10px] border border-border-strong bg-transparent px-3 text-sm text-text outline-none transition-all duration-150 focus:border-primary-600 focus:ring-4 focus:ring-[var(--primary-glow)]",
        disabled &&
          "bg-gray-100 text-text-muted cursor-default focus:ring-0 focus:border-border-strong",
        className
      )}
      {...props}
    />
  )
);

Select.displayName = "Select";

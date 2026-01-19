import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[10px] border border-border-strong bg-transparent px-3 text-sm text-text outline-none transition duration-150 focus:ring-4 focus:ring-[rgba(59,130,246,0.18)]",
        className
      )}
      {...props}
    />
  )
);

Select.displayName = "Select";

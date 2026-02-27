import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, readOnly, disabled, ...props }, ref) => (
    <input
      ref={ref}
      readOnly={readOnly}
      disabled={disabled}
      className={cn(
        "h-10 w-full rounded-[10px] border bg-transparent px-3 text-sm text-text outline-none transition duration-150 placeholder:text-text-dim focus:ring-4",
        error
          ? "border-danger focus:ring-danger/20"
          : "border-border-strong focus:border-primary-600 focus:ring-[var(--primary-glow)]",
        (readOnly || disabled) &&
          "bg-gray-100 text-text-muted cursor-default focus:ring-0 focus:border-border-strong",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";

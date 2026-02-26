import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[120px] w-full rounded-[10px] border border-border-strong bg-transparent px-3 py-2 text-sm text-text outline-none transition-all duration-150 placeholder:text-text-dim focus:border-primary-600 focus:ring-4 focus:ring-[var(--primary-glow)]",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

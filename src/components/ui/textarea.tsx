import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[120px] w-full rounded-[10px] border border-border-strong bg-transparent px-3 py-2 text-sm text-text outline-none transition duration-150 placeholder:text-text-dim focus:ring-4 focus:ring-[rgba(59,130,246,0.18)]",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

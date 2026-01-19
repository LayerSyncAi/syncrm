import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
}

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-primary-600 text-white hover:bg-primary shadow-[0_0_0_4px_rgba(59,130,246,0.18)]",
  secondary:
    "border border-border-strong text-text hover:border-primary/60",
  ghost: "text-text-muted hover:text-text",
  destructive: "bg-danger text-white hover:bg-danger/90",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium transition duration-150",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";

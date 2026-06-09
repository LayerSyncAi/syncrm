import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "neutral"
    | "neutralStrong";
}

// Soft tinted backgrounds + AA-contrast foregrounds, driven by status tokens.
const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default:
    "bg-primary-600/10 text-primary-600 border-primary-600/20",
  success:
    "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-transparent",
  warning:
    "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-transparent",
  danger:
    "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)] border-transparent",
  info:
    "bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-transparent",
  neutral:
    "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-transparent",
  neutralStrong:
    "bg-[var(--status-neutral-strong-bg)] text-[var(--status-neutral-strong-fg)] border-transparent",
  // Back-compat alias: existing call sites pass "secondary".
  secondary:
    "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)] border-transparent",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

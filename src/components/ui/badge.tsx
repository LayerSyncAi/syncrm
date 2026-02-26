import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "danger";
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default:
    "bg-primary-600/10 text-primary-600 border-primary-600/20",
  secondary:
    "bg-gray-100 text-gray-600 border-gray-200",
  success:
    "bg-green-100 text-green-700 border-green-200",
  warning:
    "bg-amber-100 text-amber-700 border-amber-200",
  danger:
    "bg-red-100 text-red-700 border-red-200",
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

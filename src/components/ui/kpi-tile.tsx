import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTone = "default" | "good" | "warning" | "danger";

const toneClass: Record<KpiTone, string> = {
  default: "text-text",
  good: "text-[var(--status-success-fg)]",
  warning: "text-[var(--status-warning-fg)]",
  danger: "text-[var(--status-danger-fg)]",
};

/**
 * A headline figure: small label, large light number, an optional note beside
 * it, and an optional bar showing how far along it is (0 to 1). Used for the
 * KPI rows on every dashboard.
 */
export function KpiTile({
  label,
  value,
  note,
  hint,
  tone = "default",
  meter,
  icon: Icon,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Short text set beside the figure, such as "+6 this month". */
  note?: React.ReactNode;
  hint?: React.ReactNode;
  tone?: KpiTone;
  /** Fraction filled, 0 to 1. Leave out for no bar. */
  meter?: number;
  icon?: LucideIcon;
  href?: string;
  className?: string;
}) {
  const filled = meter === undefined ? null : Math.max(0, Math.min(1, meter));
  // Amounts in two currencies ("USD 2,950 · ZiG 45,000") get a smaller size
  // so they stay on one or two tidy lines.
  const long = typeof value === "string" && value.length > 12;
  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-[20px] border border-border bg-card-bg p-5 shadow-[var(--shadow-card)] transition-colors",
        href && "hover:border-border-strong",
        className
      )}
    >
      <p className="flex items-center gap-1.5 text-eyebrow text-text-muted">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </p>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            "break-words font-light tracking-[-0.04em] tabular-nums",
            long ? "text-[1.375rem] leading-tight sm:text-2xl" : "text-[clamp(1.5rem,3.2vw,2.125rem)] leading-none",
            toneClass[tone]
          )}
        >
          {value}
        </span>
        {note && <span className={cn("text-xs font-semibold", tone === "default" ? "text-primary-ink" : toneClass[tone])}>{note}</span>}
      </div>
      {filled !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          <div
            className={cn("h-full rounded-full", tone === "danger" ? "bg-[var(--hot)]" : "bg-primary")}
            style={{ width: `${filled * 100}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-auto text-xs text-text-muted">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

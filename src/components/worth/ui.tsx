"use client";

/** Small building blocks shared by the SyncWorth pages. */
import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, STATUS_LABELS, formatDay } from "@/lib/worth/format";
import type { WorthStatus } from "../../../convex/worth/lib";

export function StatusBadge({ status }: { status: WorthStatus }) {
  return <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function DueText({ dueDate, flag }: { dueDate: string; flag?: "overdue" | "due_soon" | null }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap",
        flag === "overdue" && "font-medium text-danger",
        flag === "due_soon" && "font-medium text-[var(--status-warning-fg)]"
      )}
    >
      {formatDay(dueDate)}
      {flag === "overdue" ? " (overdue)" : flag === "due_soon" ? " (due soon)" : ""}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="space-y-2">
      {back && (
        <Link href={back.href} className="text-sm text-text-muted hover:text-text">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-h1 break-words">{title}</h1>
          {description && <div className="text-sm text-text-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h3">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

export function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="flex items-center gap-1">
        {label}
        {required && <span className="text-danger">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-text-dim">{hint}</p>}
    </div>
  );
}

export function KeyValues({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium text-text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm">{v || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warning";
  icon?: LucideIcon;
  href?: string;
}) {
  const body = (
    <Card className={cn("h-full p-4", href && "transition-colors hover:border-primary/60")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-muted">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-text-dim" aria-hidden="true" />}
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "warning" && "text-[var(--status-warning-fg)]",
          tone === "good" && "text-[var(--status-success-fg)]"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-text-dim">{hint}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; badge?: string | number }>;
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <div className="flex min-w-max gap-1 border-b border-border px-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={value === t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              value === t.key
                ? "border-primary-600 text-text"
                : "border-transparent text-text-muted hover:text-text"
            )}
          >
            {t.label}
            {t.badge !== undefined && t.badge !== "" && (
              <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs text-text-muted">{t.badge}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[10px] border border-border-strong px-3 text-sm has-[:checked]:border-primary-600 has-[:checked]:bg-primary-600/5">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{message}</div>;
}

/** Number input value as a number, or undefined when blank. */
export function numOrUndef(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function numStr(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

export const worthToast = {
  done: (title: string, description?: string) => animatedToast.success(title, { description }),
  failed: (error: unknown, title = "Something went wrong") =>
    animatedToast.error(title, { description: getErrorMessage(error) }),
};

/** Run a mutation with a toast on failure; returns whether it succeeded. */
export async function attempt(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await fn();
    if (success) worthToast.done(success);
    return true;
  } catch (e) {
    worthToast.failed(e);
    return false;
  }
}

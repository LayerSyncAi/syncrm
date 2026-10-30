import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Title row used on every Stay page. */
export function StayPageHeader({
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
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
          <ChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-h1 break-words">{title}</h1>
          {description && <p className="text-sm text-text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A labelled figure tile. */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "good" | "warning" | "danger";
  href?: string;
}) {
  const toneClass =
    tone === "good" ? "text-[var(--status-success-fg)]" : tone === "warning" ? "text-[var(--status-warning-fg)]" : tone === "danger" ? "text-danger" : "text-text";
  const body = (
    <div className="h-full rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4 transition-colors hover:border-primary/50">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-2 text-xl font-semibold leading-tight break-words ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
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

/** A bordered section with a heading. */
export function Section({
  title,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Label and value pairs in a responsive grid. */
export function Facts({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-text-muted">{i.label}</dt>
          <dd className="mt-0.5 text-sm break-words">{i.value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{message}</div>;
}

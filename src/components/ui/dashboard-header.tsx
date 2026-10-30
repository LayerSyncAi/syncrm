import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The top of a module dashboard: a small label (date or scope), a title, a
 * one-line summary in plain words, and the main actions. Actions show on
 * desktop only; on phones the main one floats as a PhoneMainAction.
 */
export function DashboardHeader({
  eyebrow,
  title,
  summary,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Null while the figures it describes are loading. */
  summary?: React.ReactNode | null;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl space-y-2">
        {eyebrow && <p className="text-eyebrow text-text-muted">{eyebrow}</p>}
        <h1 className="text-display">{title}</h1>
        {summary === null ? (
          <Skeleton className="h-5 w-80 max-w-full" />
        ) : summary ? (
          <p className="text-[15px] leading-relaxed text-text-muted">{summary}</p>
        ) : null}
      </div>
      {actions && <div className="hidden flex-wrap items-center gap-2 md:flex">{actions}</div>}
    </header>
  );
}

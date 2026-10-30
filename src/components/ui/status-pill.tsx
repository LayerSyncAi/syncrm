import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type PillTone = "good" | "hot" | "warm" | "cold" | "ink";

const dot: Record<PillTone, string> = {
  good: "bg-primary",
  hot: "bg-[var(--hot)]",
  warm: "bg-[var(--warm)]",
  cold: "bg-[var(--cold)]",
  ink: "bg-[var(--text)]",
};

/** A one-line status in a page header, as in "● 6 new leads this month". */
export function StatusPill({
  tone = "good",
  href,
  children,
}: {
  tone?: PillTone;
  href?: string;
  children: React.ReactNode;
}) {
  const cls = cn(
    "inline-flex min-h-10 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full border border-border bg-card-bg px-4 py-2 text-sm text-text",
    href && "transition-colors hover:bg-surface-2"
  );
  const body = (
    <>
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot[tone])} aria-hidden="true" />
      <span>{children}</span>
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

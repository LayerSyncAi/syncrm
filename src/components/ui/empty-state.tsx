import * as React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * A teaching empty state: icon + what this surface is for + a way forward.
 * Use instead of a bare "No results" string.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-border-strong bg-card-bg px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-text-muted">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-h3">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

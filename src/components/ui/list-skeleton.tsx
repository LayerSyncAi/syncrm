import { Skeleton } from "./skeleton";

/**
 * Loading placeholder for list/table content. Reserves the row layout so
 * content doesn't jump in, instead of a centered spinner over empty space.
 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="space-y-1 overflow-hidden rounded-[12px] border border-border-strong bg-card-bg"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[rgba(148,163,184,0.1)] px-4 py-3 last:border-0">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

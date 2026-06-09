"use client";

import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  /** Zero-indexed current page. */
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  /** Jump to a zero-indexed page. */
  onGoToPage?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

const DEFAULT_OPTIONS = [10, 25, 50, 100];

/** Build a compact page list with ellipses, e.g. [1, "…", 4, 5, 6, "…", 20]. */
function pageItems(current: number, total: number): (number | "ellipsis")[] {
  const delta = 1;
  const pages: number[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    }
  }
  const out: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of pages) {
    if (prev) {
      if (p - prev === 2) out.push(prev + 1);
      else if (p - prev > 2) out.push("ellipsis");
    }
    out.push(p);
    prev = p;
  }
  return out;
}

const navBtn =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-[8px] border border-border-strong px-2 text-sm text-text-muted transition-colors hover:border-primary/60 hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:text-text-muted";

export const PaginationControls = React.memo(function PaginationControls({
  page,
  pageSize,
  totalCount,
  hasMore,
  onNextPage,
  onPrevPage,
  onGoToPage,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_OPTIONS,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const current = page + 1; // 1-indexed for display
  const showSizeSelector = Boolean(onPageSizeChange) && totalCount > pageSizeOptions[0];
  const showPageNav = totalPages > 1;

  if (!showSizeSelector && !showPageNav) return null;

  const start = totalCount === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalCount);
  const canPrev = page > 0;
  const canNext = hasMore && current < totalPages;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        {showSizeSelector && (
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              className="h-8 cursor-pointer rounded-[8px] border border-border-strong bg-card-bg px-2 text-sm text-text outline-none transition-colors hover:border-primary/60 focus-visible:border-primary"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-sm tabular-nums text-text-muted">
          {start}–{end} of {totalCount}
        </p>
      </div>

      {showPageNav && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={navBtn}
            onClick={() => onGoToPage?.(0)}
            disabled={!canPrev || !onGoToPage}
            aria-label="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={navBtn}
            onClick={onPrevPage}
            disabled={!canPrev}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Compact on mobile: "Page X of Y". Numbered buttons on sm+. */}
          <span className="px-2 text-sm tabular-nums text-text-muted sm:hidden">
            {current} / {totalPages}
          </span>

          {onGoToPage && (
            <div className="hidden items-center gap-1.5 sm:flex">
              {pageItems(current, totalPages).map((item, i) =>
                item === "ellipsis" ? (
                  <span key={`e${i}`} className="px-1 text-sm text-text-dim" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onGoToPage(item - 1)}
                    aria-label={`Page ${item}`}
                    aria-current={item === current ? "page" : undefined}
                    className={cn(
                      navBtn,
                      item === current &&
                        "border-primary bg-primary text-white hover:border-primary hover:text-white"
                    )}
                  >
                    {item}
                  </button>
                )
              )}
            </div>
          )}

          <button
            type="button"
            className={navBtn}
            onClick={onNextPage}
            disabled={!canNext}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={navBtn}
            onClick={() => onGoToPage?.(totalPages - 1)}
            disabled={!canNext || !onGoToPage}
            aria-label="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
});

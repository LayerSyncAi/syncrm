"use client";

import React from "react";
import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export const PaginationControls = React.memo(function PaginationControls({
  page,
  pageSize,
  totalCount,
  hasMore,
  onNextPage,
  onPrevPage,
}: PaginationControlsProps) {
  if (totalCount <= pageSize) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <p className="text-sm text-text-muted">
        Showing {start}–{end} of {totalCount}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPrevPage}
          disabled={page === 0}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onNextPage}
          disabled={!hasMore}
        >
          Next
        </Button>
      </div>
    </div>
  );
});

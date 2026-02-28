"use client";

import { useState, useCallback, useMemo } from "react";

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function usePagination(pageSize: number = 50) {
  const [page, setPage] = useState(0);

  const nextPage = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const goToPage = useCallback((n: number) => {
    setPage(Math.max(0, n));
  }, []);

  const resetPage = useCallback(() => {
    setPage(0);
  }, []);

  return useMemo(
    () => ({ page, pageSize, nextPage, prevPage, goToPage, resetPage }),
    [page, pageSize, nextPage, prevPage, goToPage, resetPage]
  );
}

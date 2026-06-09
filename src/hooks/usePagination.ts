"use client";

import { useState, useCallback, useMemo } from "react";

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function usePagination(initialPageSize: number = 25) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

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

  // Changing the page size resets to the first page so the user isn't left
  // on a page index that no longer exists.
  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(0);
  }, []);

  return useMemo(
    () => ({ page, pageSize, nextPage, prevPage, goToPage, resetPage, setPageSize }),
    [page, pageSize, nextPage, prevPage, goToPage, resetPage, setPageSize]
  );
}

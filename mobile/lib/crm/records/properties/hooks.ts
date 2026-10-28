import { useEffect, useRef, useState } from "react";

/** The value after it has stopped changing for `ms`, for search boxes. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return out;
}

/**
 * Keep showing the last result while a query with new arguments loads, so a
 * list does not flash to a spinner on every filter change or "load more".
 */
export function useLatest<T>(value: T | undefined): T | undefined {
  const last = useRef<T | undefined>(value);
  if (value !== undefined) last.current = value;
  return last.current;
}

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pull to refresh for live Convex lists. Queries already update on their own,
 * so the gesture only needs to confirm; a short spinner shows it was heard.
 */
export function useRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);
  return { refreshing, onRefresh };
}

/** Effective admin, as the website decides it: an admin not in Agent Mode. */
export function isEffectiveAdmin(user: { role?: string; agentMode?: boolean } | null | undefined): boolean {
  return user?.role === "admin" && !user?.agentMode;
}

/** A value that settles after the user stops typing. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Keep showing the last result while a query reloads with new arguments, so a
 * search box above a list is not unmounted on every keystroke.
 */
export function useSticky<T>(value: T | undefined): T | undefined {
  const last = useRef(value);
  if (value !== undefined) last.current = value;
  return last.current;
}

import { useEffect, useState } from "react";
import { useSession } from "../session";

/** The value after it has stopped changing for `ms`, for search boxes. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Pull-to-refresh for live Convex lists. Queries already update themselves,
 * so the gesture only confirms with a short spinner.
 */
export function useRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };
  return { refreshing, onRefresh };
}

/** A typed whole number, or undefined when blank, or NaN when not a number. */
export function parseWhole(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const n = Number(s.trim());
  return Number.isInteger(n) ? n : NaN;
}

/** A director (admin not in agent mode), as the website's useRequireAuth().isAdmin. */
export function useIsDirector(): boolean {
  const { user } = useSession();
  return user?.role === "admin" && !user.agentMode;
}

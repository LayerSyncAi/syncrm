"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every `intervalMs` (default one minute), for "3 days left" style labels. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

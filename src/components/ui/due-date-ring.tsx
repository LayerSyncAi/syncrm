"use client";

import { useState, useEffect } from "react";

/**
 * Adaptive tick hook — forces a re-render on an interval that scales
 * with how close the deadline is. No API calls, just local arithmetic.
 *
 *  < 1 h remaining  → tick every 15 s
 *  1–24 h remaining → tick every 60 s
 *  > 24 h remaining → tick every 5 min
 */
function useTick(scheduledAt: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const remaining = scheduledAt - Date.now();
    const interval =
      remaining < 3_600_000 ? 15_000 :
      remaining < 86_400_000 ? 60_000 :
      300_000;
    const id = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(id);
  }, [scheduledAt]);
}

export function DueDateRing({ scheduledAt, createdAt }: { scheduledAt: number; createdAt: number }) {
  useTick(scheduledAt);

  const now = Date.now();
  const total = scheduledAt - createdAt;
  const elapsed = now - createdAt;
  const progress = total > 0 ? Math.min(Math.max(elapsed / total, 0), 1) : 1;
  const r = 9;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  const color =
    progress >= 1 ? "var(--danger)" : progress >= 0.75 ? "var(--warning)" : "var(--info)";

  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
      <circle cx="11" cy="11" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
      <circle
        cx="11"
        cy="11"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 11 11)"
        className="transition-all duration-700"
      />
    </svg>
  );
}

"use client";

import { useSyncExternalStore, useCallback } from "react";

/**
 * Shared tick bus — one setInterval per tick-rate bucket, shared across
 * all mounted DueDateRing instances. 1000 rings = still only 3 timers max.
 *
 * Buckets:
 *  15 s  — tasks due in < 1 h
 *  60 s  — tasks due in 1–24 h
 *  5 min — tasks due in > 24 h
 */
const tickBus = new Map<number, { count: number; subscribers: Set<() => void>; timer: ReturnType<typeof setInterval> | null }>();

function subscribe(intervalMs: number, cb: () => void) {
  let bucket = tickBus.get(intervalMs);
  if (!bucket) {
    bucket = { count: 0, subscribers: new Set(), timer: null };
    tickBus.set(intervalMs, bucket);
  }
  bucket.subscribers.add(cb);

  // Start the shared timer if this is the first subscriber
  if (bucket.subscribers.size === 1) {
    bucket.timer = setInterval(() => {
      bucket!.count++;
      bucket!.subscribers.forEach((fn) => fn());
    }, intervalMs);
  }

  return () => {
    bucket!.subscribers.delete(cb);
    // Stop the timer when the last subscriber leaves
    if (bucket!.subscribers.size === 0 && bucket!.timer !== null) {
      clearInterval(bucket!.timer);
      bucket!.timer = null;
      bucket!.count = 0;
      tickBus.delete(intervalMs);
    }
  };
}

function getIntervalForDeadline(scheduledAt: number) {
  const remaining = scheduledAt - Date.now();
  return remaining < 3_600_000 ? 15_000 : remaining < 86_400_000 ? 60_000 : 300_000;
}

function useTick(scheduledAt: number) {
  const intervalMs = getIntervalForDeadline(scheduledAt);
  const sub = useCallback((cb: () => void) => subscribe(intervalMs, cb), [intervalMs]);
  const snap = useCallback(() => tickBus.get(intervalMs)?.count ?? 0, [intervalMs]);
  useSyncExternalStore(sub, snap, snap);
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

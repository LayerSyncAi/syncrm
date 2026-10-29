"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Bell } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { notificationModuleName, relativeTime } from "@/components/hub/format";

/** In-app notification centre. Separate from the browser push toggle. */
export function NotificationBell() {
  const router = useRouter();
  const unread = useQuery(api.notifications.unreadCount) ?? 0;
  const [open, setOpen] = useState(false);
  // Only subscribe to the list while the menu is open.
  const items = useQuery(api.notifications.listMine, open ? { limit: 20 } : "skip");
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label={unread > 0 ? `Notifications, ${unread > 99 ? "99+" : unread} unread` : "Notifications"}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-border-strong text-text-muted transition hover:border-primary/60 hover:text-text"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-[18px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-[12px] border border-border-strong bg-card-bg shadow-[0_10px_28px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Notifications</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push("/app/hub/alerts");
                }}
                className="text-xs font-medium text-text-muted hover:text-text"
              >
                Email alerts
              </button>
              <button
                type="button"
                disabled={unread === 0}
                onClick={() => markAllRead().catch(() => {})}
                className="text-xs font-medium text-primary disabled:text-text-dim"
              >
                Mark all read
              </button>
            </div>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {items === undefined ? (
              <p className="px-4 py-6 text-center text-sm text-text-muted">Loading...</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-text-muted">You are all caught up.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => {
                    if (!n.readAt) markRead({ notificationId: n._id }).catch(() => {});
                    setOpen(false);
                    if (n.href) router.push(n.href);
                  }}
                  className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-row-hover"
                >
                  <span
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")}
                    aria-label={n.readAt ? undefined : "Unread"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.readAt && "font-medium")}>{n.title}</p>
                    {n.body && <p className="line-clamp-2 text-xs text-text-muted">{n.body}</p>}
                    <p className="mt-0.5 text-xs text-text-dim">
                      {notificationModuleName(n.module)} · {relativeTime(n.createdAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

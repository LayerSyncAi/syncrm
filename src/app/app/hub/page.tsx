"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bell, CircleCheck, Sun } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { ModuleCards } from "@/components/hub/module-cards";
import { notificationModuleName, relativeTime } from "@/components/hub/format";
import { MODULES, type ModuleKey } from "@/config/modules";
import { cn } from "@/lib/utils";
import type { HubFigure } from "../../../../convex/lib/modules";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

type Attention = HubFigure & { module: ModuleKey };

export default function HubPage() {
  const router = useRouter();
  const { user } = useAuth();
  const hub = useQuery(api.hub.getContext);
  const mine = hub?.myModules ?? [];

  const crm = useQuery(api.hub.crmSummary, mine.includes("crm") ? {} : "skip");
  const stay = useQuery(api.stay.dashboard.hubSummary, mine.includes("stay") ? {} : "skip");
  const worth = useQuery(api.worth.dashboard.hubSummary, mine.includes("worth") ? {} : "skip");
  const finance = useQuery(api.finance.reports.hubSummary, mine.includes("finance") ? {} : "skip");
  const dev = useQuery(api.dev.dashboard.hubSummary, mine.includes("dev") ? {} : "skip");
  const notifications = useQuery(api.notifications.listMine, { limit: 5 });
  const markRead = useMutation(api.notifications.markRead);

  // Platform staff with no organisation open have no Hub.
  useEffect(() => {
    if (hub === null && user?.isPlatformAdmin && !user.orgId && !user.platformViewOrgId) {
      router.replace("/app/platform");
    }
  }, [hub, user, router]);

  if (hub === undefined || hub === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-[20px]" />
          ))}
        </div>
      </div>
    );
  }

  const figures = { crm, stay, worth, finance, dev };
  const firstName = (user?.fullName || user?.name || "").split(" ")[0];

  // Anything a module flags as a warning (arrears, overdue, expiring) needs
  // attention. The modules decide; the Hub only gathers them in one list.
  const attention: Attention[] = (Object.keys(figures) as Array<keyof typeof figures>).flatMap((key) =>
    mine.includes(key) ? (figures[key] ?? []).filter((f) => f.tone === "warning").map((f) => ({ ...f, module: key })) : []
  );
  const newLeads = crm?.find((f) => f.label === "New leads this month");
  const pipeline = crm?.find((f) => f.label === "Deals in pipeline")?.value;

  const opening = pipeline && pipeline !== "0"
    ? `${hub.orgName} has ${pipeline} deal${pipeline === "1" ? "" : "s"} in the pipeline`
    : `Here is ${hub.orgName} at a glance`;
  const summary = attention.length
    ? `${opening}, and ${attention.length} thing${attention.length === 1 ? " needs" : "s need"} your attention.`
    : `${opening}. Nothing needs your attention right now.`;

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <p className="flex items-center gap-2 text-eyebrow text-text-muted">
          <Sun className="h-3.5 w-3.5" aria-hidden="true" />
          {today}
        </p>
        <h1 className="text-display">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-text-muted">{summary}</p>
        {(newLeads || attention.length > 0) && (
          // One row on phones that scrolls sideways; wraps on wider screens.
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {newLeads && (
              <StatusPill tone="good" href={newLeads.href}>
                {newLeads.value} new lead{newLeads.value === "1" ? "" : "s"} this month
              </StatusPill>
            )}
            {attention.slice(0, 3).map((a) => (
              <StatusPill key={`${a.module}-${a.label}`} tone="hot" href={a.href}>
                {a.label}: {a.value}
              </StatusPill>
            ))}
          </div>
        )}
      </header>

      <ModuleCards myModules={hub.myModules} enabledModules={hub.enabledModules} isAdmin={hub.isAdmin} figures={figures} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card className="p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-h3">Needs attention</h2>
              <p className="text-xs text-text-muted">Across every module you use</p>
            </div>
            {attention.length > 0 && (
              <span className="rounded-full bg-[var(--hot-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--hot-ink)]">
                {attention.length} item{attention.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 py-4 text-sm text-text-muted">
              <CircleCheck className="h-4 w-4 text-primary-ink" aria-hidden="true" />
              All clear. Nothing is overdue or behind.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((a) => {
                const def = MODULES[a.module];
                const Icon = def.icon;
                const row = (
                  <div className="flex items-center gap-3 py-3">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]", def.accent)}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.label}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {def.name}
                        {a.hint ? ` · ${a.hint}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--status-warning-bg)] px-2.5 py-0.5 text-xs font-medium tabular-nums text-[var(--status-warning-fg)]">
                      {a.value}
                    </span>
                  </div>
                );
                return (
                  <li key={`${a.module}-${a.label}`}>
                    {a.href ? (
                      <Link href={a.href} className="-mx-2 block rounded-[12px] px-2 hover:bg-row-hover">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3">
            <h2 className="text-h3">Recent activity</h2>
            <p className="text-xs text-text-muted">Your latest notifications</p>
          </div>
          {notifications === undefined ? (
            <Skeleton className="h-32 w-full rounded-[12px]" />
          ) : notifications.length === 0 ? (
            <p className="flex items-center gap-2 py-4 text-sm text-text-muted">
              <Bell className="h-4 w-4" aria-hidden="true" />
              No notifications yet. Alerts from every module appear here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const body = (
                  <div className="flex items-start gap-3 py-3">
                    <span
                      className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-border-strong" : "bg-primary")}
                      aria-label={n.readAt ? undefined : "Unread"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && <p className="truncate text-xs text-text-muted">{n.body}</p>}
                    </div>
                    <p className="shrink-0 text-xs text-text-dim">
                      {notificationModuleName(n.module)} · {relativeTime(n.createdAt)}
                    </p>
                  </div>
                );
                return (
                  <li key={n._id}>
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => {
                          if (!n.readAt) markRead({ notificationId: n._id }).catch(() => {});
                        }}
                        className="-mx-2 block rounded-[12px] px-2 hover:bg-row-hover"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

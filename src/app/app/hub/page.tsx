"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bell } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ModuleCards } from "@/components/hub/module-cards";
import { FigureTiles } from "@/components/hub/figure-tiles";
import { notificationModuleName, relativeTime } from "@/components/hub/format";
import { MODULES } from "@/config/modules";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

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
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-[12px]" />
          ))}
        </div>
      </div>
    );
  }

  const firstName = (user?.fullName || user?.name || "").split(" ")[0];
  const sections = [
    { key: "crm" as const, figures: crm },
    { key: "stay" as const, figures: stay },
    { key: "worth" as const, figures: worth },
    { key: "finance" as const, figures: finance },
    { key: "dev" as const, figures: dev },
  ].filter((s) => mine.includes(s.key) && s.figures && s.figures.length > 0);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-h1">SyncEstate</h1>
        <p className="text-sm text-text-muted">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}. Here is {hub.orgName} at a glance.
        </p>
      </div>

      <ModuleCards myModules={hub.myModules} enabledModules={hub.enabledModules} isAdmin={hub.isAdmin} />

      {sections.length > 0 && (
        <section className="space-y-5">
          <h2 className="text-h2">Overview</h2>
          {sections.map(({ key, figures }) => {
            const def = MODULES[key];
            const Icon = def.icon;
            return (
              <div key={key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", def.accent)}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold">{def.name}</h3>
                </div>
                <FigureTiles figures={figures ?? []} />
              </div>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-h2">Recent notifications</h2>
        {notifications === undefined ? (
          <Skeleton className="h-32 w-full rounded-[12px]" />
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" description="Alerts from every module appear here." />
        ) : (
          <Card>
            <CardHeader className="sr-only">Notifications</CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {notifications.map((n) => {
                const body = (
                  <div className="flex items-start gap-3 px-5 py-3">
                    <span
                      className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")}
                      aria-label={n.readAt ? undefined : "Unread"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && <p className="truncate text-xs text-text-muted">{n.body}</p>}
                      <p className="mt-0.5 text-xs text-text-dim">
                        {notificationModuleName(n.module)} · {relativeTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                );
                return n.href ? (
                  <Link
                    key={n._id}
                    href={n.href}
                    onClick={() => {
                      if (!n.readAt) markRead({ notificationId: n._id }).catch(() => {});
                    }}
                    className="block hover:bg-row-hover"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={n._id}>{body}</div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

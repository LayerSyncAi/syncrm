"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function StatsCardSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-12" />
    </Card>
  );
}

function StageRowSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-8" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

export default function DashboardPage() {
  const dashboardData = useQuery(api.leads.dashboardStats, {});

  const isLoading = dashboardData === undefined;

  const stats = dashboardData
    ? [
        { label: "New leads this week", value: dashboardData.stats.newThisWeek.toString() },
        { label: "Open leads", value: dashboardData.stats.openLeads.toString() },
        { label: "Won this month", value: dashboardData.stats.wonThisMonth.toString() },
        { label: "Lost this month", value: dashboardData.stats.lostThisMonth.toString() },
      ]
    : [];

  const stageBreakdown = dashboardData?.stageBreakdown ?? [];
  const monthlyProgress = dashboardData?.monthlyProgress ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Pipeline Overview</h2>
                <Badge className="bg-primary/10 text-primary">All Leads</Badge>
              </div>
              <p className="text-sm text-text-muted">
                Monitor your weekly performance and conversion velocity.
              </p>
            </div>
            <div className="min-w-[220px]">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Monthly progress</span>
                {isLoading ? (
                  <Skeleton className="h-3 w-8" />
                ) : (
                  <span>{monthlyProgress}%</span>
                )}
              </div>
              <div className="mt-2 h-2 rounded-full bg-border">
                {isLoading ? (
                  <Skeleton className="h-2 w-full rounded-full" />
                ) : (
                  <div
                    className="h-2 rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${monthlyProgress}%` }}
                  />
                )}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)
          : stats.map((stat) => (
              <Card key={stat.label} className="p-4">
                <p className="text-xs uppercase tracking-wide text-text-dim">
                  {stat.label}
                </p>
                <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Leads by Stage
            </h3>
            <span className="text-xs text-text-dim">Active pipeline</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <StageRowSkeleton key={i} />)
            : stageBreakdown.length === 0
              ? (
                <p className="text-sm text-text-muted text-center py-4">
                  No leads in pipeline yet
                </p>
              )
              : stageBreakdown.map((stage) => (
                <div key={stage.id} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{stage.name}</span>
                    <span className="text-text-muted">{stage.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-border">
                    <div
                      className="h-2 rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${stage.percent * 100}%` }}
                    />
                  </div>
                </div>
              ))}
        </CardContent>
      </Card>
    </div>
  );
}

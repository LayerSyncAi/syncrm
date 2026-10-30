"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { ArrowUpRight, CircleCheck, Plus } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiTile } from "@/components/ui/kpi-tile";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SuggestionCard } from "@/components/ui/suggestion-card";
import { PhoneMainAction } from "@/components/ui/phone-main-action";
import { animatedToast } from "@/components/ui/animated-toaster";
import { TemperatureChip } from "@/components/leads/temperature";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useRequireAuth } from "@/hooks/useAuth";
import { detectBrowserTimezone } from "@/lib/timezones";
import { getErrorMessage } from "@/lib/errors";

// Score buckets come from the server coldest first: Cold, Cool, Warm, Hot,
// On Fire. Their bars use the lead-temperature colours.
const BUCKET_COLOURS = [
  "bg-[var(--cold)]",
  "bg-[var(--cold)]/55",
  "bg-[var(--warm)]",
  "bg-[var(--hot)]/70",
  "bg-[var(--hot)]",
];

/** 09:00 tomorrow, local time. */
function tomorrowAtNine(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export default function DashboardPage() {
  const {
    isLoading,
    isScoreLoading,
    stats,
    stageBreakdown,
    monthlyProgress,
    distribution,
    topUnworked,
    maxDistCount,
    scoredCount,
    totalActive,
    overallAvg,
  } = useDashboardData();
  const { isAdmin } = useRequireAuth();
  const createActivity = useMutation(api.activities.createForLead);
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState(0);

  const stat = (label: string) => stats.find((s) => s.label === label)?.value ?? 0;
  const total = stat("Total leads");
  const open = stat("Open leads");
  const won = stat("Won");
  const lost = stat("Lost");
  const quiet = topUnworked.length;

  const summary = isScoreLoading
    ? null
    : totalActive === 0
      ? "No open leads yet. New leads appear here as they come in."
      : (scoredCount === 0
          ? `${totalActive} open lead${totalActive === 1 ? "" : "s"}, none scored yet.`
          : `${scoredCount} of ${totalActive} open lead${totalActive === 1 ? " is" : "s are"} scored, averaging ${overallAvg}.`) +
        (quiet ? ` ${quiet} high-scoring lead${quiet === 1 ? " has" : "s have"} gone quiet for more than a week.` : "");

  // One follow-up task per quiet lead, assigned to its owner, due tomorrow.
  const scheduleFollowUps = async () => {
    setScheduling(true);
    const due = tomorrowAtNine();
    const tz = detectBrowserTimezone();
    let made = 0;
    try {
      for (const lead of topUnworked) {
        await createActivity({
          leadId: lead._id as Id<"leads">,
          type: "follow_up",
          title: "Follow up",
          description: "Suggested on the dashboard: a high score but no activity in the last 7 days.",
          scheduledAt: due,
          scheduledTimezone: tz,
        });
        made++;
      }
      animatedToast.success(`${made} follow-up task${made === 1 ? "" : "s"} created`, { description: "Due tomorrow at 09:00." });
    } catch (e) {
      animatedToast.error("Could not create every task", { description: `${made} created. ${getErrorMessage(e)}` });
    } finally {
      setScheduled(made);
      setScheduling(false);
    }
  };

  return (
    <ErrorBoundary sectionName="Dashboard">
      <div className="space-y-6">
        <DashboardHeader
          eyebrow={isAdmin ? "All leads" : "My leads"}
          title="Pipeline overview"
          summary={summary}
          actions={
            <Link href="/app/leads/new">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New lead
              </Button>
            </Link>
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 w-full rounded-[20px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <KpiTile label="Total leads" value={total} hint={`${open} open`} meter={total ? open / total : 0} href="/app/leads" />
            <KpiTile
              label="Win rate"
              value={`${monthlyProgress}%`}
              hint={`${won} won · ${lost} lost`}
              meter={monthlyProgress / 100}
              href="/app/reports"
            />
            <KpiTile
              label="Avg lead score"
              value={isScoreLoading ? "–" : overallAvg}
              hint={`${scoredCount} of ${totalActive} scored`}
              meter={overallAvg / 100}
            />
            <KpiTile label="Deals won" value={won} tone={won ? "good" : "default"} hint="Closed as won" href="/app/reports" />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Card className="p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-h3">Leads by stage</h2>
                <p className="text-xs text-text-muted">How many leads are at each stage</p>
              </div>
              <Link href="/app/leads" className="text-xs font-medium text-primary-ink hover:underline">
                Open leads
              </Link>
            </div>
            {isLoading ? (
              <Skeleton className="h-40 w-full rounded-[12px]" />
            ) : stageBreakdown.length === 0 ? (
              <p className="py-4 text-sm text-text-muted">No leads in the pipeline yet.</p>
            ) : (
              <ul className="space-y-3">
                {stageBreakdown.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{s.name}</span>
                      <span className="tabular-nums text-text-muted">{s.count}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                      <div className="h-full rounded-full bg-[var(--text)]" style={{ width: `${Math.min(100, s.percent * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4">
              <h2 className="text-h3">Lead scores</h2>
              <p className="text-xs text-text-muted">
                {isScoreLoading ? "Loading…" : `${scoredCount} of ${totalActive} open leads scored`}
              </p>
            </div>
            {isScoreLoading ? (
              <Skeleton className="h-40 w-full rounded-[12px]" />
            ) : totalActive === 0 ? (
              <p className="py-4 text-sm text-text-muted">No leads to score yet.</p>
            ) : (
              <ul className="space-y-3">
                {distribution.map((b, i) => (
                  <li key={b.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>
                        {b.label} <span className="text-xs text-text-dim">{b.range}</span>
                      </span>
                      <span className="tabular-nums text-text-muted">{b.count}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                      <div
                        className={`h-full rounded-full ${BUCKET_COLOURS[i] ?? "bg-[var(--text)]"}`}
                        style={{ width: `${maxDistCount ? (b.count / maxDistCount) * 100 : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Card className="p-5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-h3">Top unworked leads</h2>
                <p className="text-xs text-text-muted">High scores with no activity in the last 7 days</p>
              </div>
              <Link href="/app/leads" className="text-xs font-medium text-primary-ink hover:underline">
                View all
              </Link>
            </div>
            {isScoreLoading ? (
              <Skeleton className="h-32 w-full rounded-[12px]" />
            ) : quiet === 0 ? (
              <p className="flex items-center gap-2 py-4 text-sm text-text-muted">
                <CircleCheck className="h-4 w-4 text-primary-ink" aria-hidden="true" />
                Every high-scoring lead has been worked this week.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {topUnworked.map((lead) => (
                  <li key={lead._id}>
                    <Link
                      href={`/app/leads/${lead._id}`}
                      className="-mx-2 flex items-center gap-3 rounded-[12px] px-2 py-3 hover:bg-row-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{lead.fullName}</span>
                        <span className="block truncate text-xs text-text-muted">Owner: {lead.ownerName}</span>
                      </span>
                      <TemperatureChip score={lead.score} />
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-text-dim" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {quiet > 0 && (
            <SuggestionCard
              action={
                scheduled > 0 ? (
                  <Link href="/app/tasks">
                    <Button variant="secondary" className="w-full">
                      See the tasks
                    </Button>
                  </Link>
                ) : (
                  <Button onClick={scheduleFollowUps} disabled={scheduling} className="w-full">
                    {scheduling ? "Creating tasks…" : `Create ${quiet} follow-up task${quiet === 1 ? "" : "s"}`}
                  </Button>
                )
              }
            >
              {scheduled > 0 ? (
                <>
                  Done. {scheduled} follow-up task{scheduled === 1 ? " is" : "s are"} on {scheduled === 1 ? "its owner's" : "their owners'"} list for tomorrow at
                  09:00.
                </>
              ) : (
                <>
                  {quiet === 1 ? "This lead scores" : `These ${quiet} leads score`} well, but nobody has worked{" "}
                  {quiet === 1 ? "it" : "them"} in 7 days. Schedule a follow-up for each owner, due tomorrow at 09:00.
                </>
              )}
            </SuggestionCard>
          )}
        </div>

        <PhoneMainAction label="New lead" icon={Plus} href="/app/leads/new" />
      </div>
    </ErrorBoundary>
  );
}

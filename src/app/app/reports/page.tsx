"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { ErrorBoundary } from "@/components/common/error-boundary";
import {
  getPeriodRange,
  shiftPeriod,
  isNavigablePeriod,
  PERIOD_OPTIONS,
  type ReportPeriod,
} from "@/lib/reporting-periods";

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
    </div>
  );
}

// Sections are client-only (recharts needs the DOM); keep them out of SSR.
const AgentPerformanceSection = dynamic(
  () => import("@/components/reports/agent-performance").then((m) => m.AgentPerformanceSection),
  { ssr: false, loading: PageLoader }
);
const LeadSourceSection = dynamic(
  () => import("@/components/reports/lead-source-analytics").then((m) => m.LeadSourceSection),
  { ssr: false, loading: PageLoader }
);
const PropertyPerformanceSection = dynamic(
  () => import("@/components/reports/property-performance").then((m) => m.PropertyPerformanceSection),
  { ssr: false, loading: PageLoader }
);
const RevenueSummarySection = dynamic(
  () => import("@/components/reports/revenue-summary").then((m) => m.RevenueSummarySection),
  { ssr: false, loading: PageLoader }
);
const LeaderboardSection = dynamic(
  () => import("@/components/reports/leaderboard").then((m) => m.LeaderboardSection),
  { ssr: false, loading: PageLoader }
);
const TaskSummarySection = dynamic(
  () => import("@/components/reports/task-summary").then((m) => m.TaskSummarySection),
  { ssr: false, loading: PageLoader }
);

const TABS = [
  { key: "agents", label: "Agents" },
  { key: "tasks", label: "Tasks" },
  { key: "sources", label: "Lead Sources" },
  { key: "properties", label: "Properties" },
  { key: "revenue", label: "Revenue" },
  { key: "leaderboard", label: "Leaderboard" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [refDate, setRefDate] = useState<Date>(() => new Date());
  const [tab, setTab] = useState<TabKey>("agents");
  const [agentId, setAgentId] = useState<string>("");

  const agents = useQuery(api.users.listActiveUsers, isAdmin ? {} : "skip");

  const range = useMemo(() => getPeriodRange(period, refDate), [period, refDate]);
  const ownerUserId = agentId ? (agentId as Id<"users">) : undefined;

  const agentOptions = useMemo(
    () => [
      { value: "", label: "All agents" },
      ...(agents ?? []).map((a) => ({ value: a._id as string, label: a.name })),
    ],
    [agents]
  );

  const sectionProps = {
    start: range.start,
    end: range.end,
    ownerUserId,
    periodLabel: range.label,
  };

  return (
    <ErrorBoundary sectionName="Reports">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-h1">Reports &amp; Analytics</h1>
                <p className="text-sm text-text-muted">
                  Performance across agents, properties, lead sources and revenue.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin ? (
                  <StaggeredDropDown
                    value={agentId}
                    onChange={setAgentId}
                    options={agentOptions}
                    className="w-[160px]"
                    searchable
                  />
                ) : null}
                <StaggeredDropDown
                  value={period}
                  onChange={(v) => {
                    setPeriod(v as ReportPeriod);
                    setRefDate(new Date());
                  }}
                  options={PERIOD_OPTIONS}
                  className="w-[130px]"
                />
                {isNavigablePeriod(period) ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      className="h-10 w-10 p-0"
                      aria-label="Previous period"
                      onClick={() => setRefDate((d) => shiftPeriod(period, d, -1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[150px] text-center text-sm font-medium">
                      {range.label}
                    </span>
                    <Button
                      variant="secondary"
                      className="h-10 w-10 p-0"
                      aria-label="Next period"
                      onClick={() => setRefDate((d) => shiftPeriod(period, d, 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 rounded-[12px] border border-border-strong bg-card-bg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="relative rounded-[10px] px-4 py-2 text-sm font-medium transition-colors"
            >
              {tab === t.key && (
                <motion.div
                  layoutId="reports-tab-pill"
                  className="absolute inset-0 rounded-[10px] bg-primary/10"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <span className={tab === t.key ? "relative text-primary" : "relative text-text-muted"}>
                {t.label}
              </span>
            </button>
          ))}
        </div>

        <div>
          {tab === "agents" && <AgentPerformanceSection {...sectionProps} />}
          {tab === "tasks" && <TaskSummarySection {...sectionProps} />}
          {tab === "sources" && <LeadSourceSection {...sectionProps} />}
          {tab === "properties" && <PropertyPerformanceSection {...sectionProps} />}
          {tab === "revenue" && <RevenueSummarySection {...sectionProps} />}
          {tab === "leaderboard" && <LeaderboardSection {...sectionProps} />}
        </div>
      </div>
    </ErrorBoundary>
  );
}

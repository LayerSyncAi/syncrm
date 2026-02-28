"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface DashboardStat {
  label: string;
  value: number;
}

export interface StageBreakdownItem {
  id: string;
  name: string;
  count: number;
  order: number;
  percent: number;
}

export interface ScoreDistributionBucket {
  label: string;
  range: string;
  count: number;
}

export interface AvgScoreByStageItem {
  id: string;
  name: string;
  avgScore: number;
  count: number;
}

export interface UnworkedLead {
  _id: string;
  fullName: string;
  score: number;
  ownerName: string;
  lastScoredAt?: number;
}

export function useDashboardData() {
  const dashboardData = useQuery(api.leads.dashboardStats, {});
  const scoreData = useQuery(api.leads.dashboardScoreStats, {});

  const isLoading = dashboardData === undefined;
  const isScoreLoading = scoreData === undefined;

  const stats: DashboardStat[] = dashboardData
    ? [
        { label: "Total leads", value: dashboardData.stats.totalLeads },
        { label: "Open leads", value: dashboardData.stats.openLeads },
        { label: "Won", value: dashboardData.stats.totalWon },
        { label: "Lost", value: dashboardData.stats.totalLost },
      ]
    : [];

  const stageBreakdown = (dashboardData?.stageBreakdown ?? []) as StageBreakdownItem[];
  const monthlyProgress = dashboardData?.monthlyProgress ?? 0;

  const distribution = (scoreData?.distribution ?? []) as ScoreDistributionBucket[];
  const avgScoreByStage = (scoreData?.avgScoreByStage ?? []) as AvgScoreByStageItem[];
  const topUnworked = (scoreData?.topUnworked ?? []) as UnworkedLead[];

  const maxDistCount = Math.max(...(distribution.map((d) => d.count).length ? distribution.map((d) => d.count) : [1]));

  return {
    isLoading,
    isScoreLoading,
    stats,
    stageBreakdown,
    monthlyProgress,
    distribution,
    avgScoreByStage,
    topUnworked,
    maxDistCount,
    scoredCount: scoreData?.scoredCount ?? 0,
    totalActive: scoreData?.totalActive ?? 0,
    overallAvg: scoreData?.overallAvg ?? 0,
  };
}

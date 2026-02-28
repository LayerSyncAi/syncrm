"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Global React Context provider for static/rarely-changed data.
 * Prevents redundant Convex subscriptions on every page mount by
 * subscribing once at the layout level and sharing via context.
 *
 * Data cached:
 * - Pipeline stages (rarely change, needed on dashboard, leads, etc.)
 * - Commission configs (admin-configured, rarely change)
 */

interface PipelineStage {
  _id: string;
  name: string;
  description?: string;
  action?: string;
  order: number;
  isTerminal: boolean;
  terminalOutcome: "won" | "lost" | null;
}

interface CommissionConfig {
  _id: string;
  name: string;
  description?: string;
  scenario: "shared_deal" | "own_property_own_lead" | "company_property";
  propertyAgentPercent: number;
  leadAgentPercent: number;
  companyPercent: number;
  isDefault: boolean;
}

interface StaticDataContextValue {
  stages: PipelineStage[] | undefined;
  commissionConfigs: CommissionConfig[] | undefined;
  isStagesLoading: boolean;
  isCommissionConfigsLoading: boolean;
}

const StaticDataContext = createContext<StaticDataContextValue>({
  stages: undefined,
  commissionConfigs: undefined,
  isStagesLoading: true,
  isCommissionConfigsLoading: true,
});

export function StaticDataProvider({ children }: { children: ReactNode }) {
  const stages = useQuery(api.stages.list);
  const commissionConfigs = useQuery(api.commissions.listConfigs);

  const value: StaticDataContextValue = {
    stages: stages as PipelineStage[] | undefined,
    commissionConfigs: commissionConfigs as CommissionConfig[] | undefined,
    isStagesLoading: stages === undefined,
    isCommissionConfigsLoading: commissionConfigs === undefined,
  };

  return (
    <StaticDataContext.Provider value={value}>
      {children}
    </StaticDataContext.Provider>
  );
}

/**
 * Hook to access cached pipeline stages.
 * Uses the globally-subscribed data instead of creating a new subscription.
 */
export function useCachedStages() {
  const { stages, isStagesLoading } = useContext(StaticDataContext);
  return { stages, isLoading: isStagesLoading };
}

/**
 * Hook to access cached commission configs.
 * Uses the globally-subscribed data instead of creating a new subscription.
 */
export function useCachedCommissionConfigs() {
  const { commissionConfigs, isCommissionConfigsLoading } = useContext(StaticDataContext);
  return { commissionConfigs, isLoading: isCommissionConfigsLoading };
}

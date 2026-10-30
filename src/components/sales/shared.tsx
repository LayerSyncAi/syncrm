"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Puzzle } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { todayLocal, type FinCurrency } from "@/lib/finance/format";

/** A development as listDevelopments returns it, with stand counts and money. */
export type Development = FunctionReturnType<typeof api.dev.sales.listDevelopments>[number];

/** One buyer's sale as listStands returns it. */
export type SaleRow = FunctionReturnType<typeof api.dev.sales.listStands>[number];

export type Account = { _id: Id<"finAccounts">; name: string };

/**
 * SyncFinance details for sales screens, only when the agency has Finance
 * and this user can open it: a SyncDev user without Finance cannot call any
 * Finance query. `accountsFor` is null when the account picker should hide.
 */
export function useSalesFinance(financeOn: boolean | undefined) {
  const hub = useQuery(api.hub.getContext);
  const canOpenFinance = !!financeOn && !!hub?.myModules.includes("finance");
  const fin = useQuery(api.finance.settings.get, canOpenFinance ? {} : "skip");
  const accountsFor = React.useCallback(
    (currency: FinCurrency): Account[] | null =>
      canOpenFinance && fin ? fin.accounts.filter((a) => a.isActive && a.currency === currency).map((a) => ({ _id: a._id, name: a.name })) : null,
    [canOpenFinance, fin]
  );
  return {
    hub,
    canOpenFinance,
    canOpenDev: !!hub?.myModules.includes("dev"),
    today: fin?.today ?? todayLocal(),
    accountsFor,
    loading: hub === undefined || (canOpenFinance && fin === undefined),
  };
}

/** One short line on what another module adds, with a link only when the user can open it. */
export function ModuleHint({ children, href, linkLabel }: { children: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-text-muted">
      <Puzzle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {children}
        {href && linkLabel && (
          <>
            {" "}
            <Link href={href} className="font-medium text-primary-ink hover:underline">
              {linkLabel}
            </Link>
          </>
        )}
      </span>
    </p>
  );
}

/** Sold, reserved and available as one bar. */
export function InventoryBar({ sold, reserved, available, className }: { sold: number; reserved: number; available: number; className?: string }) {
  const total = sold + reserved + available;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : "0%");
  return (
    <div className={className}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${sold} sold, ${reserved} reserved, ${available} available`}>
        <div className="h-full bg-emerald-900" style={{ width: pct(sold) }} />
        <div className="h-full bg-[var(--status-warning-fg)]" style={{ width: pct(reserved) }} />
        <div className="h-full bg-[var(--status-success-fg)]" style={{ width: pct(available) }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 whitespace-nowrap text-xs text-text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-900" />
          {sold} sold
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--status-warning-fg)]" />
          {reserved} reserved
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--status-success-fg)]" />
          {available} available
        </span>
      </div>
    </div>
  );
}

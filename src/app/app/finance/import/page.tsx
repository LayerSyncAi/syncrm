"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Lock } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/worth/ui";
import { getErrorMessage } from "@/lib/errors";
import { FormError, Section, StayPageHeader } from "@/components/stay/page-header";
import { ImportHistory, ImportPanel } from "@/components/finance/import-panel";
import type { ImportKind } from "@/lib/finance/import";

export default function FinanceImportPage() {
  const data = useQuery(api.finance.settings.get);
  const [tab, setTab] = React.useState<ImportKind>("opening");

  if (data === undefined) return <ListSkeleton />;
  if (!data.role.isDirector) {
    return (
      <EmptyState
        icon={Lock}
        title="Directors only"
        description="Ask a director to import opening balances, past transactions and instalment clients."
        action={
          <Link href="/app/finance">
            <Button variant="secondary">Back to Finance</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <StayPageHeader
        title="Import and migrate"
        description="Move your agency onto Sync Finance from Excel and receipt books. Each import can be undone as a whole."
        back={{ href: "/app/finance/settings", label: "Finance settings" }}
      />

      <Tabs<ImportKind>
        tabs={[
          { key: "opening", label: "Opening balances" },
          { key: "transactions", label: "Historical transactions" },
          { key: "stands", label: "Clients on instalments" },
        ]}
        value={tab}
        onChange={setTab}
      />

      <ImportPanel key={tab} kind={tab} today={data.today} lockedThrough={data.settings.lockedThrough} intro={<KindIntro kind={tab} />} />

      <StayReceipts today={data.today} />
      <DevPayments />

      <ImportHistory />
    </div>
  );
}

// ── One import ───────────────────────────────────────────────────────

function KindIntro({ kind }: { kind: ImportKind }) {
  if (kind === "opening") {
    return (
      <div className="space-y-3 text-sm text-text-muted">
        <p>Balances on the day you start using Sync Finance: each bank account and cash float, what you hold for each landlord and each tenant deposit.</p>
        <p>
          Trust account balances start as unallocated. Each landlord and deposit balance is taken from it, so what is left shows money nobody has been matched to yet.
        </p>
        <div className="flex gap-2 rounded-lg bg-[var(--status-warning-bg)] p-3 text-[var(--status-warning-fg)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>If tenant deposits were already brought in by the Sync Stay import while Finance was on, do not import them again.</p>
        </div>
      </div>
    );
  }
  if (kind === "transactions") {
    return (
      <p className="text-sm text-text-muted">
        Past receipts and payments from a receipt book or Excel, keeping their original numbers. Accounts must exist first in{" "}
        <Link href="/app/finance/settings" className="text-primary-600 hover:underline">
          Finance settings
        </Link>
        .
      </p>
    );
  }
  return (
    <p className="text-sm text-text-muted">
      Buyers already paying for stands, with what they have paid so far. Developments must exist first under{" "}
      <Link href="/app/finance/instalments" className="text-primary-600 hover:underline">
        Instalments
      </Link>
      .
    </p>
  );
}

// ── Sync Stay receipts ───────────────────────────────────────────────

function StayReceipts({ today }: { today: string }) {
  const bringIn = useMutation(api.finance.posting.bringInStayPayments);
  const [from, setFrom] = React.useState(`${today.slice(0, 7)}-01`);
  const [running, setRunning] = React.useState(false);
  const [done, setDone] = React.useState<{ posted: number; skipped: number; errors: string[]; stuck: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setDone(null);
    let posted = 0;
    try {
      // Each call handles up to 150 receipts. Skipped and failed receipts are
      // tried again on every call, so the last call's counts cover them all.
      for (let i = 0; i < 200; i++) {
        const res = await bringIn({ from });
        posted += res.posted;
        const last = { posted, skipped: res.skipped, errors: res.errors, stuck: 0 };
        setDone(last);
        if (res.remaining === 0) break;
        if (res.posted === 0) {
          setDone({ ...last, stuck: res.remaining });
          break;
        }
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Section title="Bring in Sync Stay receipts">
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Posts rent and deposit receipts recorded in Sync Stay from this date into Finance, so you do not type them again. Receipts already in Finance are left alone.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="stay-from">Receipts paid on or after</Label>
            <Input id="stay-from" type="date" max={today} value={from} disabled={running} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <Button onClick={run} disabled={running || !from}>
            {running ? "Bringing in..." : "Bring in receipts"}
          </Button>
        </div>
        <FormError message={error} />
        {done && (
          <div className="space-y-2 text-sm">
            <p>
              {done.posted} posted, {done.skipped} skipped, {done.errors.length} with errors.
            </p>
            {done.stuck > 0 && <p className="text-[var(--status-warning-fg)]">{done.stuck} more receipts could not be reached because earlier ones keep failing. Fix the errors below and run it again.</p>}
            {done.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-danger/10 p-3">
                {done.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Sync Dev payments ────────────────────────────────────────────────

/** Payments Sync Dev took before the agency had Finance, posted to the ledger. */
function DevPayments() {
  const hub = useQuery(api.hub.getContext);
  const bringIn = useMutation(api.finance.posting.bringInDevPayments);
  const [running, setRunning] = React.useState(false);
  const [done, setDone] = React.useState<{ posted: number; errors: string[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  if (!hub?.enabledModules.includes("dev")) return null;

  async function run() {
    setRunning(true);
    setError(null);
    let posted = 0;
    try {
      for (let i = 0; i < 200; i++) {
        const res = await bringIn({});
        posted += res.posted;
        setDone({ posted, errors: res.errors });
        if (res.remaining === 0 || res.posted === 0) break;
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Section title="Bring in Sync Dev payments">
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Posts the stand payments and refunds Sync Dev recorded before you had Sync Finance, with their receipt numbers, so they sit in your trust and cash books. Payments already in Finance are left alone.
        </p>
        <Button onClick={run} disabled={running}>
          {running ? "Bringing in..." : "Bring in payments"}
        </Button>
        <FormError message={error} />
        {done && (
          <div className="space-y-2 text-sm">
            <p>
              {done.posted} posted, {done.errors.length} with errors.
            </p>
            {done.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-danger/10 p-3">
                {done.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ClipboardCheck, Plus } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { useRequireAuth } from "@/hooks/useAuth";
import { formatDay } from "@/lib/stay-ops/labels";
import { cn } from "@/lib/utils";

type Tab = "due" | "draft" | "completed";
const TABS: { value: Tab; label: string }[] = [
  { value: "due", label: "Due" },
  { value: "draft", label: "Drafts" },
  { value: "completed", label: "Completed" },
];

export default function InspectionsPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const [tab, setTab] = React.useState<Tab>("due");

  const due = useQuery(api.stay.inspections.dueUnits);
  const drafts = useQuery(api.stay.inspections.list, { status: "draft" });
  const done = useQuery(api.stay.inspections.list, { status: "completed" });

  if (authLoading) return <ListSkeleton />;
  const counts: Record<Tab, number | undefined> = {
    due: due?.length,
    draft: drafts?.length,
    completed: done?.length,
  };
  const rows = tab === "draft" ? drafts : done;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inspections</h1>
          <p className="text-sm text-text-muted">Move-in, routine and move-out reports.</p>
        </div>
        <Link href="/app/stay/inspections/new">
          <Button>
            <Plus className="h-4 w-4" />
            New inspection
          </Button>
        </Link>
      </div>

      <div className="flex gap-1 rounded-[12px] border border-border-strong bg-card-bg p-1 sm:w-fit">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "flex-1 rounded-[9px] px-4 py-2 text-sm font-medium transition-colors sm:flex-none",
              tab === t.value ? "bg-primary-600 text-white" : "text-text-muted hover:text-text"
            )}
          >
            {t.label}
            {counts[t.value] ? ` (${counts[t.value]})` : ""}
          </button>
        ))}
      </div>

      {tab === "due" ? (
        due === undefined ? (
          <ListSkeleton />
        ) : due.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Nothing due"
            description="Units show here when a routine inspection is overdue or due within 30 days. Set an inspection interval on a unit to switch this on."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {due.map((u) => (
              <li key={u.unitId} className="rounded-[12px] border border-border-strong bg-card-bg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{u.unitLabel}</p>
                    <p className="text-sm text-text-muted">{u.propertyTitle}</p>
                  </div>
                  <Badge variant={u.state === "overdue" ? "danger" : "warning"}>
                    {u.state === "overdue" ? "Overdue" : "Due soon"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-text-muted">Due {formatDay(u.nextInspectionDue)}</p>
                <Link href={`/app/stay/inspections/new?unitId=${u.unitId}`}>
                  <Button size="sm" variant="secondary" className="mt-3">Start inspection</Button>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : rows === undefined ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={tab === "draft" ? "No drafts" : "No completed inspections"}
          description="Start an inspection from a unit that is due, or create one."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((i) => (
            <li key={i._id}>
              <Link
                href={`/app/stay/inspections/${i._id}`}
                className="block rounded-[12px] border border-border-strong bg-card-bg p-4 transition-colors hover:border-primary/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{i.typeLabel}: {i.unitLabel}</p>
                    <p className="text-sm text-text-muted">{i.propertyTitle}</p>
                  </div>
                  {i.issueCount > 0 && <Badge variant="warning">{i.issueCount} to fix</Badge>}
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {formatDay(i.date)} by {i.inspectorName}
                  {i.sentToLandlordAt ? ". Sent to landlord" : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

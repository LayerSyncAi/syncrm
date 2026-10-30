"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StayPageHeader } from "@/components/stay/page-header";
import { ImportHistory, ImportPanel } from "@/components/finance/import-panel";
import { todayLocal } from "@/lib/finance/format";

/** Directors bring in buyers already paying for stands, from Excel. */
export default function DevImportPage() {
  const hub = useQuery(api.hub.getContext);

  if (hub === undefined) return <ListSkeleton />;
  if (!hub?.isAdmin) {
    return (
      <EmptyState
        icon={Lock}
        title="Directors only"
        description="Ask a director to import buyers already on payment plans."
        action={
          <Link href="/app/dev">
            <Button variant="secondary">Back to SyncDev</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <StayPageHeader
        title="Import buyers"
        description="Buyers already paying for stands, with what they have paid so far. Each import can be undone as a whole."
        back={{ href: "/app/dev/buyers", label: "Buyers" }}
      />
      <ImportPanel
        kind="stands"
        title="Buyers on plans"
        templateFile="Sync_Dev_buyers_template"
        today={todayLocal()}
        intro={
          <p className="text-sm text-text-muted">
            One row per stand sold. Add each development first under{" "}
            <Link href="/app/dev/developments" className="text-primary-ink hover:underline">
              Developments
            </Link>
            , with the same name as in the file. Stands not yet in the inventory are added as sold.
          </p>
        }
      />
      <ImportHistory kind="stands" kindLabels={{ stands: "Buyers on plans" }} />
    </div>
  );
}

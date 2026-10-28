"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KindGuard, PageTitle, PortalLoading } from "@/components/portal/common";
import { formatDay, inspectionTypeLabel } from "@/lib/stay-ops/labels";

function Inner() {
  const rows = useQuery(api.portal.landlord.inspections);
  if (rows === undefined) return <PortalLoading />;
  return (
    <>
      <PageTitle title="Inspections" subtitle="Completed reports on your properties" />
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No reports yet" description="Completed inspection reports will appear here." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link key={r._id} href={`/portal/inspections/${r._id}`}>
              <Card className="mb-2 flex min-h-16 items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text">{r.propertyTitle}, {r.unitLabel}</p>
                  <p className="text-sm text-text-muted">{formatDay(r.date)}</p>
                </div>
                <Badge variant="neutral">{inspectionTypeLabel(r.type)}</Badge>
                <ChevronRight className="h-4 w-4 text-text-dim" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function PortalInspectionsPage() {
  return <KindGuard kind="landlord"><Inner /></KindGuard>;
}

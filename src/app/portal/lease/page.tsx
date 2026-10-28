"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ChevronRight, FileText } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentList, KindGuard, LeaseSelect, PageTitle, PortalLoading, useSelectedLease } from "@/components/portal/common";
import { formatMoney } from "@/lib/currency";
import { formatDay, inspectionTypeLabel } from "@/lib/stay-ops/labels";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-right text-text">{value}</span>
    </div>
  );
}

function Inner() {
  const leases = useQuery(api.portal.tenant.home);
  const [leaseId, setLeaseId] = useSelectedLease(leases);
  const detail = useQuery(api.portal.tenant.lease, leaseId ? { leaseId: leaseId as Id<"stayLeases"> } : "skip");
  const reports = useQuery(api.portal.tenant.inspections);

  if (leases === undefined) return <PortalLoading />;
  if (leases.length === 0) {
    return <EmptyState icon={FileText} title="No lease yet" description="Your lease will appear here once the agency has set it up." />;
  }
  const s = detail?.summary;
  const myReports = (reports ?? []).filter((r) => r.leaseId === leaseId);

  return (
    <>
      <PageTitle title="Lease" />
      <LeaseSelect leases={leases} value={leaseId} onChange={setLeaseId} />
      {!s ? (
        <PortalLoading />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="divide-y divide-border pt-3">
              <Row label="Property" value={s.propertyTitle} />
              <Row label="Unit" value={s.unitLabel} />
              <Row label="Status" value={<Badge variant={s.status === "active" ? "success" : "neutral"}>{s.status}</Badge>} />
              <Row label="Starts" value={formatDay(s.startDate)} />
              <Row label="Ends" value={s.endDate ? formatDay(s.endDate) : "Open ended"} />
              <Row label="Rent" value={formatMoney(s.rentAmount, s.currency)} />
              <Row label="Rent due on day" value={s.dueDay} />
              <Row label="Deposit" value={formatMoney(s.depositAmount, s.currency)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="font-medium text-text">Documents</h2></CardHeader>
            <CardContent><DocumentList docs={detail.documents} /></CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="font-medium text-text">Move-in and move-out reports</h2></CardHeader>
            <CardContent>
              {reports === undefined ? (
                <PortalLoading />
              ) : myReports.length === 0 ? (
                <p className="text-sm text-text-muted">No reports yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {myReports.map((r) => (
                    <li key={r._id}>
                      <Link href={`/portal/inspections/${r._id}`} className="flex min-h-14 items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text">{inspectionTypeLabel(r.type)} report</p>
                          <p className="text-xs text-text-muted">{formatDay(r.date)}</p>
                        </div>
                        {r.tenantAck ? (
                          <Badge variant="success">Responded</Badge>
                        ) : (
                          <Badge variant="warning">Needs your reply</Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-text-dim" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function PortalLeasePage() {
  return <KindGuard kind="tenant"><Inner /></KindGuard>;
}

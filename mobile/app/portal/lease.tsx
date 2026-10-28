/** Tenant lease: terms, shared documents and move-in or move-out reports. */
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Card, EmptyState, Facts, ListItem, Loading, Screen, Section, Title, Body } from "../../components/ui";
import { DocumentList, KindGuard, LeaseSelect, useSelectedLease } from "../../components/portal/common";
import { dateLabel, money } from "../../lib/format";
import { inspectionTypeLabel } from "@/lib/stay-ops/labels";

function Inner() {
  const router = useRouter();
  const leases = useQuery(api.portal.tenant.home);
  const [leaseId, setLeaseId] = useSelectedLease(leases);
  const detail = useQuery(api.portal.tenant.lease, leaseId ? { leaseId: leaseId as Id<"stayLeases"> } : "skip");
  const reports = useQuery(api.portal.tenant.inspections);

  if (leases === undefined) return <Loading />;
  if (leases.length === 0) return <EmptyState icon="document-text-outline" title="No lease yet" message="Your lease will appear here once the agency has set it up." />;
  const s = detail?.summary;
  const myReports = (reports ?? []).filter((r) => r.leaseId === leaseId);

  return (
    <Screen>
      <Title>Lease</Title>
      <LeaseSelect leases={leases} value={leaseId} onChange={setLeaseId} />
      {!s || !detail ? (
        <Loading />
      ) : (
        <>
          <Card>
            <Facts
              items={[
                { label: "Property", value: s.propertyTitle },
                { label: "Unit", value: s.unitLabel },
                { label: "Status", value: <Badge label={s.status} tone={s.status === "active" ? "success" : "neutral"} /> },
                { label: "Starts", value: dateLabel(s.startDate) },
                { label: "Ends", value: s.endDate ? dateLabel(s.endDate) : "Open ended" },
                { label: "Rent", value: money(s.rentAmount, s.currency) },
                { label: "Rent due on day", value: s.dueDay },
                { label: "Deposit", value: money(s.depositAmount, s.currency) },
              ]}
            />
          </Card>
          <Section title="Documents">
            <Card>
              <DocumentList docs={detail.documents} />
            </Card>
          </Section>
          <Section title="Move-in and move-out reports">
            {reports === undefined ? (
              <Loading />
            ) : myReports.length === 0 ? (
              <Body muted>No reports yet.</Body>
            ) : (
              myReports.map((r) => (
                <ListItem
                  key={r._id}
                  title={`${inspectionTypeLabel(r.type)} report`}
                  subtitle={dateLabel(r.date)}
                  right={<Badge label={r.tenantAck ? "Responded" : "Needs your reply"} tone={r.tenantAck ? "success" : "warning"} />}
                  onPress={() => router.push(`/portal/inspections/${r._id}`)}
                />
              ))
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}

export default function PortalLease() {
  return (
    <KindGuard kind="tenant">
      <Inner />
    </KindGuard>
  );
}

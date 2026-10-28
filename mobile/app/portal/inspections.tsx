/** Landlord inspections: completed reports on their properties. */
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { api } from "../../../convex/_generated/api";
import { Badge, Body, EmptyState, ListItem, Loading, Screen, Title } from "../../components/ui";
import { KindGuard } from "../../components/portal/common";
import { dateLabel } from "../../lib/format";
import { inspectionTypeLabel } from "@/lib/stay-ops/labels";

function Inner() {
  const router = useRouter();
  const rows = useQuery(api.portal.landlord.inspections);
  if (rows === undefined) return <Loading />;
  return (
    <Screen>
      <Title>Inspections</Title>
      <Body muted>Completed reports on your properties</Body>
      {rows.length === 0 ? (
        <EmptyState icon="clipboard-outline" title="No reports yet" message="Completed inspection reports will appear here." />
      ) : (
        rows.map((r) => (
          <ListItem
            key={r._id}
            title={`${r.propertyTitle}, ${r.unitLabel}`}
            subtitle={dateLabel(r.date)}
            right={<Badge label={inspectionTypeLabel(r.type)} />}
            onPress={() => router.push(`/portal/inspections/${r._id}`)}
          />
        ))
      )}
    </Screen>
  );
}

export default function PortalInspections() {
  return (
    <KindGuard kind="landlord">
      <Inner />
    </KindGuard>
  );
}

import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { EmptyState, Loading } from "../../../components/ui";
import { InspectionEditor } from "../../../components/stay/ops/inspection-editor";
import { InspectionReport } from "../../../components/stay/ops/inspection-report";

/** A draft opens in the editor, a completed inspection as a read-only report. */
export default function InspectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inspection = useQuery(api.stay.inspections.get, { id: id as Id<"stayInspections"> });
  if (inspection === undefined) return <Loading />;
  if (inspection === null) return <EmptyState icon="clipboard-outline" title="Inspection not found" />;
  return (
    <>
      <Stack.Screen options={{ title: `${inspection.typeLabel} inspection` }} />
      {inspection.status === "draft" ? <InspectionEditor inspection={inspection} /> : <InspectionReport inspection={inspection} />}
    </>
  );
}

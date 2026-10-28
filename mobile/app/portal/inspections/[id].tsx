/** One inspection report, for either kind of portal user. */
import { useLocalSearchParams } from "expo-router";
import { EmptyState, Loading } from "../../../components/ui";
import { usePortal } from "../../../components/portal/common";
import { PortalInspectionView } from "../../../components/portal/InspectionView";

export default function PortalInspection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const portal = usePortal();
  if (portal === undefined) return <Loading />;
  if (!portal) return <EmptyState icon="lock-closed-outline" title="Not available" message="This page is not part of your portal." />;
  return <PortalInspectionView id={id} kind={portal.kind} />;
}

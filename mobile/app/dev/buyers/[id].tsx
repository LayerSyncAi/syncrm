/** A buyer's statement with Receive payment. */
import { useLocalSearchParams } from "expo-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { StandStatement } from "../../../components/sales/stand-statement";

export default function DevBuyer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <StandStatement standId={id as Id<"finStands">} />;
}

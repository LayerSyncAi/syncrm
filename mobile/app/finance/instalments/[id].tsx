/** A client's instalment statement: the plan with what is paid, payments received and refunds. */
import { useLocalSearchParams } from "expo-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Loading } from "../../../components/ui";
import { StaffOnly } from "../../../components/finance/staff-only";
import { StandStatement } from "../../../components/sales/stand-statement";
import { useFinance } from "../../../lib/finance/hooks";

export default function FinanceStandStatement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fin = useFinance();
  if (fin === undefined) return <Loading />;
  if (!fin.role.isStaff) return <StaffOnly />;
  return <StandStatement standId={id as Id<"finStands">} accounts={fin.accounts} />;
}

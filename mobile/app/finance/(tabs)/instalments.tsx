/** Clients paying for stands on instalments, overdue first. */
import { Loading } from "../../../components/ui";
import { StaffOnly } from "../../../components/finance/staff-only";
import { BuyersList } from "../../../components/sales/buyers-list";
import { useFinance } from "../../../lib/finance/hooks";

export default function FinanceInstalments() {
  const fin = useFinance();
  if (fin === undefined) return <Loading />;
  if (!fin.role.isStaff) return <StaffOnly />;
  return <BuyersList hrefFor={(id) => `/finance/instalments/${id}`} emptyHint="Developments and stands are set up in SyncDev or on the website." />;
}

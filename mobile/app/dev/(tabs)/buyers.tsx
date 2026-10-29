/** Buyers on a payment plan, overdue first. */
import { BuyersList } from "../../../components/sales/buyers-list";

export default function DevBuyers() {
  return <BuyersList hrefFor={(id) => `/dev/buyers/${id}`} emptyHint="Sell a stand from a development and the buyer shows here." />;
}

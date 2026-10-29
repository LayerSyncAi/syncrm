"use client";

import { InstalmentsView } from "@/components/sales/instalments-view";

export default function DevBuyersPage() {
  return <InstalmentsView basePath="/app/dev/buyers" module="dev" title="Buyers" description="Everyone paying for a stand, what they have paid and what they owe." />;
}

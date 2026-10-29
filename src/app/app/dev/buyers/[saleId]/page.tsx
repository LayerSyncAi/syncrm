"use client";

import { useParams } from "next/navigation";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { SaleStatement } from "@/components/sales/sale-statement";

export default function DevBuyerPage() {
  const params = useParams<{ saleId: string }>();
  return <SaleStatement saleId={params.saleId as Id<"finStands">} basePath="/app/dev/buyers" backLabel="Buyers" module="dev" />;
}

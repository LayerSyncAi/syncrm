"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SaleStatement } from "@/components/sales/sale-statement";

export default function StandStatementPage() {
  const params = useParams<{ standId: string }>();
  const fin = useQuery(api.finance.settings.get);

  if (fin === undefined) return <ListSkeleton />;
  if (!fin.role.isStaff) {
    return <EmptyState icon={Lock} title="Statements are for directors and accounts staff" description="Ask your director if you need access." />;
  }
  return <SaleStatement saleId={params.standId as Id<"finStands">} basePath="/app/finance/instalments" backLabel="Instalments" module="finance" />;
}

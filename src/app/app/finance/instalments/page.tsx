"use client";

import { useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InstalmentsView } from "@/components/sales/instalments-view";
import { ModuleHint } from "@/components/sales/shared";

export default function FinanceInstalmentsPage() {
  const fin = useQuery(api.finance.settings.get);
  const hub = useQuery(api.hub.getContext);

  if (fin === undefined || hub === undefined) return <ListSkeleton />;
  if (!fin.role.isStaff) {
    return <EmptyState icon={Lock} title="Instalments are for directors and accounts staff" description="Ask your director if you need access." />;
  }

  const devOn = !!hub?.enabledModules.includes("dev");
  const canOpenDev = !!hub?.myModules.includes("dev");
  return (
    <InstalmentsView
      basePath="/app/finance/instalments"
      module="finance"
      title="Instalments"
      description="Clients paying for stands, or anything else sold on a monthly plan."
      notice={
        devOn ? (
          <ModuleHint href={canOpenDev ? "/app/dev/developments" : undefined} linkLabel="Open SyncDev">
            Stand availability and inventory are in SyncDev.
          </ModuleHint>
        ) : undefined
      }
    />
  );
}

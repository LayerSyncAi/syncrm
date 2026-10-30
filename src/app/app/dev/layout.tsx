"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Map as MapIcon } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Every SyncDev page: checks the user may open SyncDev before any Dev
 * query runs (they throw otherwise).
 */
export default function DevLayout({ children }: { children: ReactNode }) {
  const hub = useQuery(api.hub.getContext);
  const allowed = !!hub?.myModules.includes("dev");

  if (hub === undefined) return <ListSkeleton />;
  if (!allowed) {
    return (
      <EmptyState
        icon={MapIcon}
        title="SyncDev is not available to you"
        description={hub?.enabledModules.includes("dev") ? "Ask your director for access." : "Your agency does not have SyncDev switched on."}
        action={
          <Link href="/app/hub">
            <Button variant="secondary">Back to the Hub</Button>
          </Link>
        }
      />
    );
  }
  return <div className="pb-20">{children}</div>;
}

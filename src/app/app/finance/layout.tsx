"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Coins } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Every Sync Finance page: checks the user may open Finance before any
 * Finance query runs (they throw otherwise), and seeds the agency's default
 * settings and categories on first visit.
 */
export default function FinanceLayout({ children }: { children: ReactNode }) {
  const hub = useQuery(api.hub.getContext);
  const allowed = !!hub?.myModules.includes("finance");
  const init = useMutation(api.finance.settings.init);
  useEffect(() => {
    // Platform staff view orgs read-only; the seed simply does not run.
    if (allowed) init({}).catch(() => {});
  }, [allowed, init]);

  if (hub === undefined) return <ListSkeleton />;
  if (!allowed) {
    return (
      <EmptyState
        icon={Coins}
        title="Sync Finance is not available to you"
        description={
          hub?.enabledModules.includes("finance")
            ? "Ask your director to give you the accounts or property manager role."
            : "Your agency does not have Sync Finance switched on."
        }
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

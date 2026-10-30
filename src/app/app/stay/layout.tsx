"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Home } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { RecordPaymentButton, RecordPaymentProvider } from "@/components/stay/record-payment";

/**
 * Every SyncStay page: checks the user may open Stay before any Stay query
 * runs (they throw otherwise) and offers "Record payment" everywhere.
 */
export default function StayLayout({ children }: { children: ReactNode }) {
  const hub = useQuery(api.hub.getContext);
  if (hub === undefined) return <ListSkeleton />;
  if (!hub || !hub.myModules.includes("stay")) {
    return (
      <EmptyState
        icon={Home}
        title="SyncStay is not available to you"
        description={
          hub?.enabledModules.includes("stay")
            ? "Ask your director to give you the property manager or accounts role."
            : "Your agency does not have SyncStay switched on."
        }
        action={
          <Link href="/app/hub">
            <Button variant="secondary">Back to the Hub</Button>
          </Link>
        }
      />
    );
  }
  return (
    <RecordPaymentProvider>
      <div className="pb-20">{children}</div>
      <RecordPaymentButton />
    </RecordPaymentProvider>
  );
}

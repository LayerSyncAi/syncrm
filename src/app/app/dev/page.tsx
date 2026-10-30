"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Building2, Grid3x3, HandCoins, Plus, Send } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Section, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { DevelopmentModal } from "@/components/sales/modals";
import { ModuleHint } from "@/components/sales/shared";
import { DevelopmentCard } from "@/components/dev/development-card";

export default function DevDashboardPage() {
  const router = useRouter();
  const summary = useQuery(api.dev.dashboard.summary);
  const devs = useQuery(api.dev.sales.listDevelopments);
  const hub = useQuery(api.hub.getContext);
  const [creating, setCreating] = React.useState(false);

  if (summary === undefined || devs === undefined || hub === undefined) return <ListSkeleton />;
  const { canManage, financeOn } = summary.role;
  const active = devs.filter((d) => d.isActive);
  const newButton = canManage && (
    <Button className="h-11 gap-2 px-5" onClick={() => setCreating(true)}>
      <Plus className="h-4 w-4" />
      New development
    </Button>
  );
  const modal = creating && (
    <DevelopmentModal dev={null} financeOn={financeOn} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/app/dev/developments/${id}?add=1`)} />
  );

  if (devs.length === 0) {
    return (
      <div className="space-y-6">
        <StayPageHeader title="SyncDev" description="Your developments, their stands and the buyers paying for them." />
        <Section title="Get started">
          <ol className="space-y-4">
            {[
              { icon: Building2, title: "Create a development", body: "Its name, currency and who holds the money." },
              { icon: Grid3x3, title: "Add its stands", body: "Type a range like 1-40 and a price. You can change any stand later." },
              { icon: HandCoins, title: "Reserve and sell", body: "Tap a stand to hold it for someone or sell it on a payment plan." },
            ].map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600/10 text-sm font-semibold text-primary-ink">{i + 1}</span>
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5">
            {canManage ? (
              <Button className="h-11 gap-2 px-5" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                Create your first development
              </Button>
            ) : (
              <p className="text-sm text-text-muted">Ask a director or sales manager to add the first development.</p>
            )}
          </div>
        </Section>
        {!financeOn && <ModuleHint>SyncFinance adds trust accounting, commission and developer payouts.</ModuleHint>}
        {modal}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StayPageHeader title="SyncDev" description="Stands available, reserved and sold, and what buyers owe." actions={newButton} />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Available" value={summary.available} tone="good" href="/app/dev/developments" />
        <StatTile label="Reserved" value={summary.reserved} tone={summary.reserved > 0 ? "warning" : "default"} href="/app/dev/developments" />
        <StatTile label="Sold" value={summary.sold} href="/app/dev/buyers" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Contracted" value={summary.contracted} href="/app/dev/buyers" />
        <StatTile label="Paid" value={summary.collected} tone="good" href="/app/dev/buyers" />
        <StatTile label="Owed" value={summary.outstanding} href="/app/dev/buyers" />
        <StatTile
          label="Overdue"
          value={summary.overdue}
          tone={summary.overdueBuyers > 0 ? "danger" : "default"}
          hint={summary.overdueBuyers > 0 ? `${summary.overdueBuyers} ${summary.overdueBuyers === 1 ? "buyer" : "buyers"}` : "Nobody overdue"}
          href="/app/dev/buyers"
        />
      </div>

      {!financeOn && <ModuleHint>SyncFinance adds trust accounting, commission and developer payouts.</ModuleHint>}

      <Section
        title="Developments"
        actions={
          <>
            {hub?.canNotify && (
              <Link href="/app/notify?audience=instalments&filter=overdue">
                <Button variant="secondary" className="h-9 gap-2">
                  <Send className="h-4 w-4" />
                  Send reminders
                </Button>
              </Link>
            )}
            <Link href="/app/dev/developments">
              <Button variant="secondary" className="h-9">
                All developments
              </Button>
            </Link>
          </>
        }
      >
        {active.length === 0 ? (
          <p className="text-sm text-text-muted">No development is open for sales.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {active.map((d) => (
              <DevelopmentCard key={d._id} d={d} />
            ))}
          </div>
        )}
      </Section>
      {modal}
    </div>
  );
}

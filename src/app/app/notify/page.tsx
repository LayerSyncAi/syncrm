"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { MessagesSquare } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/worth/ui";
import { StayPageHeader } from "@/components/stay/page-header";
import { SendTab } from "@/components/notify/send-tab";
import { LogTab } from "@/components/notify/log-tab";
import { CampaignsTab } from "@/components/notify/campaigns-tab";
import { SettingsTab } from "@/components/notify/settings-tab";

type Tab = "send" | "log" | "campaigns" | "settings";

function NotifyPage() {
  const hub = useQuery(api.hub.getContext);
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>("send");
  const [campaign, setCampaign] = React.useState<{ id: Id<"notifyCampaigns">; name: string } | null>(null);

  if (hub === undefined) return <ListSkeleton />;
  if (!hub?.canNotify) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="SyncNotify is not available to you"
        description="Directors and the accounts, marketing, sales manager and property manager roles can send messages."
        action={
          <Link href="/app/hub">
            <Button variant="secondary">Back to the Hub</Button>
          </Link>
        }
      />
    );
  }

  const openLog = (c: { id: Id<"notifyCampaigns">; name: string }) => {
    setCampaign(c);
    setTab("log");
  };

  return (
    <div className="space-y-6 pb-20">
      <StayPageHeader title="SyncNotify" description="Email and SMS to your clients and team, and a log of every message the agency sends." />
      <Tabs<Tab>
        tabs={[
          { key: "send", label: "Send" },
          { key: "log", label: "Log" },
          { key: "campaigns", label: "Bulk sends" },
          { key: "settings", label: "Settings" },
        ]}
        value={tab}
        onChange={(t) => {
          if (t !== "log") setCampaign(null);
          setTab(t);
        }}
      />
      {tab === "send" && (
        <SendTab
          orgName={hub.orgName}
          initialAudience={params.get("audience") ?? undefined}
          initialFilter={params.get("filter") ?? undefined}
          onViewLog={(id) => openLog({ id, name: "this send" })}
        />
      )}
      {tab === "log" && <LogTab campaign={campaign} onClearCampaign={() => setCampaign(null)} />}
      {tab === "campaigns" && <CampaignsTab onOpen={openLog} />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

export default function NotifyPageWrapper() {
  return (
    <React.Suspense fallback={<ListSkeleton />}>
      <NotifyPage />
    </React.Suspense>
  );
}

"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { Inbox, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Section } from "@/components/stay/page-header";

const STATUS_VARIANT: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  sent: "success",
  logged: "info",
  queued: "warning",
  failed: "danger",
};

const STATUS_LABEL: Record<string, string> = { sent: "Sent", logged: "Logged", queued: "Queued", failed: "Failed" };

const SOURCE_LABEL: Record<string, string> = {
  notify: "Sync Notify",
  finance: "Sync Finance",
  stay: "Sync Stay",
  worth: "Sync Worth",
  crm: "CRM",
  system: "System",
};

export function timeLabel(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LogTab({
  campaign,
  onClearCampaign,
}: {
  campaign: { id: Id<"notifyCampaigns">; name: string } | null;
  onClearCampaign: () => void;
}) {
  const [channel, setChannel] = React.useState<"" | "email" | "sms">("");
  const [status, setStatus] = React.useState<"" | "ok" | "queued" | "failed">("");
  const rows = useQuery(api.notify.campaigns.log, {
    channel: channel || undefined,
    status: status || undefined,
    campaignId: campaign?.id,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[150px] space-y-2">
          <Label htmlFor="log-channel">Channel</Label>
          <Select id="log-channel" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="">All channels</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </Select>
        </div>
        <div className="min-w-[170px] space-y-2">
          <Label htmlFor="log-status">Status</Label>
          <Select id="log-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">All</option>
            <option value="ok">Sent or logged</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
          </Select>
        </div>
        {campaign && (
          <Button variant="secondary" size="sm" className="mb-1 gap-1" onClick={onClearCampaign}>
            Bulk send: {campaign.name}
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <p className="text-xs text-text-muted">
        Logged means no email or SMS provider is set up, so the message was only written to the server log and did not reach the person.
      </p>

      {rows === undefined ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title="No messages yet" description="Messages sent by Sync Notify and by the modules (receipts, statements, reminders) appear here." />
      ) : (
        <Section title={`${rows.length} message${rows.length === 1 ? "" : "s"}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Subject or message</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r._id} className="align-top">
                  <TableCell className="whitespace-nowrap py-2 text-text-muted">{timeLabel(r.at)}</TableCell>
                  <TableCell className="py-2">{r.channel === "sms" ? "SMS" : "Email"}</TableCell>
                  <TableCell className="max-w-[200px] truncate py-2">{r.to || "-"}</TableCell>
                  <TableCell className="max-w-[160px] truncate py-2">{r.name || "-"}</TableCell>
                  <TableCell className="max-w-[320px] py-2">
                    <span className="line-clamp-2 break-words">{r.subject || r.body || "-"}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-text-muted">{SOURCE_LABEL[r.source] ?? r.source}</TableCell>
                  <TableCell className="py-2">
                    <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"} className="px-2">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    {r.status === "failed" && r.error && <p className="mt-1 max-w-[220px] text-xs text-danger">{r.error}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}
    </div>
  );
}

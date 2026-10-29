"use client";

import { useQuery } from "convex/react";
import { Megaphone } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeLabel } from "./log-tab";

const AUDIENCE_LABEL: Record<string, string> = {
  import: "Imported list",
  contacts: "Contacts",
  staff: "Staff",
  instalments: "Clients on instalments",
  invoices: "Unpaid invoices",
  tenants: "Tenants in arrears",
};

export function CampaignsTab({ onOpen }: { onOpen: (c: { id: Id<"notifyCampaigns">; name: string }) => void }) {
  const list = useQuery(api.notify.campaigns.list);
  if (list === undefined) return <ListSkeleton />;
  if (!list.length) return <EmptyState icon={Megaphone} title="No bulk sends yet" description="Messages you send to a group from the Send tab are listed here with how each went." />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">Click a send to see its messages in the log.</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Recipients from</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Sent</TableHead>
            <TableHead className="text-right">Logged</TableHead>
            <TableHead className="text-right">Queued</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead>By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((c) => (
            <TableRow key={c._id} className="cursor-pointer" onClick={() => onOpen({ id: c._id, name: c.name })}>
              <TableCell className="whitespace-nowrap text-text-muted">{timeLabel(c.createdAt)}</TableCell>
              <TableCell className="font-medium">
                <button type="button" className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); onOpen({ id: c._id, name: c.name }); }}>
                  {c.name}
                </button>
              </TableCell>
              <TableCell>{AUDIENCE_LABEL[c.audience] ?? c.audience}</TableCell>
              <TableCell className="text-right">{c.total}</TableCell>
              <TableCell className="text-right">{c.sent}</TableCell>
              <TableCell className="text-right">{c.logged}</TableCell>
              <TableCell className="text-right">{c.queued}</TableCell>
              <TableCell className={`text-right ${c.failed ? "text-danger" : ""}`}>{c.failed}</TableCell>
              <TableCell>{c.by}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

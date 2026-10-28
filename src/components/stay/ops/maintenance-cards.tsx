"use client";

import Link from "next/link";
import { Camera, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { maintenanceStatusVariant } from "@/lib/stay-ops/labels";
import { formatMoney } from "@/lib/currency";
import type { Doc } from "../../../../convex/_generated/dataModel";

export type MaintenanceItem = {
  _id: string;
  title: string;
  status: "new" | "in_progress" | "done";
  statusLabel: string;
  unitLabel: string;
  propertyTitle: string;
  assigneeName?: string;
  cost?: number;
  currency?: "USD" | "ZiG";
  photoCount: number;
  createdAt: number;
  landlordApproval?: Doc<"stayMaintenance">["landlordApproval"];
};

/** Tappable cards, one per request. Works at phone width. */
export function MaintenanceCards({ items, showUnit = true }: { items: MaintenanceItem[]; showUnit?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((m) => (
        <Link
          key={m._id}
          href={`/app/stay/maintenance/${m._id}`}
          className="block rounded-[12px] border border-border-strong bg-card-bg p-4 transition-colors hover:border-primary/60"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{m.title}</p>
            <Badge variant={maintenanceStatusVariant[m.status]}>{m.statusLabel}</Badge>
          </div>
          {showUnit && (
            <p className="mt-1 text-sm text-text-muted">
              {m.propertyTitle}, {m.unitLabel}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5" />
              {m.assigneeName ?? "Unassigned"}
            </span>
            {m.photoCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Camera className="h-3.5 w-3.5" />
                {m.photoCount}
              </span>
            )}
            {m.cost != null && m.currency && <span>{formatMoney(m.cost, m.currency)}</span>}
            {m.landlordApproval?.status === "pending" && <Badge variant="warning">Awaiting landlord</Badge>}
            {m.landlordApproval?.status === "declined" && <Badge variant="danger">Declined</Badge>}
            <span>{new Date(m.createdAt).toLocaleDateString("en-GB")}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

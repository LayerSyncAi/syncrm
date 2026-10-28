"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/stay-ops/labels";

/** Inspection history for one unit, with a button to start a new one. */
export function UnitInspections({ unitId }: { unitId: Id<"stayUnits"> }) {
  const items = useQuery(api.stay.inspections.list, { unitId });
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Inspections</h3>
        <Link href={`/app/stay/inspections/new?unitId=${unitId}`}>
          <Button size="sm" variant="secondary">
            <Plus className="h-3.5 w-3.5" />
            New inspection
          </Button>
        </Link>
      </div>
      {items === undefined ? (
        <p className="text-sm text-text-muted">Loading</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">No inspections yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[12px] border border-border-strong bg-card-bg">
          {items.map((i) => (
            <li key={i._id}>
              <Link href={`/app/stay/inspections/${i._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-row-hover">
                <div>
                  <p className="text-sm font-medium">{i.typeLabel}</p>
                  <p className="text-xs text-text-muted">{formatDay(i.date)} by {i.inspectorName}</p>
                </div>
                <Badge variant={i.status === "completed" ? "success" : "warning"}>
                  {i.status === "completed" ? "Completed" : "Draft"}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

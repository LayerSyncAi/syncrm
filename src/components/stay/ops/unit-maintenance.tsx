"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { MaintenanceCards } from "./maintenance-cards";
import { MaintenanceForm } from "./maintenance-form";

/** Maintenance requests for one unit, with a button to log a new one. */
export function UnitMaintenance({ unitId }: { unitId: Id<"stayUnits"> }) {
  const items = useQuery(api.stay.maintenance.list, { unitId });
  const [creating, setCreating] = React.useState(false);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Maintenance</h3>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          Log request
        </Button>
      </div>
      {items === undefined ? (
        <p className="text-sm text-text-muted">Loading</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">No requests for this unit.</p>
      ) : (
        <MaintenanceCards items={items} showUnit={false} />
      )}
      <MaintenanceForm open={creating} onClose={() => setCreating(false)} unitId={unitId} />
    </section>
  );
}

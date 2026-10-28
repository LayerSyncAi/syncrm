"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Plus, Wrench } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { useRequireAuth } from "@/hooks/useAuth";
import { MaintenanceCards } from "@/components/stay/ops/maintenance-cards";
import { MaintenanceForm } from "@/components/stay/ops/maintenance-form";
import { MAINTENANCE_STATUSES, type MaintenanceStatus } from "@/lib/stay-ops/labels";

export default function MaintenancePage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
  const [status, setStatus] = React.useState<MaintenanceStatus | "">("");
  const [propertyId, setPropertyId] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const units = useQuery(api.stay.maintenance.unitOptions);
  const items = useQuery(api.stay.maintenance.list, {
    status: status || undefined,
    stayPropertyId: propertyId ? (propertyId as Id<"stayProperties">) : undefined,
  });

  const properties = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const u of units ?? []) m.set(u.stayPropertyId, u.propertyTitle);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [units]);

  if (authLoading) return <ListSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Maintenance</h1>
          <p className="text-sm text-text-muted">Repair requests across your properties.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New request
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Select value={status} onChange={(e) => setStatus(e.target.value as MaintenanceStatus | "")} aria-label="Status">
          <option value="">All statuses</option>
          {MAINTENANCE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Property">
          <option value="">All properties</option>
          {properties.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </Select>
      </div>

      {items === undefined ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No maintenance requests"
          description="Log a request when a tenant reports a fault or an inspection finds one."
          action={<Button onClick={() => setCreating(true)}>New request</Button>}
        />
      ) : (
        <MaintenanceCards items={items} />
      )}

      <MaintenanceForm
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => router.push(`/app/stay/maintenance/${id}`)}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Select } from "@/components/ui/select";
import { useRequireAuth } from "@/hooks/useAuth";
import { INSPECTION_TYPES, formatDay, todayIso, type InspectionType } from "@/lib/stay-ops/labels";

function NewInspection() {
  const { isLoading: authLoading } = useRequireAuth();
  const router = useRouter();
  const search = useSearchParams();

  const units = useQuery(api.stay.maintenance.unitOptions);
  const staff = useQuery(api.stay.maintenance.staffOptions);
  const create = useMutation(api.stay.inspections.create);

  const [unitId, setUnitId] = React.useState(search.get("unitId") ?? "");
  const [type, setType] = React.useState<InspectionType>("routine");
  const [date, setDate] = React.useState(todayIso());
  const [inspector, setInspector] = React.useState("");
  const [leaseId, setLeaseId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const leases = useQuery(
    api.stay.inspections.leasesForUnit,
    unitId ? { unitId: unitId as Id<"stayUnits"> } : "skip"
  );

  // Changing unit drops a lease picked for the previous one.
  React.useEffect(() => setLeaseId(""), [unitId]);

  if (authLoading || units === undefined) return <ListSkeleton />;

  const selected = units.find((u) => u.unitId === unitId);

  const start = async () => {
    if (!unitId) return setError("Pick a unit.");
    setSaving(true);
    setError(null);
    try {
      const id = await create({
        unitId: unitId as Id<"stayUnits">,
        type,
        date,
        inspectorUserId: inspector ? (inspector as Id<"users">) : undefined,
        leaseId: leaseId ? (leaseId as Id<"stayLeases">) : undefined,
      });
      router.replace(`/app/stay/inspections/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the inspection.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/app/stay/inspections" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" />
        Inspections
      </Link>
      <h1 className="text-2xl font-semibold">New inspection</h1>
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Choose a unit</option>
              {units.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.propertyTitle}, {u.label}
                </option>
              ))}
            </Select>
            {selected && (
              <p className="text-xs text-text-muted">
                {selected.rooms.length || 5} rooms in the checklist
                {selected.tenantName ? `. Current tenant: ${selected.tenantName}` : ""}
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onChange={(e) => setType(e.target.value as InspectionType)}>
                {INSPECTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Inspector</Label>
            <Select value={inspector} onChange={(e) => setInspector(e.target.value)}>
              <option value="">Me</option>
              {(staff ?? []).map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </Select>
          </div>
          {unitId && leases && leases.length > 0 && (
            <div className="space-y-1.5">
              <Label>Lease</Label>
              <Select value={leaseId} onChange={(e) => setLeaseId(e.target.value)}>
                <option value="">Current lease</option>
                {leases.map((l) => (
                  <option key={l.leaseId} value={l.leaseId}>
                    {l.tenantName}, {formatDay(l.startDate)} to {formatDay(l.endDate)} ({l.status})
                  </option>
                ))}
              </Select>
              <p className="text-xs text-text-muted">Pick an ended lease for a move-out after the tenant has left.</p>
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button onClick={start} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Starting" : "Start inspection"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewInspectionPage() {
  return (
    <React.Suspense fallback={<ListSkeleton />}>
      <NewInspection />
    </React.Suspense>
  );
}

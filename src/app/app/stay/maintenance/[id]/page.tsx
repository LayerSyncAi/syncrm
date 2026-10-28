"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Select } from "@/components/ui/select";
import { useRequireAuth } from "@/hooks/useAuth";
import { PhotoStrip } from "@/components/stay/ops/photo-strip";
import { formatMoney } from "@/lib/currency";
import { MAINTENANCE_STATUSES, maintenanceStatusVariant, todayIso, type MaintenanceStatus } from "@/lib/stay-ops/labels";
import type { PhotoItem } from "@/lib/stay-ops/photos";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export default function MaintenanceDetailPage() {
  const { isLoading: authLoading } = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"stayMaintenance">;

  const req = useQuery(api.stay.maintenance.get, { id });
  const staff = useQuery(api.stay.maintenance.staffOptions);
  const update = useMutation(api.stay.maintenance.update);
  const setStatus = useMutation(api.stay.maintenance.setStatus);
  const recordCost = useMutation(api.stay.maintenance.recordCost);
  const setApproval = useMutation(api.stay.maintenance.setLandlordApproval);
  const remove = useMutation(api.stay.maintenance.remove);

  const [cost, setCost] = React.useState("");
  const [currency, setCurrency] = React.useState<"USD" | "ZiG">("USD");
  const [supplier, setSupplier] = React.useState("");
  const [recharge, setRecharge] = React.useState(true);
  const [date, setDate] = React.useState(todayIso());
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const seeded = React.useRef(false);

  // Fill the cost form once from what is already recorded.
  React.useEffect(() => {
    if (!req || seeded.current) return;
    seeded.current = true;
    if (req.cost != null) setCost(String(req.cost));
    if (req.currency) setCurrency(req.currency);
    if (req.expense) {
      setSupplier(req.expense.supplier ?? "");
      setRecharge(req.expense.rechargeToLandlord);
      setDate(req.expense.date);
    }
  }, [req]);

  if (authLoading || req === undefined) return <ListSkeleton />;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const photos: PhotoItem[] = req.photos.map((sid, i) => ({ storageId: sid, url: req.photoUrls[i] ?? "" }));
  const approval = req.landlordApproval;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/app/stay/maintenance" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" />
        Maintenance
      </Link>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">{req.title}</h1>
          <Badge variant={maintenanceStatusVariant[req.status]}>{req.statusLabel}</Badge>
        </div>
        <p className="text-sm text-text-muted">
          {req.propertyTitle}, {req.unitLabel}
          {req.tenantName ? `. Tenant: ${req.tenantName}` : ""}. Logged by {req.raisedByName} on{" "}
          {new Date(req.createdAt).toLocaleDateString("en-GB")}.
        </p>
      </div>

      {error && <p className="rounded-[10px] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger-fg)]">{error}</p>}

      <Card>
        <CardHeader><h2 className="font-medium">Status</h2></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {MAINTENANCE_STATUSES.map((s) => (
              <Button
                key={s.value}
                variant={req.status === s.value ? "primary" : "secondary"}
                disabled={busy}
                onClick={() => run(() => setStatus({ id, status: s.value as MaintenanceStatus }))}
              >
                {s.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-text-muted">The tenant is emailed when the status changes.</p>
          <div className="space-y-1.5">
            <Label>Assigned to</Label>
            <Select
              value={req.assigneeUserId ?? ""}
              onChange={(e) =>
                run(() => update({ id, assigneeUserId: e.target.value ? (e.target.value as Id<"users">) : null }))
              }
            >
              <option value="">Unassigned</option>
              {(staff ?? []).map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Details</h2></CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm">{req.description || "No description."}</p>
          <PhotoStrip
            photos={photos}
            onChange={(next) => run(() => update({ id, photos: next.map((p) => p.storageId as Id<"_storage">) }))}
          />
          {req.inspectionId && (
            <Link href={`/app/stay/inspections/${req.inspectionId}`} className="text-sm text-primary-600 underline">
              Raised from an inspection report
            </Link>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Cost</h2></CardHeader>
        <CardContent className="space-y-4">
          {req.cost != null && req.currency && (
            <p className="text-sm">
              Recorded: <strong>{formatMoney(req.cost, req.currency)}</strong>
              {req.expense?.supplier ? ` to ${req.expense.supplier}` : ""}
              {req.expense ? (req.expense.rechargeToLandlord ? ". Recharged to the landlord." : ". Not recharged.") : ""}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "ZiG")}>
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={recharge} onChange={(e) => setRecharge(e.target.checked)} className="h-4 w-4" />
            Recharge to the landlord on their statement
          </label>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const amount = parseFloat(cost.replace(/,/g, ""));
                if (!(amount > 0)) throw new Error("Enter a cost above zero.");
                await recordCost({
                  id,
                  cost: amount,
                  currency,
                  supplier: supplier || undefined,
                  rechargeToLandlord: recharge,
                  date,
                });
              })
            }
          >
            {req.expenseId ? "Update cost" : "Record cost"}
          </Button>
        </CardContent>
      </Card>

      {approval && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <h2 className="font-medium">Landlord approval</h2>
            <Badge variant={approval.status === "approved" ? "success" : approval.status === "declined" ? "danger" : "warning"}>
              {approval.status === "approved" ? "Approved" : approval.status === "declined" ? "Declined" : "Pending"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-text-muted">
              The cost is above the property&apos;s repair threshold
              {req.repairApprovalThreshold != null ? ` of ${req.repairApprovalThreshold}` : ""}. Record the landlord&apos;s
              decision here until the landlord portal is live.
            </p>
            {approval.note && <p className="text-sm">{approval.note}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={busy} onClick={() => run(() => setApproval({ id, status: "approved" }))}>Mark approved</Button>
              <Button variant="secondary" disabled={busy} onClick={() => run(() => setApproval({ id, status: "declined" }))}>
                Mark declined
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!req.expenseId && (
        <Button
          variant="ghost"
          className="text-danger"
          disabled={busy}
          onClick={() => {
            if (!window.confirm("Delete this request?")) return;
            run(async () => {
              await remove({ id });
              router.push("/app/stay/maintenance");
            });
          }}
        >
          Delete request
        </Button>
      )}
    </div>
  );
}

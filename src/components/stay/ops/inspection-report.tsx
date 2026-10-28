"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Download, Send, Wrench } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { downloadInspectionPdf } from "@/lib/stay-ops/inspection-pdf";
import {
  conditionChange,
  conditionLabel,
  conditionVariant,
  formatDay,
  pairRooms,
  type Condition,
} from "@/lib/stay-ops/labels";
import { PhotoGallery } from "./photo-strip";

type Detail = NonNullable<FunctionReturnType<typeof api.stay.inspections.get>>;
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function ConditionBadge({ c }: { c?: Condition }) {
  return <Badge variant={c ? conditionVariant[c] : "neutral"}>{conditionLabel(c)}</Badge>;
}

/** Read-only report for a completed inspection, with PDF, send, addenda and move-in comparison. */
export function InspectionReport({ inspection: r }: { inspection: Detail }) {
  const org = useQuery(api.hub.getOrgSettings);
  const branding = useQuery(api.branding.get);
  const sendToLandlord = useMutation(api.stay.inspections.sendToLandlord);
  const addAddendum = useMutation(api.stay.inspections.addAddendum);
  const raise = useMutation(api.stay.inspections.raiseMaintenance);

  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [raised, setRaised] = React.useState<Record<string, string>>({});

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

  const pdf = () =>
    run(() =>
      downloadInspectionPdf(r, {
        name: org?.name ?? branding?.orgName ?? "",
        address: org?.address,
        phone: org?.phone,
        email: org?.email,
        logoUrl: branding?.logoUrl,
      })
    );

  const pairs = r.moveIn ? pairRooms(r.rooms, r.moveIn.rooms) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">{r.typeLabel} inspection</h1>
          <Badge variant="success">Completed</Badge>
        </div>
        <p className="text-sm text-text-muted">
          {r.propertyTitle}, {r.unitLabel}. {formatDay(r.date)} by {r.inspectorName}
          {r.tenantName ? `. Tenant: ${r.tenantName}` : ""}
        </p>
      </div>

      {error && <p className="rounded-[10px] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger-fg)]">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={pdf} disabled={busy}>
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
        {r.canSend && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => sendToLandlord({ id: r._id }))}
          >
            <Send className="h-4 w-4" />
            {r.sentToLandlordAt ? "Send to landlord again" : "Send to landlord"}
          </Button>
        )}
        {r.sentToLandlordAt && (
          <span className="self-center text-xs text-text-muted">
            Sent {new Date(r.sentToLandlordAt).toLocaleDateString("en-GB")}
          </span>
        )}
      </div>

      {(r.meterReadings?.water || r.meterReadings?.electricity) && (
        <Card>
          <CardContent className="grid gap-2 pt-5 text-sm sm:grid-cols-2">
            {r.meterReadings?.water && <p>Water meter: <strong>{r.meterReadings.water}</strong></p>}
            {r.meterReadings?.electricity && <p>Electricity meter: <strong>{r.meterReadings.electricity}</strong></p>}
            {r.moveIn?.meterReadings?.water && <p className="text-text-muted">Move-in water: {r.moveIn.meterReadings.water}</p>}
            {r.moveIn?.meterReadings?.electricity && (
              <p className="text-text-muted">Move-in electricity: {r.moveIn.meterReadings.electricity}</p>
            )}
          </CardContent>
        </Card>
      )}

      {pairs ? (
        <div className="space-y-3">
          <h2 className="font-medium">Move-in compared with move-out</h2>
          {pairs.map((p) => {
            const change = conditionChange(p.in?.condition, p.out?.condition);
            return (
              <Card key={p.name}>
                <CardHeader className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{p.name}</h3>
                  {change === "worse" && <Badge variant="danger">Worse than move-in</Badge>}
                  {change === "better" && <Badge variant="success">Better than move-in</Badge>}
                  {change === "same" && <Badge variant="neutral">Unchanged</Badge>}
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  {[
                    { label: `Move-in ${r.moveIn ? formatDay(r.moveIn.date) : ""}`, room: p.in },
                    { label: `Move-out ${formatDay(r.date)}`, room: p.out },
                  ].map((side) => (
                    <div key={side.label} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{side.label}</p>
                      {side.room ? (
                        <>
                          <ConditionBadge c={side.room.condition} />
                          {side.room.note && <p className="text-sm">{side.room.note}</p>}
                          <PhotoGallery urls={side.room.photoUrls} />
                        </>
                      ) : (
                        <p className="text-sm text-text-muted">Not recorded</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {r.rooms.map((room) => (
            <Card key={room.name}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{room.name}</h3>
                    <ConditionBadge c={room.condition} />
                  </div>
                  {(room.condition === "poor" || room.condition === "damaged") &&
                    (raised[room.name] ? (
                      <Link href={`/app/stay/maintenance/${raised[room.name]}`} className="text-sm text-primary-600 underline">
                        Request raised. Open it
                      </Link>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const id = await raise({ id: r._id, roomName: room.name });
                            setRaised((m) => ({ ...m, [room.name]: id }));
                          })
                        }
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        Raise maintenance request
                      </Button>
                    ))}
                </div>
                {room.note && <p className="text-sm">{room.note}</p>}
                <PhotoGallery urls={room.photoUrls} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {r.comments && (
        <Card>
          <CardHeader><h2 className="font-medium">Overall comments</h2></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{r.comments}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><h2 className="font-medium">Addenda</h2></CardHeader>
        <CardContent className="space-y-3">
          {r.addenda.length === 0 && <p className="text-sm text-text-muted">The report is locked. Later remarks are added here with their date.</p>}
          {r.addenda.map((a) => (
            <div key={a.at} className="rounded-[10px] bg-surface-2 p-3 text-sm">
              <p className="whitespace-pre-wrap">{a.note}</p>
              <p className="mt-1 text-xs text-text-muted">{a.byName}, {new Date(a.at).toLocaleString("en-GB")}</p>
            </div>
          ))}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add an addendum" />
          <Button
            variant="secondary"
            disabled={busy || !note.trim()}
            onClick={() =>
              run(async () => {
                await addAddendum({ id: r._id, note });
                setNote("");
              })
            }
          >
            Add addendum
          </Button>
        </CardContent>
      </Card>

      {r.tenantAck && (
        <p className="text-sm text-text-muted">
          Acknowledged by the tenant on {new Date(r.tenantAck.at).toLocaleDateString("en-GB")}
          {r.tenantAck.comment ? `: ${r.tenantAck.comment}` : ""}
        </p>
      )}
    </div>
  );
}

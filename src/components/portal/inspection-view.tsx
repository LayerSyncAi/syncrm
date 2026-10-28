"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { Download } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { downloadInspectionPdf, type ReportData } from "@/lib/stay-ops/inspection-pdf";
import { conditionLabel, conditionVariant, formatDay, type Condition } from "@/lib/stay-ops/labels";
import { PhotoGallery } from "@/components/stay/ops/photo-strip";
import { errText, PortalLoading, usePortal, type PortalKind } from "./common";

function Cond({ c }: { c?: Condition }) {
  return <Badge variant={c ? conditionVariant[c] : "neutral"}>{conditionLabel(c)}</Badge>;
}

/** Read-only report. Tenants can accept it or comment; both can download the PDF. */
export function PortalInspectionView({ id, kind }: { id: string; kind: PortalKind }) {
  const portal = usePortal();
  const inspectionId = id as Id<"stayInspections">;
  const tenantReport = useQuery(api.portal.tenant.inspection, kind === "tenant" ? { inspectionId } : "skip");
  const landlordReport = useQuery(api.portal.landlord.inspection, kind === "landlord" ? { inspectionId } : "skip");
  const r = kind === "tenant" ? tenantReport : landlordReport;
  const acknowledge = useMutation(api.portal.tenant.acknowledgeInspection);

  const [comment, setComment] = React.useState("");
  const [commenting, setCommenting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (r === undefined) return <PortalLoading />;

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
      downloadInspectionPdf(r as ReportData, {
        name: portal?.orgName ?? "",
        phone: portal?.orgPhone ?? undefined,
        email: portal?.orgEmail ?? undefined,
      })
    );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-text">{r.typeLabel} report</h1>
          <Badge variant="success">Completed</Badge>
        </div>
        <p className="text-sm text-text-muted">
          {r.propertyTitle}, {r.unitLabel}. {formatDay(r.date)}
        </p>
      </div>

      {error && <p className="rounded-[10px] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger-fg)]">{error}</p>}

      <Button variant="secondary" size="lg" className="w-full sm:w-auto" onClick={pdf} disabled={busy}>
        <Download className="h-4 w-4" />
        Download PDF
      </Button>

      {(r.meterReadings?.water || r.meterReadings?.electricity) && (
        <Card>
          <CardContent className="space-y-1 pt-5 text-sm">
            {r.meterReadings?.water && <p>Water meter: <strong>{r.meterReadings.water}</strong></p>}
            {r.meterReadings?.electricity && <p>Electricity meter: <strong>{r.meterReadings.electricity}</strong></p>}
          </CardContent>
        </Card>
      )}

      {r.rooms.map((room) => (
        <Card key={room.name}>
          <CardContent className="space-y-2 pt-5">
            <div className="flex items-center gap-2">
              <h2 className="font-medium text-text">{room.name}</h2>
              <Cond c={room.condition} />
            </div>
            {room.note && <p className="text-sm text-text">{room.note}</p>}
            <PhotoGallery urls={room.photoUrls} />
          </CardContent>
        </Card>
      ))}

      {r.comments && (
        <Card>
          <CardHeader><h2 className="font-medium text-text">Overall comments</h2></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{r.comments}</p></CardContent>
        </Card>
      )}

      {r.addenda.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-medium text-text">Later remarks</h2></CardHeader>
          <CardContent className="space-y-3">
            {r.addenda.map((a) => (
              <div key={a.at} className="rounded-[10px] bg-surface-2 p-3 text-sm">
                <p className="whitespace-pre-wrap">{a.note}</p>
                <p className="mt-1 text-xs text-text-muted">{new Date(a.at).toLocaleDateString("en-GB")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {kind === "tenant" && (
        r.tenantAck ? (
          <p className="text-sm text-text-muted">
            You responded on {new Date(r.tenantAck.at).toLocaleDateString("en-GB")}
            {r.tenantAck.comment ? `: ${r.tenantAck.comment}` : "."}
          </p>
        ) : (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <p className="text-sm text-text">Check the report and accept it, or tell the agency what you disagree with.</p>
              {commenting && (
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="Your comments" />
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                {!commenting ? (
                  <>
                    <Button size="lg" disabled={busy} onClick={() => run(() => acknowledge({ inspectionId }))}>
                      Accept report
                    </Button>
                    <Button size="lg" variant="secondary" onClick={() => setCommenting(true)}>
                      Add comments
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="lg"
                      disabled={busy || !comment.trim()}
                      onClick={() => run(() => acknowledge({ inspectionId, comment }))}
                    >
                      Send comments
                    </Button>
                    <Button size="lg" variant="ghost" onClick={() => setCommenting(false)}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}

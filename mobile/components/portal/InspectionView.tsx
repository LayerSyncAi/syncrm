/** Read-only inspection report. Tenants can accept it or comment; both can share the PDF. */
import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, Field, Loading, Notice, Screen, Section, Title, type BadgeTone } from "../ui";
import { Photos, usePortal, type PortalKind } from "./common";
import { shareInspectionPdf } from "../../lib/portal/pdf";
import { useRun } from "../../lib/useRun";
import { dateLabel } from "../../lib/format";
import { conditionLabel, conditionVariant, type Condition } from "@/lib/stay-ops/labels";
import { colors, font, space } from "../../lib/theme";

function Cond({ c }: { c?: Condition }) {
  return <Badge label={conditionLabel(c)} tone={(c ? conditionVariant[c] : "neutral") as BadgeTone} />;
}

export function PortalInspectionView({ id, kind }: { id: string; kind: PortalKind }) {
  const portal = usePortal();
  const inspectionId = id as Id<"stayInspections">;
  const tenantReport = useQuery(api.portal.tenant.inspection, kind === "tenant" ? { inspectionId } : "skip");
  const landlordReport = useQuery(api.portal.landlord.inspection, kind === "landlord" ? { inspectionId } : "skip");
  const r = kind === "tenant" ? tenantReport : landlordReport;
  const acknowledge = useMutation(api.portal.tenant.acknowledgeInspection);
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const { busy, run } = useRun();

  if (r === undefined) return <Loading />;

  return (
    <Screen>
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
          <Title>{r.typeLabel} report</Title>
          <Badge label="Completed" tone="success" />
        </View>
        <Body muted>
          {r.propertyTitle}, {r.unitLabel}. {dateLabel(r.date)}
        </Body>
      </View>

      <Button
        title="Share PDF"
        icon="share-outline"
        variant="secondary"
        loading={busy}
        onPress={() =>
          run(() => shareInspectionPdf(r, { name: portal?.orgName ?? "", phone: portal?.orgPhone, email: portal?.orgEmail, logoUrl: portal?.logoUrl }))
        }
      />

      {(r.meterReadings?.water || r.meterReadings?.electricity) && (
        <Card style={{ gap: space.xs }}>
          {r.meterReadings?.water ? <Body>Water meter: <Text style={{ fontWeight: "700" }}>{r.meterReadings.water}</Text></Body> : null}
          {r.meterReadings?.electricity ? <Body>Electricity meter: <Text style={{ fontWeight: "700" }}>{r.meterReadings.electricity}</Text></Body> : null}
        </Card>
      )}

      {r.rooms.map((room) => (
        <Card key={room.name} style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text, flexShrink: 1 }}>{room.name}</Text>
            <Cond c={room.condition as Condition | undefined} />
          </View>
          {room.note ? <Body>{room.note}</Body> : null}
          <Photos urls={room.photoUrls} />
        </Card>
      ))}

      {r.comments ? (
        <Section title="Overall comments">
          <Card>
            <Body>{r.comments}</Body>
          </Card>
        </Section>
      ) : null}

      {r.addenda.length > 0 && (
        <Section title="Later remarks">
          {r.addenda.map((a) => (
            <Card key={a.at} style={{ gap: space.xs }}>
              <Body>{a.note}</Body>
              <Body small muted>{dateLabel(a.at)}</Body>
            </Card>
          ))}
        </Section>
      )}

      {kind === "tenant" &&
        (r.tenantAck ? (
          <Body muted>
            You responded on {dateLabel(r.tenantAck.at)}
            {r.tenantAck.comment ? `: ${r.tenantAck.comment}` : "."}
          </Body>
        ) : (
          <Card style={{ gap: space.md }}>
            <Notice>Check the report and accept it, or tell the agency what you disagree with.</Notice>
            {commenting && <Field label="Your comments" value={comment} onChangeText={setComment} multiline numberOfLines={4} />}
            {!commenting ? (
              <>
                <Button title="Accept report" loading={busy} onPress={() => run(() => acknowledge({ inspectionId }))} />
                <Button title="Add comments" variant="secondary" onPress={() => setCommenting(true)} />
              </>
            ) : (
              <>
                <Button title="Send comments" loading={busy} disabled={!comment.trim()} onPress={() => run(() => acknowledge({ inspectionId, comment }))} />
                <Button title="Cancel" variant="ghost" onPress={() => setCommenting(false)} />
              </>
            )}
          </Card>
        ))}
    </Screen>
  );
}

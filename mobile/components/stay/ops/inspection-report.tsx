import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import { Badge, Body, Button, Card, Field, Row, Screen, Section } from "../../ui";
import { ConditionBadge } from "./condition-chips";
import { PhotoGallery } from "./photo-strip";
import { dateLabel, dateTimeLabel } from "../../../lib/format";
import { sharePdf } from "../../../lib/files";
import { inspectionReportHtml } from "../../../lib/stay-ops/inspection-pdf";
import { useRun } from "../../../lib/useRun";
import { colors, font, space } from "../../../lib/theme";
import { conditionChange, formatDay, pairRooms } from "@/lib/stay-ops/labels";

type Detail = NonNullable<FunctionReturnType<typeof api.stay.inspections.get>>;

/** Read-only report for a completed inspection, with PDF, send, addenda and move-in comparison. */
export function InspectionReport({ inspection: r }: { inspection: Detail }) {
  const router = useRouter();
  const org = useQuery(api.hub.getOrgSettings);
  const branding = useQuery(api.branding.get);
  const sendToLandlord = useMutation(api.stay.inspections.sendToLandlord);
  const addAddendum = useMutation(api.stay.inspections.addAddendum);
  const raise = useMutation(api.stay.inspections.raiseMaintenance);
  const { busy, run } = useRun();

  const [note, setNote] = useState("");
  const [raised, setRaised] = useState<Record<string, string>>({});

  const pdf = () =>
    run(() =>
      sharePdf(
        inspectionReportHtml(r, { name: org?.name ?? branding?.orgName ?? "", address: org?.address, phone: org?.phone, email: org?.email, logoUrl: branding?.logoUrl }),
        `${r.typeLabel} inspection ${r.unitLabel}.pdf`
      )
    );

  const pairs = r.moveIn ? pairRooms(r.rooms, r.moveIn.rooms) : null;
  const meters = [
    r.meterReadings?.water && `Water meter: ${r.meterReadings.water}`,
    r.meterReadings?.electricity && `Electricity meter: ${r.meterReadings.electricity}`,
    r.moveIn?.meterReadings?.water && `Move-in water: ${r.moveIn.meterReadings.water}`,
    r.moveIn?.meterReadings?.electricity && `Move-in electricity: ${r.moveIn.meterReadings.electricity}`,
  ].filter(Boolean) as string[];

  const raiseButton = (roomName: string) =>
    raised[roomName] ? (
      <Button small variant="ghost" icon="open-outline" title="Request raised. Open it" onPress={() => router.push(`/stay/maintenance/${raised[roomName]}` as Href)} />
    ) : (
      <Button
        small
        variant="secondary"
        icon="construct-outline"
        title="Raise maintenance request"
        disabled={busy}
        onPress={() =>
          run(async () => {
            const id = await raise({ id: r._id, roomName });
            setRaised((m) => ({ ...m, [roomName]: id }));
          })
        }
      />
    );

  return (
    <Screen contentStyle={{ gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Row>
          <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text, flex: 1 }}>{r.typeLabel} inspection</Text>
          <Badge label="Completed" tone="success" />
        </Row>
        <Body muted small>{`${r.propertyTitle}, ${r.unitLabel}. ${formatDay(r.date)} by ${r.inspectorName}${r.tenantName ? `. Tenant: ${r.tenantName}` : ""}`}</Body>
      </View>

      <View style={{ gap: space.sm }}>
        <Button icon="share-outline" title="Share PDF" loading={busy} onPress={pdf} />
        {r.canSend && (
          <Button
            style={{ flex: 1 }}
            variant="secondary"
            icon="send-outline"
            title={r.sentToLandlordAt ? "Send again" : "Send to landlord"}
            disabled={busy}
            onPress={() => run(() => sendToLandlord({ id: r._id }), { success: "Sent to the landlord" })}
          />
        )}
      </View>
      {r.sentToLandlordAt ? <Body small muted>{`Sent to the landlord on ${dateLabel(r.sentToLandlordAt)}`}</Body> : null}

      {meters.length > 0 && (
        <Card style={{ gap: space.xs }}>
          {meters.map((m) => (
            <Body key={m}>{m}</Body>
          ))}
        </Card>
      )}

      {pairs ? (
        <Section title="Move-in compared with move-out">
          {pairs.map((p) => {
            const change = conditionChange(p.in?.condition, p.out?.condition);
            return (
              <Card key={p.name} style={{ gap: space.md }}>
                <Row>
                  <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text, flex: 1 }}>{p.name}</Text>
                  {change === "worse" && <Badge label="Worse than move-in" tone="danger" />}
                  {change === "better" && <Badge label="Better than move-in" tone="success" />}
                  {change === "same" && <Badge label="Unchanged" tone="neutral" />}
                </Row>
                {[
                  { label: `Move-in ${r.moveIn ? formatDay(r.moveIn.date) : ""}`, room: p.in },
                  { label: `Move-out ${formatDay(r.date)}`, room: p.out },
                ].map((side) => (
                  <View key={side.label} style={{ gap: space.sm }}>
                    <Text style={{ fontSize: font.xs, fontWeight: "700", color: colors.muted, textTransform: "uppercase" }}>{side.label}</Text>
                    {side.room ? (
                      <>
                        <View style={{ alignSelf: "flex-start" }}><ConditionBadge c={side.room.condition} /></View>
                        {side.room.note ? <Body>{side.room.note}</Body> : null}
                        <PhotoGallery urls={side.room.photoUrls} />
                      </>
                    ) : (
                      <Body muted small>Not recorded</Body>
                    )}
                  </View>
                ))}
                {p.out && (p.out.condition === "poor" || p.out.condition === "damaged") && raiseButton(p.out.name)}
              </Card>
            );
          })}
        </Section>
      ) : (
        <Section title="Rooms">
          {r.rooms.map((room) => (
            <Card key={room.name} style={{ gap: space.sm }}>
              <Row>
                <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text, flex: 1 }}>{room.name}</Text>
                <ConditionBadge c={room.condition} />
              </Row>
              {room.note ? <Body>{room.note}</Body> : null}
              <PhotoGallery urls={room.photoUrls} />
              {(room.condition === "poor" || room.condition === "damaged") && raiseButton(room.name)}
            </Card>
          ))}
        </Section>
      )}

      {r.comments ? (
        <Section title="Overall comments">
          <Card><Body>{r.comments}</Body></Card>
        </Section>
      ) : null}

      <Section title="Addenda">
        <Card style={{ gap: space.md }}>
          {r.addenda.length === 0 && <Body small muted>The report is locked. Later remarks are added here with their date.</Body>}
          {r.addenda.map((a) => (
            <View key={a.at} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: space.md, gap: 4 }}>
              <Body>{a.note}</Body>
              <Body small muted>{`${a.byName}, ${dateTimeLabel(a.at)}`}</Body>
            </View>
          ))}
          <Field label="New addendum" value={note} onChangeText={setNote} multiline />
          <Button
            variant="secondary"
            title="Add addendum"
            disabled={busy || !note.trim()}
            onPress={() =>
              run(async () => {
                await addAddendum({ id: r._id, note });
                setNote("");
              })
            }
          />
        </Card>
      </Section>

      {r.tenantAck ? (
        <Body small muted>{`Acknowledged by the tenant on ${dateLabel(r.tenantAck.at)}${r.tenantAck.comment ? `: ${r.tenantAck.comment}` : ""}`}</Body>
      ) : null}
    </Screen>
  );
}

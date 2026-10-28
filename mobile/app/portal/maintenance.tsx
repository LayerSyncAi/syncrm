/** Repairs: a tenant lists and reports them; a landlord sees them and decides pending approvals. */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Field, Loading, Screen, Title, type BadgeTone } from "../../components/ui";
import { PhotoStrip, usePortal } from "../../components/portal/common";
import { RepairForm } from "../../components/portal/RepairForm";
import { useRun } from "../../lib/useRun";
import { dateLabel, money } from "../../lib/format";
import { maintenanceStatusVariant } from "@/lib/stay-ops/labels";
import { colors, font, space } from "../../lib/theme";

function TenantRepairs() {
  const rows = useQuery(api.portal.tenant.maintenance);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Screen>
      <Title>Repairs</Title>
      <Button title="Report a repair" icon="construct-outline" onPress={() => setOpen(true)} />
      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon="construct-outline" title="No repair requests" message="Anything you report will be listed here with its status." />
      ) : (
        rows.map((r) => (
          <Card key={r._id} style={{ gap: space.sm }}>
            <Pressable onPress={() => setOpenId(openId === r._id ? null : r._id)} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{r.title}</Text>
                <Body small muted>{r.propertyTitle}, {r.unitLabel}. {dateLabel(r.createdAt)}</Body>
              </View>
              <Badge label={r.statusLabel} tone={maintenanceStatusVariant[r.status] as BadgeTone} />
            </Pressable>
            {openId === r._id && (
              <>
                <Body>{r.description}</Body>
                <PhotoStrip urls={r.photoUrls} count={r.photoCount} />
              </>
            )}
          </Card>
        ))
      )}
      <RepairForm open={open} onClose={() => setOpen(false)} />
    </Screen>
  );
}

function DecideButtons({ id }: { id: Id<"stayMaintenance"> }) {
  const decide = useMutation(api.portal.landlord.decideRepair);
  const [note, setNote] = useState("");
  const { busy, run } = useRun();
  const go = (status: "approved" | "declined") => run(() => decide({ maintenanceId: id, status, note: note || undefined }));
  return (
    <View style={{ gap: space.sm, backgroundColor: colors.surface, borderRadius: 10, padding: space.md }}>
      <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>Your approval is needed</Text>
      <Field label="Note (optional)" value={note} onChangeText={setNote} multiline numberOfLines={2} />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Approve" style={{ flex: 1 }} disabled={busy} onPress={() => go("approved")} />
        <Button title="Decline" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => go("declined")} />
      </View>
    </View>
  );
}

function LandlordRepairs() {
  const rows = useQuery(api.portal.landlord.maintenance);
  if (rows === undefined) return <Loading />;
  return (
    <Screen>
      <Title>Repairs</Title>
      {rows.length === 0 ? (
        <EmptyState icon="construct-outline" title="No repair requests" message="Repairs on your properties will be listed here." />
      ) : (
        rows.map((r) => {
          const a = r.landlordApproval;
          return (
            <Card key={r._id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{r.title}</Text>
                  <Body small muted>{r.propertyTitle}, {r.unitLabel}. {dateLabel(r.createdAt)}</Body>
                </View>
                <Badge label={r.statusLabel} tone={maintenanceStatusVariant[r.status] as BadgeTone} />
              </View>
              <Body>{r.description}</Body>
              <Body small muted>
                {r.assigneeName ? `Assigned to ${r.assigneeName}` : "Not assigned yet"}
                {r.cost != null && r.currency ? `. Cost ${money(r.cost, r.currency)}` : ""}
              </Body>
              {a && a.status !== "pending" && (
                <Body muted>
                  You {a.status} this repair{a.note ? `: ${a.note}` : "."}
                </Body>
              )}
              <PhotoStrip urls={r.photoUrls} count={r.photoCount} />
              {a?.status === "pending" && <DecideButtons id={r._id} />}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

export default function PortalMaintenance() {
  const portal = usePortal();
  if (portal === undefined) return <Loading />;
  if (!portal) return <EmptyState icon="lock-closed-outline" title="Not available" message="This page is not part of your portal." />;
  return portal.kind === "tenant" ? <TenantRepairs /> : <LandlordRepairs />;
}

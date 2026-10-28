/**
 * The top of a lead: who they are, one-tap call, WhatsApp and email, what they
 * want, where they sit in the pipeline, their score and, once closed, the
 * close reason and deal value.
 */
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { Badge, Button, Card, Facts, Field, Ionicons, Row, Title } from "../../ui";
import { useRun } from "../../../lib/useRun";
import { dateLabel } from "../../../lib/format";
import { budgetLabel, interestLabel, leadSourceLabel, leadStatus, parseMoney, whatsappUrl, type StageLite } from "../../../lib/crm/leads/helpers";
import { Bar, MoneyField, Tag } from "./bits";
import { colors, font, radius, space } from "../../../lib/theme";

type ScoreBreakdown = { totalScore: number; maxPossible: number; breakdown: Array<{ key: string; label: string; met: boolean; points: number; maxPoints: number }> };

export function LeadHero({
  lead,
  stage,
  owner,
  stages,
  score,
  onMove,
  onEdit,
}: {
  lead: Doc<"leads">;
  stage: StageLite | null;
  owner: { fullName?: string; name?: string; email?: string } | null;
  stages: StageLite[] | undefined;
  score: ScoreBreakdown | null | undefined;
  onMove: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [scoreOpen, setScoreOpen] = useState(false);
  const status = leadStatus(lead.closedAt, stage?.terminalOutcome);
  const open = stages?.filter((s) => !s.isTerminal) ?? [];
  const maxOrder = Math.max(1, ...open.map((s) => s.order));
  const progress = lead.closedAt ? 100 : Math.round(((stage?.order ?? 1) / maxOrder) * 100);
  const locked = !!(lead.closedAt && lead.closeReason);
  const lost = !!lead.closedAt && stage?.terminalOutcome === "lost";

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ gap: space.sm }}>
        <Title>{lead.fullName}</Title>
        <Row style={{ flexWrap: "wrap" }}>
          <Badge label={status.label} tone={status.tone} />
          <Badge label={interestLabel(lead.interestType, true)} tone={lead.interestType === "buy" ? "success" : "info"} />
          <Badge label={leadSourceLabel(lead.source)} />
        </Row>
      </View>

      <Row style={{ flexWrap: "wrap" }}>
        {lead.phone ? <Button small variant="secondary" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${lead.phone}`)} /> : null}
        {lead.phone ? <Button small variant="secondary" icon="logo-whatsapp" title="WhatsApp" onPress={() => Linking.openURL(whatsappUrl(lead.phone!))} /> : null}
        {lead.email ? <Button small variant="secondary" icon="mail-outline" title="Email" onPress={() => Linking.openURL(`mailto:${lead.email}`)} /> : null}
        <Button small variant="ghost" icon="person-outline" title="Contact" onPress={() => router.push(`/crm/contacts/${lead.contactId}` as Href)} />
      </Row>

      <Facts
        items={[
          { label: "Phone", value: lead.phone ?? "" },
          { label: "Email", value: lead.email ?? "" },
          { label: "Owner", value: owner?.fullName || owner?.name || owner?.email || "Unassigned" },
          { label: "Budget", value: budgetLabel(lead.budgetMin, lead.budgetMax, lead.budgetCurrency) },
          { label: "Created", value: dateLabel(lead.createdAt) },
        ]}
      />
      {lead.preferredAreas.length > 0 && (
        <Row style={{ flexWrap: "wrap" }}>
          {lead.preferredAreas.map((a) => (
            <Tag key={a} label={a} />
          ))}
        </Row>
      )}
      <Button small variant="secondary" icon="create-outline" title="Edit details" onPress={onEdit} />

      <View style={{ gap: 6 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>Stage progress</Text>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>{progress}%</Text>
        </Row>
        <Bar percent={progress} color={lost ? colors.danger : colors.primary} />
      </View>

      <Pressable
        onPress={locked ? undefined : onMove}
        disabled={locked}
        accessibilityLabel="Change stage"
        style={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>Stage</Text>
          <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{stage?.name ?? "Unknown"}</Text>
        </View>
        {!locked && <Text style={{ color: colors.brand, fontWeight: "600" }}>Move</Text>}
        {!locked && <Ionicons name="chevron-forward" size={16} color={colors.brand} />}
      </Pressable>

      {stage?.isTerminal && <CloseDetails lead={lead} won={stage.terminalOutcome === "won"} saved={locked} />}

      {score && (
        <View style={{ gap: 6 }}>
          <Pressable onPress={() => setScoreOpen((o) => !o)} style={{ gap: 6 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Row style={{ gap: 4 }}>
                <Text style={{ fontSize: font.xs, color: colors.muted }}>Lead score</Text>
                <Ionicons name={scoreOpen ? "chevron-up" : "chevron-down"} size={12} color={colors.muted} />
              </Row>
              <Text style={{ fontSize: font.sm, fontWeight: "700", color: score.totalScore >= 70 ? colors.success : score.totalScore >= 40 ? colors.warning : colors.danger }}>
                {score.totalScore}/{score.maxPossible}
              </Text>
            </Row>
            <Bar
              percent={score.maxPossible ? (score.totalScore / score.maxPossible) * 100 : 0}
              color={score.totalScore >= 70 ? colors.success : score.totalScore >= 40 ? colors.warning : colors.danger}
            />
          </Pressable>
          {scoreOpen &&
            score.breakdown.map((b) => (
              <Row key={b.key} style={{ justifyContent: "space-between" }}>
                <Row style={{ gap: 6, flex: 1 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: b.met ? colors.success : colors.border }} />
                  <Text style={{ fontSize: font.xs, color: colors.muted, flex: 1 }}>{b.label}</Text>
                </Row>
                <Text style={{ fontSize: font.xs, color: b.met ? colors.success : colors.faint, fontWeight: b.met ? "600" : "400" }}>
                  {b.points}/{b.maxPoints}
                </Text>
              </Row>
            ))}
        </View>
      )}
    </Card>
  );
}

/** Reason and, for a win, the deal value. Editable until saved, as on the website. */
function CloseDetails({ lead, won, saved }: { lead: Doc<"leads">; won: boolean; saved: boolean }) {
  const updateCloseDetails = useMutation(api.leads.updateCloseDetails);
  const { busy, run } = useRun();
  const [reason, setReason] = useState(lead.closeReason ?? "");
  const [value, setValue] = useState(lead.dealValue ? String(lead.dealValue) : "");
  const [currency, setCurrency] = useState(lead.dealCurrency || "USD");
  useEffect(() => {
    setReason(lead.closeReason ?? "");
    setValue(lead.dealValue ? String(lead.dealValue) : "");
    setCurrency(lead.dealCurrency || "USD");
  }, [lead.closeReason, lead.dealValue, lead.dealCurrency]);

  if (saved) {
    return (
      <Facts
        items={[
          { label: "Close reason", value: lead.closeReason ?? "" },
          { label: "Deal value", value: won && lead.dealValue ? `${lead.dealCurrency || "USD"} ${lead.dealValue.toLocaleString("en-GB")}` : "" },
          { label: "Closed", value: lead.closedAt ? dateLabel(lead.closedAt) : "" },
        ]}
      />
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      <Field label="Close reason" value={reason} onChangeText={setReason} placeholder="Why it closed" />
      {won && <MoneyField label="Deal value" value={value} onChange={setValue} currency={currency} onCurrency={setCurrency} />}
      <Button
        title="Save close details"
        loading={busy}
        onPress={() =>
          run(() =>
            updateCloseDetails({
              leadId: lead._id,
              closeReason: reason.trim() || undefined,
              dealValue: parseMoney(value) ?? undefined,
              dealCurrency: currency,
            })
          )
        }
      />
    </View>
  );
}

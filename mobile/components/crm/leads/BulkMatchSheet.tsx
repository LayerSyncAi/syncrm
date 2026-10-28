/**
 * Bulk matching: score every open lead against available properties and
 * attach chosen matches in one go (matches.bulkMatchProperties and
 * matches.bulkAttachSuggested, as on the website).
 */
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, Ionicons, Loading, Row, Select, Sheet, Stat, StatGrid } from "../../ui";
import { getErrorMessage } from "@/lib/errors";
import { budgetLabel, interestLabel, matchTone, priceLabel } from "../../../lib/crm/leads/helpers";
import { CheckRow } from "./bits";
import { colors, font, space } from "../../../lib/theme";

const MIN_SCORES = ["30", "40", "50", "60", "70", "80"].map((v) => ({ value: v, label: `${v}%` }));
const TOP_N = ["3", "5", "10"].map((v) => ({ value: v, label: v }));

export function BulkMatchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [minScore, setMinScore] = useState("50");
  const [topN, setTopN] = useState("5");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<string, Set<string>>>(new Map());
  const [busy, setBusy] = useState(false);
  const data = useQuery(api.matches.bulkMatchProperties, open ? { minScore: Number(minScore), topN: Number(topN) } : "skip");
  const bulkAttach = useMutation(api.matches.bulkAttachSuggested);

  const total = Array.from(picked.values()).reduce((n, s) => n + s.size, 0);
  const toggle = (leadId: string, propertyId: string) =>
    setPicked((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(leadId) ?? []);
      if (set.has(propertyId)) set.delete(propertyId);
      else set.add(propertyId);
      if (set.size) next.set(leadId, set);
      else next.delete(leadId);
      return next;
    });

  const attach = async () => {
    const attachments: Array<{ leadId: Id<"leads">; propertyId: Id<"properties"> }> = [];
    picked.forEach((props, leadId) => props.forEach((propertyId) => attachments.push({ leadId: leadId as Id<"leads">, propertyId: propertyId as Id<"properties"> })));
    if (!attachments.length) return;
    setBusy(true);
    try {
      const r = await bulkAttach({ attachments });
      setPicked(new Map());
      Alert.alert("Matches attached", `${r.successCount} attached${r.failureCount ? `, ${r.failureCount} skipped` : ""}.`);
    } catch (e) {
      Alert.alert("Could not attach", getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Bulk match"
      footer={<Button title={total ? `Attach ${total} selected` : "Select matches to attach"} loading={busy} disabled={!total} onPress={attach} />}
    >
      <Row>
        <View style={{ flex: 1 }}>
          <Select label="Minimum score" value={minScore} options={MIN_SCORES} onChange={setMinScore} />
        </View>
        <View style={{ flex: 1 }}>
          <Select label="Top per lead" value={topN} options={TOP_N} onChange={setTopN} />
        </View>
      </Row>
      {!data ? (
        <Loading />
      ) : (
        <>
          <StatGrid>
            <Stat label="Open leads" value={String(data.summary.totalLeads)} />
            <Stat label="With matches" value={String(data.summary.leadsWithMatches)} />
            <Stat label="Avg per lead" value={String(data.summary.avgMatchesPerLead)} />
            <Stat label="Properties" value={String(data.summary.totalPropertiesAnalyzed)} />
          </StatGrid>
          {data.results.map((r) => {
            const open = expanded === r.lead._id;
            const sel = picked.get(r.lead._id);
            return (
              <Card key={r.lead._id} style={{ padding: space.md }}>
                <Pressable onPress={() => setExpanded(open ? null : r.lead._id)} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{r.lead.fullName}</Text>
                    <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={2}>
                      {[interestLabel(r.lead.interestType, true), budgetLabel(r.lead.budgetMin, r.lead.budgetMax, r.lead.budgetCurrency), r.lead.preferredAreas.join(", ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Badge label={`${r.matchCount} match${r.matchCount === 1 ? "" : "es"}`} tone={r.matchCount ? "success" : "neutral"} />
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.faint} />
                </Pressable>
                {open && (
                  <View style={{ gap: space.sm }}>
                    {r.topMatches.length === 0 ? (
                      <Body muted small>
                        No properties score {minScore}% or more for this lead.
                      </Body>
                    ) : (
                      r.topMatches.map((m) => (
                        <CheckRow
                          key={m.propertyId}
                          on={!!sel?.has(m.propertyId)}
                          onPress={() => toggle(r.lead._id, m.propertyId)}
                          title={m.propertyTitle}
                          subtitle={`${priceLabel(m.propertyPrice, m.propertyCurrency)} · ${m.propertyLocation}`}
                          right={<Badge label={`${m.totalScore}%`} tone={matchTone(m.totalScore)} />}
                        />
                      ))
                    )}
                  </View>
                )}
              </Card>
            );
          })}
          {data.results.length === 0 && <Body muted>No open leads to match.</Body>}
        </>
      )}
    </Sheet>
  );
}

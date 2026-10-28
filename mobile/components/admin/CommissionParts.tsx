/** Pieces of the commissions screen: split bar and the deal commission details sheet. */
import { Text, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { COMMISSION_RATE_PERCENT } from "../../../convex/commissionLib";
import { Badge, Body, Card, Facts, Row, Sheet } from "../ui";
import { Chips } from "../ui";
import { SCENARIO_LABELS, type Scenario } from "../../lib/admin/labels";
import { useRun } from "../../lib/useRun";
import { dateLabel, money } from "../../lib/format";
import { colors, font, space } from "../../lib/theme";

export type CommissionStatus = "pending" | "approved" | "paid";

// Legacy rows stored splits of the sale value, so fall back as the website does.
export const commissionAmountOf = (c: { commissionAmount?: number; commissionRate?: number; dealValue: number }): number =>
  typeof c.commissionAmount === "number" ? c.commissionAmount : c.dealValue * (c.commissionRate ?? COMMISSION_RATE_PERCENT / 100);

export const STATUS_TONE = { pending: "warning", approved: "info", paid: "success" } as const;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function SplitBar({ a, b, c }: { a: number; b: number; c: number }) {
  return (
    <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.border }}>
      {a > 0 && <View style={{ width: `${a}%`, backgroundColor: "#3b82f6" }} />}
      {b > 0 && <View style={{ width: `${b}%`, backgroundColor: "#22c55e" }} />}
      {c > 0 && <View style={{ width: `${c}%`, backgroundColor: "#f59e0b" }} />}
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Commission = any;

export function CommissionDetails({ commission, onClose }: { commission: Commission | null; onClose: () => void }) {
  const update = useMutation(api.commissions.updateCommissionStatus);
  const { busy, run } = useRun();
  if (!commission) return <Sheet open={false} onClose={onClose} title="Commission details">{null}</Sheet>;
  const fmt = (n: number) => money(n, commission.dealCurrency);
  const setStatus = (status: CommissionStatus) => run(() => update({ commissionId: commission._id as Id<"dealCommissions">, status }));
  return (
    <Sheet open onClose={onClose} title="Commission details">
      <Card>
        <Facts
          items={[
            { label: "Lead", value: commission.leadName },
            { label: "Property", value: commission.propertyTitle || "-" },
            { label: "Deal value", value: fmt(commission.dealValue) },
            { label: `Commission (${COMMISSION_RATE_PERCENT}%)`, value: fmt(commissionAmountOf(commission)) },
            { label: "Created", value: dateLabel(commission.createdAt) },
          ]}
        />
      </Card>
      <Card style={{ gap: space.sm }}>
        <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>Split: {commission.configName || (commission.configScenario ? SCENARIO_LABELS[commission.configScenario as Scenario] : "Unknown scenario")}</Text>
        <Body small muted>Splits are shares of the {COMMISSION_RATE_PERCENT}% commission, not the sale value. Rates were locked at deal closure and may differ from current scenario defaults.</Body>
        <Row style={{ justifyContent: "space-between" }}>
          <Body muted style={{ flex: 1 }}>Contact owner ({commission.contactOwnerName || commission.leadAgentName})</Body>
          <Body>{commission.leadAgentPercent}% = {fmt(commission.leadAgentAmount)}</Body>
        </Row>
        {commission.propertyAgentName !== "—" && (
          <Row style={{ justifyContent: "space-between" }}>
            <Body muted style={{ flex: 1 }}>Property owner ({commission.propertyOwnerName || commission.propertyAgentName})</Body>
            <Body>{commission.propertyAgentPercent}% = {fmt(commission.propertyAgentAmount)}</Body>
          </Row>
        )}
        <Row style={{ justifyContent: "space-between" }}>
          <Body muted>Company</Body>
          <Body>{commission.companyPercent}% = {fmt(commission.companyAmount)}</Body>
        </Row>
        <SplitBar a={commission.propertyAgentPercent} b={commission.leadAgentPercent} c={commission.companyPercent} />
      </Card>
      <Card style={{ gap: space.sm }}>
        <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>Status</Text>
        <Chips
          options={(["pending", "approved", "paid"] as CommissionStatus[]).map((s) => ({ value: s, label: cap(s) }))}
          value={commission.status as CommissionStatus}
          onChange={(s) => !busy && s !== commission.status && setStatus(s)}
        />
      </Card>
    </Sheet>
  );
}

export { Badge };

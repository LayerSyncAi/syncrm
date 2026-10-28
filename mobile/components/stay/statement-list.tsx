/** Running statement: charges, payments and balance, newest first on a phone. */
import { Text, View } from "react-native";
import { Body } from "../ui";
import { colors, font, space } from "../../lib/theme";
import { dateLabel, money, type StayCurrency } from "@/lib/stay/format";

export type StatementLineView = {
  date: string;
  kind: "charge" | "payment" | "reversal" | "deposit_applied";
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

export function StatementList({ lines, currency, limit }: { lines: StatementLineView[]; currency: StayCurrency; limit?: number }) {
  if (!lines.length)
    return (
      <Body muted small>
        No charges or payments yet.
      </Body>
    );
  const shown = lines
    .slice()
    .reverse()
    .slice(0, limit ?? lines.length);
  return (
    <View>
      {shown.map((l, i) => (
        <View
          key={i}
          style={{ flexDirection: "row", gap: space.md, paddingVertical: space.sm, borderBottomWidth: i === shown.length - 1 ? 0 : 1, borderBottomColor: colors.border }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: font.sm, color: l.kind === "reversal" ? colors.danger : colors.text }}>{l.description}</Text>
            <Text style={{ fontSize: font.xs, color: colors.muted }}>{dateLabel(l.date)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: font.sm, fontWeight: "600", color: l.credit ? colors.success : colors.text }}>
              {l.debit ? money(l.debit, currency) : `- ${money(l.credit, currency)}`}
            </Text>
            <Text style={{ fontSize: font.xs, color: colors.muted }}>Bal {money(l.balance, currency)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

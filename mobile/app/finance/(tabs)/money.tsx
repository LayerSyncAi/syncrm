/** This month's money in and money out, newest first. */
import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Badge, Body, Button, Card, Chips, EmptyState, Fab, List, Loading, Row, SearchBar } from "../../../components/ui";
import { StaffOnly } from "../../../components/finance/staff-only";
import { useFinance } from "../../../lib/finance/hooks";
import { useDebounced, useRefresh } from "../../../lib/stay/hooks";
import { colors, font, space } from "../../../lib/theme";
import { TX_KIND_LABELS, dateLabel, money, periodLabel } from "@/lib/finance/format";

type Kind = "" | "receipt" | "payment" | "transfer";

export default function FinanceMoney() {
  const router = useRouter();
  const fin = useFinance();
  const isStaff = !!fin?.role.isStaff;
  const [kind, setKind] = useState<Kind>("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 250);
  const { refreshing, onRefresh } = useRefresh();
  const today = fin?.today;
  const rows = useQuery(api.finance.money.list, isStaff && today ? { from: `${today.slice(0, 7)}-01`, to: today, kind: kind || undefined, q: q || undefined } : "skip");

  if (fin === undefined) return <Loading />;
  if (!isStaff) return <StaffOnly />;

  return (
    <View style={{ flex: 1 }}>
      <List
        data={rows}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Row>
              <Button variant="brand" icon="add-circle-outline" title="Money in" onPress={() => router.push("/finance/money/in")} style={{ flex: 1 }} />
              <Button variant="secondary" icon="calculator-outline" title="Cash-up" onPress={() => router.push("/finance/money/cash-up")} style={{ flex: 1 }} />
            </Row>
            <Body muted small>
              {today ? periodLabel(today.slice(0, 7), true) : ""}. Rent and deposits come in from Sync Stay.
            </Body>
            <Chips<Kind>
              value={kind}
              onChange={setKind}
              options={[
                { value: "", label: "All" },
                { value: "receipt", label: "Money in" },
                { value: "payment", label: "Money out" },
                { value: "transfer", label: "Transfers" },
              ]}
            />
            <SearchBar value={search} onChangeText={setSearch} placeholder="Number, description, name or reference" />
          </View>
        }
        empty={<EmptyState icon="swap-vertical-outline" title="Nothing recorded this month" message="Record money in to issue a numbered receipt." />}
        keyExtractor={(r) => r._id}
        renderItem={({ item: r }) => (
          <Card style={r.reversed || r.isReversal ? { opacity: 0.7 } : undefined}>
            <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={2}>
                  {r.description}
                </Text>
                {r.counterparty ? (
                  <Body small muted numberOfLines={1}>
                    {r.counterparty}
                  </Body>
                ) : null}
                <Body small muted>
                  {[r.number, dateLabel(r.date), r.method].filter(Boolean).join(" · ")}
                </Body>
                <Body small muted numberOfLines={1}>
                  {r.accounts}
                </Body>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text
                  style={{
                    fontSize: font.md,
                    fontWeight: "700",
                    color: r.amount > 0 ? colors.success : r.amount < 0 ? colors.text : colors.muted,
                    textDecorationLine: r.reversed ? "line-through" : "none",
                  }}
                >
                  {r.amount > 0 ? "+" : ""}
                  {money(r.amount === 0 ? r.gross : r.amount, r.currency)}
                </Text>
                <Badge label={r.isReversal ? "Reversal" : TX_KIND_LABELS[r.kind] ?? r.kind} tone={r.kind === "receipt" ? "success" : "neutral"} />
                {r.reversed && <Badge tone="danger" label="Reversed" />}
                {r.fromStay && <Badge tone="info" label="Sync Stay" />}
              </View>
            </Row>
          </Card>
        )}
      />
      <Fab icon="add" label="Money in" onPress={() => router.push("/finance/money/in")} />
    </View>
  );
}

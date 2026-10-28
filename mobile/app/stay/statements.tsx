/**
 * Landlord statements by month: rent collected less the management fee and
 * recharged expenses. Tap a landlord for the full statement, its PDF and email.
 */
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Card, EmptyState, Ionicons, List, Row } from "../../components/ui";
import { LandlordStatement } from "../../components/stay/landlord-statement";
import { MonthPicker } from "../../components/stay/month-picker";
import { useRefresh } from "../../lib/stay/hooks";
import { confirm, useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";
import { money, periodLabel, todayLocal } from "@/lib/stay/format";

/** Last month until the 10th (statements go out early in the month), then this month. */
function defaultMonth(): string {
  const today = todayLocal();
  const [y, m, d] = today.split("-").map(Number);
  if (d >= 10) return today.slice(0, 7);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

export default function StayStatements() {
  const [month, setMonth] = useState(defaultMonth);
  const [selected, setSelected] = useState<Id<"contacts"> | null>(null);
  const overview = useQuery(api.stay.statements.overview, { month });
  const emailAll = useMutation(api.stay.statements.emailAll);
  const { busy, run } = useRun();
  const { refreshing, onRefresh } = useRefresh();
  const withEmail = overview?.filter((o) => o.email).length ?? 0;

  const sendAll = async () => {
    const ok = await confirm(
      "Email all landlords",
      `Send the ${periodLabel(month, true)} statement to every landlord with an email address (${withEmail} of ${overview?.length ?? 0}). Landlords without one are skipped.`,
      "Send statements",
    );
    if (!ok) return;
    const res = await run(() => emailAll({ month }));
    if (res) {
      Alert.alert("Statements sent", `${res.sent} sent${res.skipped ? `, ${res.skipped} skipped (no email address or nothing to show)` : ""}.`);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Landlord statements" }} />
      <List
        data={overview}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <MonthPicker
              value={month}
              onChange={(m) => {
                setMonth(m);
                setSelected(null);
              }}
              hint={overview ? `${overview.length} landlord${overview.length === 1 ? "" : "s"}` : undefined}
            />
            <Button icon="send-outline" title="Email all landlords" onPress={sendAll} loading={busy} disabled={!overview?.length} />
          </View>
        }
        empty={<EmptyState icon="document-text-outline" title="No landlords yet" message="Statements appear here once you have properties under management." />}
        keyExtractor={(o) => o.landlordContactId}
        renderItem={({ item: o }) => {
          const open = selected === o.landlordContactId;
          return (
            <Card style={open ? { borderColor: colors.brand } : undefined}>
              <Pressable onPress={() => setSelected(open ? null : o.landlordContactId)} accessibilityRole="button" style={{ gap: space.sm }}>
                <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{o.name}</Text>
                    <Body small muted>
                      {o.propertyCount} propert{o.propertyCount === 1 ? "y" : "ies"}
                      {o.email ? "" : ", no email address"}
                    </Body>
                  </View>
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.faint} />
                </Row>
                {o.totals.length === 0 ? (
                  <Body small muted>
                    Nothing collected this month
                  </Body>
                ) : (
                  o.totals.map((t) => (
                    <Body key={t.currency} small>
                      Net due <Text style={{ fontWeight: "700" }}>{money(t.net, t.currency)}</Text>
                      <Text style={{ color: colors.muted }}>
                        {" "}
                        (collected {money(t.collected, t.currency)}, fee {money(t.fee, t.currency)}, expenses {money(t.expenses, t.currency)})
                      </Text>
                    </Body>
                  ))
                )}
              </Pressable>
              {open && <LandlordStatement landlordContactId={o.landlordContactId} month={month} />}
            </Card>
          );
        }}
      />
    </View>
  );
}

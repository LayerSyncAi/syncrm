/** One landlord's statement for a month: per currency, brought forward, every movement and the balance held. */
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, EmptyState, Facts, Loading, Row, Screen, Section, Title } from "../../../components/ui";
import { MonthPicker } from "../../../components/stay/month-picker";
import { useFinance } from "../../../lib/finance/hooks";
import { useRefresh } from "../../../lib/stay/hooks";
import { confirm, useRun } from "../../../lib/useRun";
import { colors, font, space } from "../../../lib/theme";
import { dateLabel, money, todayLocal } from "@/lib/finance/format";

/** Last month until the 10th (statements go out early in the month), then this month. */
function defaultMonth(): string {
  const today = todayLocal();
  const [y, m, d] = today.split("-").map(Number);
  if (d >= 10) return today.slice(0, 7);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

export default function LandlordStatement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const landlordId = id as Id<"contacts">;
  const fin = useFinance();
  const [month, setMonth] = useState(defaultMonth);
  const st = useQuery(api.finance.trust.landlordStatement, { landlordId, month });
  const send = useMutation(api.finance.trust.sendLandlordStatements);
  const { busy, run } = useRun();
  const { refreshing, onRefresh } = useRefresh();

  if (st === undefined) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Statement" }} />
        <MonthPicker value={month} onChange={setMonth} />
        <Loading />
      </Screen>
    );
  }

  const email = async () => {
    const ok = await confirm("Email statement", `Send the ${st.monthLabel} statement to ${st.landlord.name} at ${st.landlord.email}.`, "Send");
    if (!ok) return;
    const res = await run(() => send({ month, landlordIds: [landlordId] }));
    if (res) Alert.alert(res.sent ? "Statement sent" : "Not sent", res.sent ? `Emailed to ${st.landlord.email}.` : "The statement could not be emailed.");
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Stack.Screen options={{ title: st.landlord.name }} />
      <MonthPicker value={month} onChange={setMonth} />

      {fin?.role.isStaff &&
        (st.landlord.email ? (
          <Button icon="mail-outline" title="Email statement" onPress={email} loading={busy} />
        ) : (
          <Body muted small>
            No email address for this landlord. Add one in the Hub to email statements.
          </Body>
        ))}

      {st.sections.length === 0 ? (
        <EmptyState icon="document-text-outline" title={`No activity in ${st.monthLabel}`} message="Nothing was received, paid or held for this landlord in this month." />
      ) : (
        st.sections.map((s) => (
          <View key={s.currency} style={{ gap: space.md }}>
            <Card>
              <Title style={{ fontSize: font.lg }}>{s.currency}</Title>
              <Facts
                items={[
                  { label: "Brought forward", value: money(s.opening, s.currency) },
                  { label: "Received", value: money(s.totals.received, s.currency) },
                  { label: "Commission", value: money(s.totals.commission, s.currency) },
                  { label: "Expenses", value: money(s.totals.expenses, s.currency) },
                  { label: "Paid to landlord", value: money(s.totals.payouts, s.currency) },
                ]}
              />
              <Row style={{ justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
                <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>Balance held</Text>
                <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{money(s.closing, s.currency)}</Text>
              </Row>
            </Card>

            {s.movements.length > 0 && (
              <Section title={`${s.currency} money in and out`}>
                {s.movements.map((m, i) => (
                  <Card key={`${m.number}-${i}`} style={{ padding: space.md }}>
                    <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{m.description}</Text>
                        <Body small muted>
                          {[dateLabel(m.date), m.number, m.property].filter(Boolean).join(" · ")}
                        </Body>
                      </View>
                      <Text style={{ fontSize: font.sm, fontWeight: "700", color: m.amount >= 0 ? colors.success : colors.text }}>
                        {m.amount > 0 ? "+" : ""}
                        {money(m.amount, s.currency)}
                      </Text>
                    </Row>
                  </Card>
                ))}
              </Section>
            )}

            {s.properties.length > 0 && (
              <Section title={`${s.currency} by property`}>
                {s.properties.map((p) => (
                  <Card key={p.name}>
                    <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>{p.name}</Text>
                    <Facts
                      items={[
                        { label: "Rent charged", value: p.charged ? money(p.charged, s.currency) : "" },
                        { label: "Received", value: p.received ? money(p.received, s.currency) : "" },
                        { label: "Arrears", value: p.arrears ? money(p.arrears, s.currency) : "" },
                        { label: "Commission", value: p.commission ? money(p.commission, s.currency) : "" },
                        { label: "Expenses", value: p.expenses ? money(p.expenses, s.currency) : "" },
                        { label: "Paid to landlord", value: p.payouts ? money(p.payouts, s.currency) : "" },
                      ]}
                    />
                  </Card>
                ))}
              </Section>
            )}
          </View>
        ))
      )}
    </Screen>
  );
}

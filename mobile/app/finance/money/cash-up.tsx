/** Daily cash-up: per person, cash received, banked and paid out, and what is left on hand. */
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Body, Card, DateField, Facts, ListItem, Loading, Screen, Section, Title } from "../../../components/ui";
import { StaffOnly } from "../../../components/finance/staff-only";
import { useFinance } from "../../../lib/finance/hooks";
import { useRefresh } from "../../../lib/stay/hooks";
import { dateLabel, money } from "@/lib/finance/format";

export default function CashUp() {
  const fin = useFinance();
  const isStaff = !!fin?.role.isStaff;
  const [date, setDate] = useState("");
  const { refreshing, onRefresh } = useRefresh();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const data = useQuery(api.finance.money.cashUp, isStaff && valid ? { date } : "skip");

  useEffect(() => {
    if (!date && fin?.today) setDate(fin.today);
  }, [fin?.today, date]);

  if (fin === undefined) return <Loading />;
  if (!isStaff) return <StaffOnly />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Stack.Screen options={{ title: "Cash-up" }} />
      <DateField label="Day" value={date} onChange={setDate} />

      {!valid ? null : data === undefined ? (
        <Loading />
      ) : (
        <>
          <Section title={`Cash taken on ${dateLabel(date)}`}>
            {data.people.length === 0 ? (
              <Body muted small>
                No cash moved through a cash float on this day.
              </Body>
            ) : (
              data.people.map((p) => (
                <Card key={`${p.userId}:${p.currency}`}>
                  <Title style={{ fontSize: 17 }}>{p.name}</Title>
                  <Facts
                    items={[
                      { label: `Received (${p.receipts} receipt${p.receipts === 1 ? "" : "s"})`, value: money(p.received, p.currency) },
                      { label: "Banked", value: money(p.banked, p.currency) },
                      { label: "Paid out", value: money(p.paidOut, p.currency) },
                      { label: "Should be on hand", value: money(p.onHand, p.currency) },
                    ]}
                  />
                </Card>
              ))
            )}
          </Section>

          <Section title="Cash floats at end of day">
            {data.floats.length === 0 ? (
              <Body muted small>
                No cash floats set up.
              </Body>
            ) : (
              data.floats.map((f) => <ListItem key={f.accountId} icon="cash-outline" title={f.name} subtitle={f.currency} right={money(f.balance, f.currency)} />)
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}

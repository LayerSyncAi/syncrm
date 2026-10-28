/**
 * Date listed on market and marketing spend (port of the web
 * PropertyMarketingTab). Spend is admin-only; totals stay per currency.
 */
import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { MARKETING_CHANNEL_OPTIONS, marketingChannelLabel } from "@/lib/marketing-channels";
import { Body, Button, Card, DateField, Field, ListItem, Loading, Row, Section, Select } from "../../../ui";
import { confirm, useRun } from "../../../../lib/useRun";
import { dateLabel, parseAmount, todayIso } from "../../../../lib/format";
import { space } from "../../../../lib/theme";
import { CURRENCY_OPTIONS, amountLabel, dateToTs, tsToDate } from "../../../../lib/crm/records/properties/labels";

export function MarketingTab({
  propertyId,
  listedOnMarketAt,
  canEdit,
  isAdmin,
}: {
  propertyId: Id<"properties">;
  listedOnMarketAt: number | undefined;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const expenses = useQuery(api.marketing.listExpenses, { propertyId });
  const update = useMutation(api.properties.update);
  const createExpense = useMutation(api.marketing.createExpense);
  const deleteExpense = useMutation(api.marketing.deleteExpense);
  const dateRun = useRun();
  const spendRun = useRun();
  const [listed, setListed] = useState(() => tsToDate(listedOnMarketAt));
  const [channel, setChannel] = useState<string>("facebook");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [spentOn, setSpentOn] = useState(todayIso());
  const [note, setNote] = useState("");

  // Totals per currency, never added across currencies.
  const totals: Record<string, number> = {};
  for (const e of expenses ?? []) totals[e.currency || "USD"] = (totals[e.currency || "USD"] ?? 0) + e.amount;
  const totalText = Object.entries(totals)
    .filter(([, v]) => v !== 0)
    .map(([c, v]) => amountLabel(v, c))
    .join(" + ") || amountLabel(0, "USD");

  const addSpend = async () => {
    const n = parseAmount(amount);
    if (!n || n <= 0) return;
    const ok = await spendRun.run(async () => {
      await createExpense({ propertyId, channel, amount: n, currency, spentAt: dateToTs(spentOn), note: note.trim() || undefined });
      return true;
    });
    if (ok) {
      setAmount("");
      setNote("");
    }
  };

  return (
    <View style={{ gap: space.lg }}>
      <Section title="Date listed on market">
        {canEdit ? (
          <>
            <DateField label="Listed on" value={listed} onChange={setListed} hint="Used for days on market and marketing reports. Leave blank to clear." />
            <Button
              variant="secondary"
              title="Save date"
              loading={dateRun.busy}
              onPress={() => dateRun.run(() => update({ propertyId, listedOnMarketAt: listed ? dateToTs(listed) : null }), { success: "Listing date saved" })}
            />
          </>
        ) : (
          <Card>
            <Body>{listed ? dateLabel(listed) : "Not set"}</Body>
          </Card>
        )}
      </Section>

      {isAdmin && (
        <Section title="Log marketing spend">
          <Select label="Channel" value={channel} options={MARKETING_CHANNEL_OPTIONS} onChange={setChannel} />
          <DateField label="Date" value={spentOn} onChange={setSpentOn} />
          <Row style={{ alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Select label="Currency" value={currency} options={CURRENCY_OPTIONS} onChange={setCurrency} />
            </View>
            <View style={{ flex: 1.3 }}>
              <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
            </View>
          </Row>
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Boosted post" />
          <Button title="Add spend" icon="add" onPress={addSpend} loading={spendRun.busy} disabled={!parseAmount(amount)} />
        </Section>
      )}

      <Section title="Marketing history" right={<Body small>{totalText}</Body>}>
        {expenses === undefined ? (
          <Loading />
        ) : expenses.length === 0 ? (
          <Body small muted>No marketing spend logged for this property yet.</Body>
        ) : (
          expenses.map((e) => (
            <ListItem
              key={e._id}
              icon="megaphone-outline"
              title={`${amountLabel(e.amount, e.currency)} · ${marketingChannelLabel(e.channel)}`}
              subtitle={e.note || undefined}
              meta={dateLabel(e.spentAt)}
              right={
                isAdmin ? (
                  <Button
                    small
                    variant="ghost"
                    icon="trash-outline"
                    title="Delete"
                    onPress={async () => {
                      if (await confirm("Delete spend", "Remove this marketing spend entry?", "Delete", true)) {
                        await spendRun.run(() => deleteExpense({ expenseId: e._id }));
                      }
                    }}
                  />
                ) : undefined
              }
            />
          ))
        )}
      </Section>
    </View>
  );
}

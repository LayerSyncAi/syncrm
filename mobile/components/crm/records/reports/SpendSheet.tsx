/** Log marketing spend (admins), ported from the website's MarketingSpendModal. */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { MARKETING_CHANNEL_OPTIONS, marketingChannelLabel } from "@/lib/marketing-channels";
import { Button, Chips, DateField, Field, Ionicons, Notice, Row, Select, Sheet } from "../../../ui";
import { useRun } from "../../../../lib/useRun";
import { dateLabel, money, parseAmount, todayIso } from "../../../../lib/format";
import { colors, font, space } from "../../../../lib/theme";

export function SpendSheet({ open, onClose, properties }: { open: boolean; onClose: () => void; properties: Array<{ _id: Id<"properties">; title: string }> }) {
  const expenses = useQuery(api.marketing.listExpenses, open ? {} : "skip");
  const createExpense = useMutation(api.marketing.createExpense);
  const deleteExpense = useMutation(api.marketing.deleteExpense);
  const { busy, run } = useRun();

  const [channel, setChannel] = useState<string>("facebook");
  const [propertyId, setPropertyId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "ZiG">("USD");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const parsed = parseAmount(amount);
    if (parsed === null || parsed <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Enter the date as YYYY-MM-DD");
      return;
    }
    setError(null);
    const [y, m, d] = date.split("-").map(Number);
    const ok = await run(() =>
      createExpense({
        channel,
        propertyId: propertyId ? (propertyId as Id<"properties">) : undefined,
        amount: parsed,
        currency,
        // Midday local time on the chosen date, as on the website.
        spentAt: new Date(y!, m! - 1, d!, 12).getTime(),
        note: note.trim() || undefined,
      }).then(() => true)
    );
    if (ok) {
      setAmount("");
      setNote("");
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Marketing spend"
      footer={
        <Row>
          <Button variant="secondary" title="Done" onPress={onClose} style={{ flex: 1 }} />
          <Button title="Add spend" onPress={add} loading={busy} style={{ flex: 1 }} />
        </Row>
      }
    >
      <Text style={{ color: colors.muted, fontSize: font.sm }}>Log ad spend, boosted posts and other marketing costs.</Text>
      {error && <Notice tone="danger">{error}</Notice>}
      <Select label="Channel" value={channel} onChange={setChannel} options={MARKETING_CHANNEL_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }))} />
      <Select
        label="Property"
        value={propertyId}
        onChange={setPropertyId}
        options={[{ value: "", label: "Channel-wide (no property)" }, ...properties.map((p) => ({ value: p._id as string, label: p.title }))]}
      />
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Currency</Text>
        <Chips<"USD" | "ZiG"> value={currency} onChange={setCurrency} options={[{ value: "USD", label: "USD" }, { value: "ZiG", label: "ZiG" }]} />
      </View>
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <DateField label="Date" value={date} onChange={setDate} />
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Facebook boosted post" />

      <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.muted, textTransform: "uppercase", marginTop: space.sm }}>Recent spend</Text>
      {expenses === undefined ? (
        <Text style={{ color: colors.muted }}>Loading</Text>
      ) : expenses.length === 0 ? (
        <Text style={{ color: colors.muted }}>No marketing spend logged yet.</Text>
      ) : (
        expenses.slice(0, 25).map((e) => (
          <Row key={e._id} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600", color: colors.text }}>{money(e.amount, e.currency)}</Text>
              <Text style={{ fontSize: font.xs, color: colors.muted }} numberOfLines={1}>
                {[marketingChannelLabel(e.channel), e.propertyTitle, dateLabel(e.spentAt)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Pressable onPress={() => run(() => deleteExpense({ expenseId: e._id }))} hitSlop={10} accessibilityLabel="Delete spend">
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </Row>
        ))
      )}
    </Sheet>
  );
}

/** Every payment received, with its receipt. Payments are never deleted; a mistake is reversed. */
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, DateField, EmptyState, Fab, List, Notice, Row, SearchBar, Stat, StatGrid, Toggle } from "../../../components/ui";
import { ReversePaymentSheet, type ReverseTarget } from "../../../components/stay/reverse-payment-sheet";
import { useDebounced, useIsDirector, useRefresh } from "../../../lib/stay/hooks";
import { useShareReceipt } from "../../../lib/stay/share";
import { useRun } from "../../../lib/useRun";
import { colors, font, space } from "../../../lib/theme";
import { dateLabel, formatTotals, methodLabel, money, periodRange, thisMonth, todayLocal, type CurrencyTotals } from "@/lib/stay/format";

export default function StayPayments() {
  const router = useRouter();
  const isDirector = useIsDirector();
  const shareReceipt = useShareReceipt();
  const emailReceipt = useMutation(api.stay.payments.emailReceipt);
  const { run } = useRun();
  const { refreshing, onRefresh } = useRefresh();

  const [from, setFrom] = useState(periodRange(thisMonth()).from);
  const [to, setTo] = useState(todayLocal());
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [includeReversed, setIncludeReversed] = useState(true);
  const [reversing, setReversing] = useState<ReverseTarget>(null);
  const [sharingId, setSharingId] = useState<Id<"stayPayments"> | null>(null);

  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const validRange = isDate(from) && isDate(to) && from <= to;
  const rows = useQuery(api.stay.payments.list, validRange ? { from, to, q: q || undefined, includeReversed } : "skip");

  const totals = useMemo(() => {
    const rent: CurrencyTotals = {};
    const deposits: CurrencyTotals = {};
    for (const r of rows ?? []) {
      if (r.reversed) continue;
      const t = r.purpose === "deposit" ? deposits : rent;
      t[r.currency] = Math.round(((t[r.currency] ?? 0) + r.amount) * 100) / 100;
    }
    return { rent, deposits, count: (rows ?? []).filter((r) => !r.reversed).length };
  }, [rows]);

  const share = async (id: Id<"stayPayments">) => {
    setSharingId(id);
    await shareReceipt(id);
    setSharingId(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Payments" }} />
      <List
        data={validRange ? rows : []}
        refreshing={refreshing}
        onRefresh={onRefresh}
        header={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Card>
              <DateField label="From" value={from} onChange={setFrom} />
              <DateField label="To" value={to} onChange={setTo} />
              {!validRange && <Notice tone="danger">The start date must be on or before the end date.</Notice>}
              <Toggle label="Show reversed payments" value={includeReversed} onChange={setIncludeReversed} />
            </Card>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Receipt, tenant, property, reference" />
            <StatGrid>
              <Stat label="Rent received" value={formatTotals(totals.rent)} tone="good" />
              <Stat label="Deposits received" value={formatTotals(totals.deposits)} />
              <Stat label="Receipts issued" value={String(totals.count)} hint="Excluding reversed" />
            </StatGrid>
          </View>
        }
        empty={
          <EmptyState
            icon="receipt-outline"
            title="No payments in this period"
            message="Record a payment to issue a numbered receipt."
            action={<Button title="Record payment" icon="receipt-outline" onPress={() => router.push("/stay/payments/record")} />}
          />
        }
        keyExtractor={(r) => r._id}
        renderItem={({ item: r }) => (
          <Card style={r.reversed ? { opacity: 0.7 } : undefined}>
            <Row style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text onPress={() => router.push(`/stay/leases/${r.leaseId}` as Href)} style={{ fontSize: font.md, fontWeight: "600", color: colors.brand }}>
                  {r.tenantName}
                </Text>
                <Body small muted numberOfLines={1}>
                  {r.propertyName}, {r.unitLabel}
                </Body>
                <Body small muted>
                  {r.receiptNumber} · {dateLabel(r.paidOn)} · {methodLabel(r.method)}
                </Body>
                {r.reference ? (
                  <Body small muted>
                    Ref {r.reference}
                  </Body>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text, textDecorationLine: r.reversed ? "line-through" : "none" }}>
                  {money(r.amount, r.currency)}
                </Text>
                {r.reversed && <Badge tone="danger" label="Reversed" />}
                {r.purpose === "deposit" && !r.reversed && <Badge tone="info" label="Deposit" />}
              </View>
            </Row>
            {r.reversed && r.reverseReason ? (
              <Body small style={{ color: colors.danger }}>
                {r.reverseReason}
              </Body>
            ) : null}
            <Row style={{ flexWrap: "wrap" }}>
              <Button small variant="secondary" icon="share-outline" title="Share PDF" loading={sharingId === r._id} onPress={() => share(r._id)} />
              {!r.reversed && (
                <Button
                  small
                  variant="secondary"
                  icon="mail-outline"
                  title="Email"
                  onPress={() =>
                    run(
                      async () => {
                        await emailReceipt({ paymentId: r._id });
                        return true;
                      },
                      { success: `Receipt ${r.receiptNumber} emailed to ${r.tenantName}` },
                    )
                  }
                />
              )}
              {isDirector && !r.reversed && <Button small variant="danger" icon="arrow-undo-outline" title="Reverse" onPress={() => setReversing(r)} />}
            </Row>
          </Card>
        )}
      />
      <Fab icon="receipt-outline" label="Record payment" onPress={() => router.push("/stay/payments/record")} />
      <ReversePaymentSheet target={reversing} onClose={() => setReversing(null)} />
    </View>
  );
}

/**
 * A buyer's statement: the plan with what is paid, payments received and
 * refunds, and Receive payment. Shared by SyncDev and SyncFinance. What the
 * person may do comes from the statement's own role, so it works without
 * SyncFinance.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import { Stack } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, EmptyState, Facts, Field, Loading, Notice, Row, Screen, Section, Sheet, type BadgeTone } from "../ui";
import { ReceivePaymentSheet, type PaymentAccount } from "./receive-payment-sheet";
import { useRefresh } from "../../lib/stay/hooks";
import { useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";
import { PLAN_STATUS_LABELS, dateLabel, methodLabel, money } from "@/lib/finance/format";

const PLAN_TONE: Record<string, BadgeTone> = { paid: "success", part_paid: "warning", due: "neutral", overdue: "danger" };

type Reversal = { _id: Id<"devPayments">; number: string; amount: number } | null;

export function StandStatement({ standId, accounts }: { standId: Id<"finStands">; accounts?: PaymentAccount[] }) {
  const st = useQuery(api.dev.sales.getStandStatement, { standId });
  const emailIt = useMutation(api.dev.sales.emailStandStatement);
  const { busy: emailing, run } = useRun();
  const [receiving, setReceiving] = useState(false);
  const [reversing, setReversing] = useState<Reversal>(null);
  const { refreshing, onRefresh } = useRefresh();

  if (st === undefined) return <Loading />;
  if (st === null) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="Sale not found" message="It may have been removed." />
      </Screen>
    );
  }

  const c = st.stand.currency;
  const cancelled = st.stand.status === "cancelled";
  const { canManage, canReverse, financeOn } = st.role;

  return (
    <View style={{ flex: 1 }}>
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <Stack.Screen options={{ title: `Stand ${st.stand.standNumber}` }} />
        <Card>
          <Text style={{ fontSize: font.lg, fontWeight: "700", color: colors.text }}>{st.buyer.name}</Text>
          <Body small muted>
            Stand {st.stand.standNumber}, {st.development.name}
          </Body>
          {cancelled && <Badge label="Sale cancelled" />}
          <Facts
            items={[
              { label: "Price", value: money(st.stand.price, c) },
              { label: "Interest charged", value: st.interest > 0 ? money(st.interest, c) : "" },
              { label: "Paid to date", value: money(st.paidToDate, c) },
              { label: "Balance", value: money(st.balance, c) },
              { label: "Overdue", value: st.overdue > 0 ? <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.danger }}>{money(st.overdue, c)}</Text> : "" },
              { label: "Next payment", value: st.nextDueDate ? `${money(st.nextDueAmount ?? 0, c)} on ${dateLabel(st.nextDueDate)}` : "" },
              { label: "Phone", value: st.buyer.phone },
              { label: "Email", value: st.buyer.email },
            ]}
          />
        </Card>

        {!cancelled && canManage && <Button variant="brand" icon="add-circle-outline" title="Receive payment" onPress={() => setReceiving(true)} />}
        {!cancelled && !canManage && <Body small muted>A director or sales manager takes payments.</Body>}
        {!!st.buyer.email && (
          <Button
            variant="secondary"
            icon="mail-outline"
            title="Email statement"
            loading={emailing}
            onPress={() => run(() => emailIt({ standId }), { success: `Statement sent to ${st.buyer.email}` })}
          />
        )}
        {!financeOn && <Body small muted>Payments are recorded in SyncDev. SyncFinance adds trust accounting and commission.</Body>}

        <Section title="Payment plan">
          {st.rows.map((r, i) => (
            <Card key={`${r.dueDate}-${i}`} style={{ padding: space.md }}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{r.label}</Text>
                  <Body small muted>
                    Due {dateLabel(r.dueDate)}
                    {r.paid > 0 && r.paid < r.amount ? `, ${money(r.paid, c)} paid` : ""}
                  </Body>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.text }}>{money(r.amount, c)}</Text>
                  <Badge tone={PLAN_TONE[r.status] ?? "neutral"} label={PLAN_STATUS_LABELS[r.status] ?? r.status} />
                </View>
              </Row>
            </Card>
          ))}
        </Section>

        <Section title="Payments received">
          {st.stand.openingPaid > 0 && (
            <Body small muted>
              {money(st.stand.openingPaid, c)} paid before this plan was recorded.
            </Body>
          )}
          {st.payments.length === 0 ? (
            <Body muted small>
              No payments recorded yet.
            </Body>
          ) : (
            st.payments.map((p) => {
              const reversible = canReverse && p.source === "dev" && !p.reversed;
              return (
                <Card
                  key={p._id}
                  style={{ padding: space.md, opacity: p.reversed || p.isReversal ? 0.7 : 1 }}
                  onPress={reversible ? () => setReversing({ _id: p._id as Id<"devPayments">, number: p.number, amount: p.amount }) : undefined}
                >
                  <Row style={{ justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{p.number || "Receipt"}</Text>
                      <Body small muted>
                        {[dateLabel(p.date), p.method ? methodLabel(p.method) : "", p.reference ? `Ref ${p.reference}` : ""].filter(Boolean).join(", ")}
                      </Body>
                      {reversible && <Body small muted>Tap to reverse</Body>}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.text, textDecorationLine: p.reversed ? "line-through" : "none" }}>{money(p.amount, c)}</Text>
                      {p.reversed && <Badge tone="danger" label="Reversed" />}
                      {p.isReversal && <Badge label="Reversal" />}
                    </View>
                  </Row>
                </Card>
              );
            })
          )}
        </Section>

        {st.refunds.length > 0 && (
          <Section title="Refunds">
            {st.refunds.map((r) => (
              <Card key={r._id} style={{ padding: space.md }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Body small>{[r.number, dateLabel(r.date)].filter(Boolean).join(", ")}</Body>
                  <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.text }}>{money(r.amount, c)}</Text>
                </Row>
              </Card>
            ))}
          </Section>
        )}
      </Screen>
      <ReceivePaymentSheet
        open={receiving}
        onClose={() => setReceiving(false)}
        standId={standId}
        currency={c}
        today={st.today}
        suggested={st.overdue > 0 ? st.overdue : st.nextDueAmount ?? 0}
        buyerEmail={st.buyer.email}
        accounts={financeOn ? accounts : undefined}
      />
      <ReverseDevPaymentSheet target={reversing} currency={c} onClose={() => setReversing(null)} />
    </View>
  );
}

/** Reverse a payment SyncDev recorded. Finance receipts are reversed in SyncFinance. */
function ReverseDevPaymentSheet({ target, currency, onClose }: { target: Reversal; currency: string; onClose: () => void }) {
  const reverse = useMutation(api.dev.sales.reverseDevPayment);
  const { busy, run } = useRun();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);

  if (target && shownFor !== target._id) {
    setShownFor(target._id);
    setReason("");
    setError(null);
  } else if (!target && shownFor) {
    setShownFor(null);
  }

  async function save() {
    if (!target) return;
    if (!reason.trim()) return setError("Give a reason for the reversal.");
    setError(null);
    const ok = await run(
      async () => {
        await reverse({ paymentId: target._id, reason: reason.trim() });
        return true;
      },
      { success: `Receipt ${target.number} reversed` },
    );
    if (ok) onClose();
  }

  return (
    <Sheet open={!!target} onClose={onClose} title={`Reverse ${target?.number ?? "payment"}`} footer={<Button variant="danger" title="Reverse payment" onPress={save} loading={busy} />}>
      {error && <Notice tone="danger">{error}</Notice>}
      <Body small muted>
        {target ? `${money(target.amount, currency)} comes off what the buyer has paid. The receipt stays on record, marked reversed.` : ""}
      </Body>
      <Field label="Reason" value={reason} onChangeText={setReason} placeholder="For example, payment bounced" />
    </Sheet>
  );
}

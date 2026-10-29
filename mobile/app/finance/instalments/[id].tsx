/** A client's instalment statement: the plan with what is paid, payments received and refunds. */
import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, DateField, EmptyState, Facts, Field, Loading, Notice, Row, Screen, Section, Sheet, Toggle, type BadgeTone } from "../../../components/ui";
import { OptionGrid } from "../../../components/stay/option-grid";
import { StaffOnly } from "../../../components/finance/staff-only";
import { useFinance } from "../../../lib/finance/hooks";
import { useRefresh } from "../../../lib/stay/hooks";
import { useRun } from "../../../lib/useRun";
import { colors, font, space } from "../../../lib/theme";
import { METHOD_OPTIONS, PLAN_STATUS_LABELS, dateLabel, methodLabel, money, parseAmount } from "@/lib/finance/format";

type Method = (typeof METHOD_OPTIONS)[number]["value"];

const PLAN_TONE: Record<string, BadgeTone> = { paid: "success", part_paid: "warning", due: "neutral", overdue: "danger" };

export default function StandStatement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const standId = id as Id<"finStands">;
  const fin = useFinance();
  const isStaff = !!fin?.role.isStaff;
  const st = useQuery(api.finance.stands.getStandStatement, isStaff ? { standId } : "skip");
  const [receiving, setReceiving] = useState(false);
  const { refreshing, onRefresh } = useRefresh();

  if (fin === undefined) return <Loading />;
  if (!isStaff) return <StaffOnly />;
  if (st === undefined) return <Loading />;
  if (st === null) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="Stand not found" message="It may have been removed." />
      </Screen>
    );
  }

  const c = st.stand.currency;
  const cancelled = st.stand.status === "cancelled";

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

        {!cancelled && <Button variant="brand" icon="add-circle-outline" title="Receive payment" onPress={() => setReceiving(true)} />}

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
              {money(st.stand.openingPaid, c)} paid before Sync Finance was set up.
            </Body>
          )}
          {st.payments.length === 0 ? (
            <Body muted small>
              No payments recorded yet.
            </Body>
          ) : (
            st.payments.map((p) => (
              <Card key={p._id} style={{ padding: space.md, opacity: p.reversed || p.isReversal ? 0.7 : 1 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>{p.number || "Receipt"}</Text>
                    <Body small muted>
                      {[dateLabel(p.date), p.method ? methodLabel(p.method) : "", p.reference ? `Ref ${p.reference}` : ""].filter(Boolean).join(" · ")}
                    </Body>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.text, textDecorationLine: p.reversed ? "line-through" : "none" }}>{money(p.amount, c)}</Text>
                    {p.reversed && <Badge tone="danger" label="Reversed" />}
                    {p.isReversal && <Badge label="Reversal" />}
                  </View>
                </Row>
              </Card>
            ))
          )}
        </Section>

        {st.refunds.length > 0 && (
          <Section title="Refunds">
            {st.refunds.map((r) => (
              <Card key={r._id} style={{ padding: space.md }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Body small>
                    {[r.number, dateLabel(r.date)].filter(Boolean).join(" · ")}
                  </Body>
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
      />
    </View>
  );
}

function ReceivePaymentSheet({
  open,
  onClose,
  standId,
  currency,
  today,
  suggested,
  buyerEmail,
}: {
  open: boolean;
  onClose: () => void;
  standId: Id<"finStands">;
  currency: string;
  today: string;
  suggested: number;
  buyerEmail: string;
}) {
  const receive = useMutation(api.finance.stands.receivePayment);
  const { busy, run } = useRun();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<Method>("cash");
  const [reference, setReference] = useState("");
  const [emailStatement, setEmailStatement] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState(false);

  // Fresh form each time the sheet opens, with what is owed filled in.
  if (open && !openedFor) {
    setOpenedFor(true);
    setAmount(suggested > 0 ? String(suggested) : "");
    setDate(today);
    setMethod("cash");
    setReference("");
    setEmailStatement(true);
    setError(null);
  } else if (!open && openedFor) {
    setOpenedFor(false);
  }

  const value = parseAmount(amount);

  async function submit() {
    if (!(value > 0)) return setError("Enter the amount received.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Enter the date as YYYY-MM-DD.");
    setError(null);
    const res = await run(
      () =>
        receive({
          standId,
          date,
          amount: value,
          method,
          reference: reference.trim() || undefined,
          emailStatement: emailStatement && !!buyerEmail,
        }),
      { success: "Payment received" },
    );
    if (res) onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Receive payment"
      footer={<Button variant="brand" title={busy ? "Saving..." : `Receive ${value > 0 ? money(value, currency) : "payment"}`} onPress={submit} loading={busy} />}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label={`Amount received (${currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" selectTextOnFocus hint={`This stand is in ${currency}. Amounts are never converted.`} />
      <DateField label="Date received" value={date} onChange={setDate} />
      <OptionGrid label="Method" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
      <Field label="Reference (optional)" value={reference} onChangeText={setReference} placeholder="Bank or mobile money reference" autoCapitalize="characters" />
      <Toggle
        label={buyerEmail ? `Email the statement to ${buyerEmail}` : "No email address for this client"}
        value={emailStatement && !!buyerEmail}
        onChange={(v) => buyerEmail && setEmailStatement(v)}
      />
    </Sheet>
  );
}

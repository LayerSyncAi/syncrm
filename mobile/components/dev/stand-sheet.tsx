/**
 * The bottom sheet for one stand: reserve or sell an available stand, release
 * or sell a reserved one, or see a sold stand's buyer at a glance.
 */
import { useMemo, useState } from "react";
import { Linking, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Card, DateField, Facts, Field, Notice, Row, Sheet } from "../ui";
import { useSession } from "../../lib/session";
import { confirm, useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";
import { STATUS, type StandStatus } from "./stand-status";
import { buildPlan, sameDayNextMonth } from "../../../convex/finance/lib";
import { addDays, dateLabel, money, parseAmount, todayLocal } from "@/lib/finance/format";

export type InventoryStand = {
  _id: Id<"devStands">;
  number: string;
  sizeSqm: number | null;
  price: number;
  status: StandStatus;
  reservedFor: { name: string; phone?: string; until?: string; byUserId?: Id<"users"> } | null;
  notes: string;
  sale: { _id: Id<"finStands">; buyerName: string; paidToDate: number; balance: number; overdue: number; status: string } | null;
};

type Mode = "view" | "reserve" | "sell";

const FINANCE_HINT = "Without SyncFinance, payments are recorded in SyncDev. Finance adds trust accounting and commission.";


export function StandSheet({
  stand,
  currency,
  canManage,
  financeOn,
  today,
  onClose,
}: {
  stand: InventoryStand | null;
  currency: string;
  canManage: boolean;
  financeOn: boolean;
  /** The agency's date, so defaults do not depend on the phone's clock. */
  today?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [shownFor, setShownFor] = useState<string | null>(null);

  // Each stand opens on its summary; agents who can only reserve go straight to the form.
  if (stand && shownFor !== stand._id) {
    setShownFor(stand._id);
    setMode(stand.status === "available" && !canManage ? "reserve" : "view");
  } else if (!stand && shownFor) {
    setShownFor(null);
  }

  if (!stand) return <Sheet open={false} onClose={onClose} title="Stand">{null}</Sheet>;

  if (mode === "reserve") return <ReserveForm stand={stand} today={today} onClose={onClose} onDone={() => setMode("view")} />;
  if (mode === "sell") return <SellForm stand={stand} currency={currency} financeOn={financeOn} today={today} onClose={onClose} onDone={() => setMode("view")} />;
  return <StandSummary stand={stand} currency={currency} canManage={canManage} onClose={onClose} onReserve={() => setMode("reserve")} onSell={() => setMode("sell")} />;
}

function StandSummary({
  stand,
  currency,
  canManage,
  onClose,
  onReserve,
  onSell,
}: {
  stand: InventoryStand;
  currency: string;
  canManage: boolean;
  onClose: () => void;
  onReserve: () => void;
  onSell: () => void;
}) {
  const router = useRouter();
  const { user } = useSession();
  const release = useMutation(api.dev.inventory.release);
  const { busy, run } = useRun();
  const st = STATUS[stand.status];
  const r = stand.reservedFor;
  const canRelease = canManage || (!!r?.byUserId && r.byUserId === user?._id);

  async function doRelease() {
    if (!(await confirm(`Release stand ${stand.number}?`, `It goes back on the market${r ? ` and ${r.name} loses the hold` : ""}.`, "Release"))) return;
    await run(() => release({ standId: stand._id }), { success: `Stand ${stand.number} released` });
  }

  const facts = [
    { label: "Price", value: money(stand.price, currency) },
    { label: "Size", value: stand.sizeSqm ? `${stand.sizeSqm.toLocaleString("en-GB")} m²` : "" },
  ];

  return (
    <Sheet open onClose={onClose} title={`Stand ${stand.number}`}>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: st.bg, borderWidth: 1, borderColor: st.border }}>
          <Text style={{ fontSize: font.sm, fontWeight: "700", color: st.fg }}>{st.label}</Text>
        </View>
      </Row>

      {stand.status === "available" && (
        <>
          <Facts items={facts} />
          {!!stand.notes && <Body small muted>{stand.notes}</Body>}
          <Button variant="brand" icon="bookmark-outline" title="Reserve" onPress={onReserve} />
          {canManage && <Button variant="primary" icon="checkmark-circle-outline" title="Sell" onPress={onSell} />}
        </>
      )}

      {stand.status === "reserved" && (
        <>
          <Facts
            items={[
              { label: "Reserved for", value: r?.name ?? "" },
              { label: "Phone", value: r?.phone ?? "" },
              { label: "Until", value: r?.until ? dateLabel(r.until) : "No end date" },
              ...facts,
            ]}
          />
          {!!r?.phone && <Button variant="secondary" icon="call-outline" title={`Call ${r.name}`} onPress={() => Linking.openURL(`tel:${r.phone}`)} />}
          {canManage && <Button variant="brand" icon="checkmark-circle-outline" title="Sell" onPress={onSell} />}
          {canRelease && <Button variant="secondary" icon="lock-open-outline" title="Release" onPress={doRelease} loading={busy} />}
          {!canManage && !canRelease && <Body small muted>The agent who reserved it or a sales manager can release it.</Body>}
        </>
      )}

      {stand.status === "sold" && (
        <>
          {stand.sale ? (
            <Facts
              items={[
                { label: "Buyer", value: stand.sale.buyerName },
                { label: "Paid", value: money(stand.sale.paidToDate, currency) },
                { label: "Balance", value: money(stand.sale.balance, currency) },
                {
                  label: "Overdue",
                  value:
                    stand.sale.overdue > 0 ? (
                      <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.danger }}>{money(stand.sale.overdue, currency)}</Text>
                    ) : (
                      "Nothing"
                    ),
                },
              ]}
            />
          ) : (
            <Body small muted>Sold. The sale record is not linked to this stand.</Body>
          )}
          {stand.sale && (
            <Button
              variant="brand"
              icon="person-outline"
              title="Open buyer"
              onPress={() => {
                const id = stand.sale!._id;
                onClose();
                router.push(`/dev/buyers/${id}` as Href);
              }}
            />
          )}
        </>
      )}
    </Sheet>
  );
}

function ReserveForm({ stand, today: agencyToday, onClose, onDone }: { stand: InventoryStand; today?: string; onClose: () => void; onDone: () => void }) {
  const reserve = useMutation(api.dev.inventory.reserve);
  const { busy, run } = useRun();
  const today = agencyToday ?? todayLocal();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [until, setUntil] = useState(addDays(today, 7));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError("Who is it reserved for?");
    if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return setError("Enter the date as YYYY-MM-DD.");
    if (until && until < today) return setError("Pick a date from today on.");
    setError(null);
    const ok = await run(
      async () => {
        await reserve({ standId: stand._id, name: name.trim(), phone: phone.trim() || undefined, until: until || undefined });
        return true;
      },
      { success: `Stand ${stand.number} reserved` },
    );
    if (ok) onDone();
  }

  return (
    <Sheet open onClose={onClose} title={`Reserve stand ${stand.number}`} footer={<Button variant="brand" title={`Reserve stand ${stand.number}`} onPress={save} loading={busy} />}>
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Client name" value={name} onChangeText={setName} autoCapitalize="words" autoFocus />
      <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <DateField label="Hold until" value={until} onChange={setUntil} hint="After this date the stand shows as available again. Leave blank for no end date." />
    </Sheet>
  );
}

function SellForm({ stand, currency, financeOn, today: agencyToday, onClose, onDone }: { stand: InventoryStand; currency: string; financeOn: boolean; today?: string; onClose: () => void; onDone: () => void }) {
  const sell = useMutation(api.dev.inventory.sell);
  const { busy, run } = useRun();
  const today = agencyToday ?? todayLocal();
  const firstDue = sameDayNextMonth(today);
  const [name, setName] = useState(stand.reservedFor?.name ?? "");
  const [phone, setPhone] = useState(stand.reservedFor?.phone ?? "");
  const [email, setEmail] = useState("");
  const [price, setPrice] = useState(String(stand.price));
  const [deposit, setDeposit] = useState(String(Math.round(stand.price * 10) / 100));
  const [count, setCount] = useState("12");
  const [error, setError] = useState<string | null>(null);

  const priceN = parseAmount(price) ?? 0;
  const depositN = parseAmount(deposit) ?? 0;
  const countN = /^\d+$/.test(count.trim()) ? Number(count.trim()) : NaN;
  const plan = useMemo(
    () => (priceN > 0 && depositN >= 0 && depositN <= priceN && Number.isInteger(countN) && countN >= 0 && countN <= 360 ? buildPlan(priceN, depositN, today, countN, firstDue) : null),
    [priceN, depositN, countN, today, firstDue],
  );
  const instalments = plan?.filter((r) => r.label !== "Deposit") ?? [];
  const planTotal = plan ? Math.round(plan.reduce((t, r) => t + r.amount, 0) * 100) / 100 : 0;

  async function save() {
    if (!name.trim()) return setError("Enter the buyer's name.");
    if (!(priceN > 0)) return setError("Enter the price.");
    if (!(depositN >= 0 && depositN <= priceN)) return setError("The deposit must be between nothing and the price.");
    if (!plan || !plan.length) return setError("Enter the number of monthly instalments, from 0 to 360.");
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Check the email address.");
    setError(null);
    const ok = await run(
      () =>
        sell({
          standId: stand._id,
          buyerName: name.trim(),
          buyerPhone: phone.trim() || undefined,
          buyerEmail: email.trim() || undefined,
          price: priceN,
          plan: { deposit: depositN, depositDue: today, count: countN, firstDue },
        }),
      { success: `Stand ${stand.number} sold to ${name.trim()}` },
    );
    if (ok) onDone();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Sell stand ${stand.number}`}
      footer={<Button variant="brand" title={plan ? `Sell for ${money(planTotal, currency)}` : "Sell"} onPress={save} loading={busy} disabled={!plan} />}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Buyer name" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" hint="Statements and receipts go here." />
      <Field label={`Price (${currency})`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" selectTextOnFocus />
      <Row gap={space.md}>
        <View style={{ flex: 1 }}>
          <Field label={`Deposit (${currency})`} value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" selectTextOnFocus hint="Due today" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Monthly instalments" value={count} onChangeText={setCount} keyboardType="number-pad" selectTextOnFocus hint={`From ${dateLabel(firstDue)}`} />
        </View>
      </Row>

      {plan ? (
        <Card style={{ backgroundColor: colors.surface }}>
          <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.text }}>The plan</Text>
          <Facts
            items={[
              { label: "Deposit today", value: depositN > 0 ? money(depositN, currency) : "None" },
              {
                label: instalments.length === 1 && instalments[0]!.label === "Balance" ? "Balance" : `${instalments.length} monthly`,
                value: instalments.length ? `${money(instalments[0]!.amount, currency)}${instalments.length > 1 && instalments[instalments.length - 1]!.amount !== instalments[0]!.amount ? `, last ${money(instalments[instalments.length - 1]!.amount, currency)}` : ""}` : "None",
              },
              { label: "Last payment", value: plan.length ? dateLabel(plan[plan.length - 1]!.dueDate) : "" },
              { label: "Total", value: <Text style={{ fontSize: font.sm, fontWeight: "700", color: colors.text }}>{money(planTotal, currency)}</Text> },
            ]}
          />
        </Card>
      ) : (
        <Notice tone="warning">Check the price, deposit and number of instalments.</Notice>
      )}
      {!financeOn && <Body small muted>{FINANCE_HINT}</Body>}
    </Sheet>
  );
}

/**
 * Money in: the agency's own income received on the spot, e.g. a fee paid in
 * cash at the office. A numbered receipt is issued and can be emailed.
 * Rent and deposits are recorded in Sync Stay instead.
 */
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, DateField, Field, Ionicons, Loading, Notice, Screen, Select, Title } from "../../../components/ui";
import { OptionGrid } from "../../../components/stay/option-grid";
import { StaffOnly } from "../../../components/finance/staff-only";
import { useFinance } from "../../../lib/finance/hooks";
import { useRun } from "../../../lib/useRun";
import { colors, font, radius, space } from "../../../lib/theme";
import { ACCOUNT_TYPE_LABELS, METHOD_OPTIONS, money, parseAmount } from "@/lib/finance/format";

type Method = (typeof METHOD_OPTIONS)[number]["value"];
type Done = { txId: Id<"finTransactions">; number: string; amount: string; payer: string; emailedTo: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MoneyIn() {
  const router = useRouter();
  const fin = useFinance();
  const recordIn = useMutation(api.finance.money.recordIn);
  const emailReceipt = useMutation(api.finance.money.emailReceipt);
  const { busy, run } = useRun();
  const emailing = useRun();

  const [accountId, setAccountId] = useState<Id<"finAccounts"> | "">("");
  const [accountTouched, setAccountTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [categoryId, setCategoryId] = useState<Id<"finCategories"> | "">("");
  const [description, setDescription] = useState("");
  const [payer, setPayer] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [sendTo, setSendTo] = useState("");

  const accounts = useMemo(() => (fin?.accounts ?? []).filter((a) => a.isActive), [fin]);
  const categories = useMemo(() => (fin?.categories ?? []).filter((c) => c.kind === "income" && c.isActive), [fin]);
  const account = accounts.find((a) => a._id === accountId);

  // Cash goes to a cash float, anything else to the business account, until the person picks one.
  useEffect(() => {
    if (accountTouched || !accounts.length) return;
    const want = method === "cash" ? "cash" : "business";
    const pick = accounts.find((a) => a.type === want) ?? accounts[0];
    if (pick) setAccountId(pick._id);
  }, [accounts, method, accountTouched]);

  useEffect(() => {
    if (!categoryId && categories.length) setCategoryId((categories.find((c) => c.key === "other_income") ?? categories[0])._id);
  }, [categories, categoryId]);

  useEffect(() => {
    if (!date && fin?.today) setDate(fin.today);
  }, [fin?.today, date]);

  if (fin === undefined) return <Loading />;
  if (!fin.role.isStaff) return <StaffOnly />;

  function reset() {
    setAmount("");
    setDescription("");
    setPayer("");
    setEmail("");
    setMethod("cash");
    setAccountTouched(false);
    setDate(fin?.today ?? "");
    setError(null);
    setDone(null);
  }

  async function submit() {
    const value = parseAmount(amount);
    if (!account) return setError("Pick the account the money went into.");
    if (!(value > 0)) return setError("Enter the amount received.");
    if (!categoryId) return setError("Pick an income category.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Enter the date as YYYY-MM-DD.");
    const to = email.trim();
    if (to && !EMAIL.test(to)) return setError("Check the email address.");
    setError(null);
    const category = categories.find((c) => c._id === categoryId);
    const res = await run(() =>
      recordIn({
        purpose: "income",
        date,
        accountId: account._id,
        amount: value,
        method,
        categoryId: categoryId as Id<"finCategories">,
        description: description.trim() || category?.name || "Money in",
        counterparty: payer.trim() || undefined,
        emailTo: to || undefined,
      }),
    );
    if (res) {
      setDone({ txId: res.txId, number: res.number, amount: money(value, account.currency), payer: payer.trim(), emailedTo: to });
      setSendTo(to);
    }
  }

  async function sendReceipt() {
    if (!done) return;
    const to = sendTo.trim();
    if (!EMAIL.test(to)) return setError("Enter a valid email address.");
    setError(null);
    const ok = await emailing.run(
      async () => {
        await emailReceipt({ txId: done.txId, to });
        return true;
      },
      { success: `Receipt ${done.number} emailed to ${to}` },
    );
    if (ok) setDone({ ...done, emailedTo: to });
  }

  // ── Receipt issued ──
  if (done) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Money received" }} />
        <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.xl }}>
          <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          <Title>Receipt {done.number}</Title>
          <Body muted>
            {done.amount}
            {done.payer ? ` from ${done.payer}` : ""}
          </Body>
          <Body small muted style={{ textAlign: "center" }}>
            {done.emailedTo ? `The receipt has been emailed to ${done.emailedTo}.` : "No email was sent."}
          </Body>
        </View>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Email receipt to" value={sendTo} onChangeText={setSendTo} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Button icon="mail-outline" title={done.emailedTo ? "Email again" : "Email receipt"} onPress={sendReceipt} loading={emailing.busy} />
        <Button variant="secondary" title="Record another" onPress={reset} />
        <Button variant="ghost" title="Back to money" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!accounts.length) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Money in" }} />
        <Notice tone="warning">No accounts yet. A director adds the bank accounts and cash floats in Finance settings on the website.</Notice>
      </Screen>
    );
  }

  const value = parseAmount(amount);
  return (
    <Screen>
      <Stack.Screen options={{ title: "Money in" }} />
      {error && <Notice tone="danger">{error}</Notice>}

      <Field
        label={`Amount received${account ? ` (${account.currency})` : ""}`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        autoFocus
        hint={account ? `${account.name} is in ${account.currency}. Amounts are never converted.` : undefined}
        style={{
          fontSize: font.xl,
          fontWeight: "700",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          paddingVertical: 12,
          color: colors.text,
        }}
      />

      <OptionGrid label="Method" value={method} onChange={setMethod} options={METHOD_OPTIONS} />

      <Select
        label="Into account"
        value={accountId}
        onChange={(v) => {
          setAccountId(v);
          setAccountTouched(true);
        }}
        options={accounts.map((a) => ({ value: a._id, label: `${a.name} (${ACCOUNT_TYPE_LABELS[a.type]}, ${a.currency})` }))}
      />

      <Select label="Income category" value={categoryId} onChange={setCategoryId} options={categories.map((c) => ({ value: c._id, label: c.name }))} />

      <Field label="What it is for" value={description} onChangeText={setDescription} placeholder="e.g. Valuation fee, 12 Kings Road" />
      <Field label="Paid by" value={payer} onChangeText={setPayer} placeholder="Name on the receipt" autoCapitalize="words" />
      <Field
        label="Email the receipt to (optional)"
        value={email}
        onChangeText={setEmail}
        placeholder="name@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <DateField label="Date received" value={date} onChange={setDate} />

      <Button variant="brand" title={busy ? "Saving..." : `Record ${value > 0 && account ? money(value, account.currency) : "money in"}`} onPress={submit} loading={busy} />
      <Text style={{ fontSize: font.xs, color: colors.muted, textAlign: "center" }}>Rent and deposits are recorded in Sync Stay.</Text>
    </Screen>
  );
}

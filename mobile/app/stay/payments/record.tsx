/**
 * Record payment, the most frequent Stay task. Find the lease by tenant,
 * property or unit, confirm the amount and method, and a numbered receipt is
 * issued (and emailed when the tenant has an address). Opening with
 * ?leaseId=... skips the search.
 */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Body, Button, Card, DateField, Field, Ionicons, Loading, Notice, Screen, SearchBar, Title, Toggle } from "../../../components/ui";
import { OptionGrid } from "../../../components/stay/option-grid";
import { useDebounced } from "../../../lib/stay/hooks";
import { useShareReceipt } from "../../../lib/stay/share";
import { useRun } from "../../../lib/useRun";
import { colors, font, radius, space } from "../../../lib/theme";
import { HELD_IN_OPTIONS, METHOD_OPTIONS, money, parseAmount, todayLocal } from "@/lib/stay/format";

type Picked = {
  leaseId: Id<"stayLeases">;
  status: string;
  tenantName: string;
  tenantEmail: string | null;
  propertyName: string;
  unitLabel: string;
  currency: "USD" | "ZiG";
  rentAmount: number;
  balance: number;
  overdue: number;
  depositOutstanding: number;
};
type Method = (typeof METHOD_OPTIONS)[number]["value"];
type HeldIn = (typeof HELD_IN_OPTIONS)[number]["value"];
type Done = { paymentId: Id<"stayPayments">; receiptNumber: string; amount: string; emailed: boolean };

export default function RecordPayment() {
  const router = useRouter();
  const params = useLocalSearchParams<{ leaseId?: string }>();
  const initialLeaseId = params.leaseId as Id<"stayLeases"> | undefined;
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 250);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [purpose, setPurpose] = useState<"rent" | "deposit">("rent");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [method, setMethod] = useState<Method>("cash");
  const [reference, setReference] = useState("");
  const [heldIn, setHeldIn] = useState<HeldIn>("trust");
  const [emailReceipt, setEmailReceipt] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [sharing, setSharing] = useState(false);
  const [usedInitial, setUsedInitial] = useState(false);

  const record = useMutation(api.stay.payments.record);
  const shareReceipt = useShareReceipt();
  const { busy, run } = useRun();

  const fromLease = !!initialLeaseId && !usedInitial && !search;
  const results = useQuery(api.stay.leases.searchForPayment, picked || done ? "skip" : fromLease ? { leaseId: initialLeaseId } : { q: q || undefined });

  // Opening from a lease, unit or arrears row skips the search step.
  useEffect(() => {
    if (fromLease && !picked && results?.length === 1) {
      choose(results[0] as Picked);
      setUsedInitial(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, fromLease]);

  function choose(p: Picked) {
    setPicked(p);
    setPurpose("rent");
    setAmount(p.balance > 0 ? String(p.balance) : String(p.rentAmount));
    setEmailReceipt(!!p.tenantEmail);
    setError(null);
  }

  function reset() {
    setPicked(null);
    setSearch("");
    setAmount("");
    setReference("");
    setPaidOn(todayLocal());
    setMethod("cash");
    setError(null);
    setDone(null);
    setUsedInitial(true);
  }

  async function submit() {
    if (!picked) return;
    const value = parseAmount(amount);
    if (!(value > 0)) return setError("Enter the amount received.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return setError("Enter the payment date as YYYY-MM-DD.");
    if (paidOn > todayLocal()) return setError("The payment date cannot be in the future.");
    setError(null);
    const res = await run(() =>
      record({
        leaseId: picked.leaseId,
        purpose,
        paidOn,
        amount: value,
        // Always the lease's currency: amounts are never converted.
        currency: picked.currency,
        method,
        reference: reference.trim() || undefined,
        depositHeldIn: purpose === "deposit" ? heldIn : undefined,
        emailReceipt,
      }),
    );
    if (res) setDone({ ...res, amount: money(value, picked.currency), emailed: emailReceipt && !!picked.tenantEmail });
  }

  const share = async () => {
    if (!done) return;
    setSharing(true);
    await shareReceipt(done.paymentId);
    setSharing(false);
  };

  // ── Receipt issued ──
  if (done && picked) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Payment recorded" }} />
        <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.xl }}>
          <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          <Title>Receipt {done.receiptNumber}</Title>
          <Body muted>
            {done.amount} from {picked.tenantName}
          </Body>
          <Body small muted style={{ textAlign: "center" }}>
            {done.emailed ? "The receipt has been emailed to the tenant." : emailReceipt ? "The tenant has no email address, so no email was sent." : "No email was sent."}
          </Body>
        </View>
        <Button title="Share PDF" icon="share-outline" onPress={share} loading={sharing} />
        <Button variant="secondary" title="Record another" onPress={reset} />
        <Button variant="ghost" title="Open the lease" onPress={() => router.replace(`/stay/leases/${picked.leaseId}` as Href)} />
      </Screen>
    );
  }

  // ── Step 1: find the lease ──
  if (!picked) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Record payment" }} />
        <SearchBar value={search} onChangeText={setSearch} placeholder="Tenant, property or unit" />
        {results === undefined ? (
          <Loading />
        ) : results.length === 0 ? (
          <Body muted style={{ textAlign: "center", paddingVertical: space.lg }}>
            No matching leases.
          </Body>
        ) : (
          <View style={{ gap: space.sm }}>
            {results.map((r) => (
              <Pressable
                key={r.leaseId}
                onPress={() => choose(r as Picked)}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.md,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.lg,
                    padding: space.md,
                    minHeight: 60,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                    {r.tenantName}
                  </Text>
                  <Text style={{ fontSize: font.sm, color: colors.muted }} numberOfLines={1}>
                    {r.propertyName}, {r.unitLabel}
                    {r.status !== "active" ? " (ended)" : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: font.sm, fontWeight: "700", color: r.overdue > 0 ? colors.danger : colors.text }}>{money(r.balance, r.currency)}</Text>
                  <Text style={{ fontSize: font.xs, color: colors.muted }}>{r.overdue > 0 ? "overdue" : "balance"}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </Screen>
    );
  }

  // ── Step 2: the payment ──
  const value = parseAmount(amount);
  return (
    <Screen>
      <Stack.Screen options={{ title: "Record payment" }} />
      <Card style={{ backgroundColor: colors.surface }}>
        <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{picked.tenantName}</Text>
        <Body small muted>
          {picked.propertyName}, {picked.unitLabel}
        </Body>
        <Body small>
          Balance {money(picked.balance, picked.currency)}
          {picked.overdue > 0 ? <Text style={{ color: colors.danger }}>, {money(picked.overdue, picked.currency)} overdue</Text> : null}
        </Body>
        <Button small variant="ghost" title="Change tenant" onPress={() => setPicked(null)} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />
      </Card>

      {error && <Notice tone="danger">{error}</Notice>}

      {picked.depositOutstanding > 0 && (
        <OptionGrid
          label="Paying for"
          value={purpose}
          onChange={(p) => {
            setPurpose(p);
            setAmount(String(p === "deposit" ? picked.depositOutstanding : picked.balance > 0 ? picked.balance : picked.rentAmount));
          }}
          options={[
            { value: "rent", label: "Rent and charges" },
            { value: "deposit", label: `Deposit (${money(picked.depositOutstanding, picked.currency)} due)` },
          ]}
        />
      )}

      <Field
        label={`Amount received (${picked.currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        selectTextOnFocus
        hint={`This lease is in ${picked.currency}. Amounts are never converted.`}
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

      <Field label="Reference (optional)" value={reference} onChangeText={setReference} placeholder="Bank or EcoCash reference" autoCapitalize="characters" />
      <DateField label="Date paid" value={paidOn} onChange={setPaidOn} />

      {purpose === "deposit" && <OptionGrid label="Deposit held in" value={heldIn} onChange={setHeldIn} options={HELD_IN_OPTIONS} columns={3} />}

      <Toggle
        label={picked.tenantEmail ? `Email the receipt to ${picked.tenantEmail}` : "No email address on file for this tenant"}
        value={emailReceipt && !!picked.tenantEmail}
        onChange={(v) => picked.tenantEmail && setEmailReceipt(v)}
      />

      <Button variant="brand" title={busy ? "Saving..." : `Record ${value > 0 ? money(value, picked.currency) : "payment"}`} onPress={submit} loading={busy} />
    </Screen>
  );
}

/**
 * Take a buyer's payment on a stand. With SyncFinance it becomes a ledger
 * receipt; without, SyncDev records it. The account picker shows only when
 * the caller passes Finance accounts.
 */
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, DateField, Field, Notice, Sheet, Toggle } from "../ui";
import { OptionGrid } from "../stay/option-grid";
import { useRun } from "../../lib/useRun";
import { METHOD_OPTIONS, money, parseAmount } from "@/lib/finance/format";

type Method = (typeof METHOD_OPTIONS)[number]["value"];

export type PaymentAccount = { _id: Id<"finAccounts">; name: string; currency: string; isActive: boolean };

export function ReceivePaymentSheet({
  open,
  onClose,
  standId,
  currency,
  today,
  suggested,
  buyerEmail,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  standId: Id<"finStands">;
  currency: string;
  today: string;
  suggested: number;
  buyerEmail: string;
  /** SyncFinance accounts. Leave out when Finance is off. */
  accounts?: PaymentAccount[];
}) {
  const receive = useMutation(api.dev.sales.receivePayment);
  const { busy, run } = useRun();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<Method>("cash");
  const [accountId, setAccountId] = useState<string>("auto");
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
    setAccountId("auto");
    setReference("");
    setEmailStatement(true);
    setError(null);
  } else if (!open && openedFor) {
    setOpenedFor(false);
  }

  const value = parseAmount(amount) ?? 0;
  const accountOptions = (accounts ?? []).filter((a) => a.isActive && a.currency === currency).map((a) => ({ value: a._id as string, label: a.name }));

  async function submit() {
    if (!(value > 0)) return setError("Enter the amount received.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Enter the date as YYYY-MM-DD.");
    if (date > today) return setError("The date cannot be in the future.");
    setError(null);
    const res = await run(
      () =>
        receive({
          standId,
          date,
          amount: value,
          method,
          accountId: accountId === "auto" ? undefined : (accountId as Id<"finAccounts">),
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
      {accountOptions.length > 1 && (
        <OptionGrid label="Paid into" value={accountId} onChange={setAccountId} options={[{ value: "auto", label: "Usual account" }, ...accountOptions]} />
      )}
      <Field label="Reference (optional)" value={reference} onChangeText={setReference} placeholder="Bank or mobile money reference" autoCapitalize="characters" />
      <Toggle
        label={buyerEmail ? `Email the statement to ${buyerEmail}` : "No email address for this buyer"}
        value={emailStatement && !!buyerEmail}
        onChange={(v) => buyerEmail && setEmailStatement(v)}
      />
    </Sheet>
  );
}

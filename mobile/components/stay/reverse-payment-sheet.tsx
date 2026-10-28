/** Reverse a payment with a reason (directors). The payment stays on record, marked reversed. */
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Field, Notice, Sheet } from "../ui";
import { useRun } from "../../lib/useRun";
import { dateLabel, money, type StayCurrency } from "@/lib/stay/format";

export type ReverseTarget = {
  _id: Id<"stayPayments">;
  receiptNumber: string;
  amount: number;
  currency: StayCurrency;
  paidOn: string;
  tenantName?: string;
} | null;

export function ReversePaymentSheet({ target, onClose }: { target: ReverseTarget; onClose: () => void }) {
  const reverse = useMutation(api.stay.payments.reverse);
  const { busy, run } = useRun();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setError(null);
  }, [target]);

  const save = async () => {
    if (!target) return;
    if (!reason.trim()) return setError("Give a reason for the reversal.");
    setError(null);
    const ok = await run(
      async () => {
        await reverse({ paymentId: target._id, reason: reason.trim() });
        return true;
      },
      { success: `Receipt ${target.receiptNumber} reversed` },
    );
    if (ok) onClose();
  };

  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      title={`Reverse receipt ${target?.receiptNumber ?? ""}`}
      footer={<Button variant="danger" title="Reverse payment" onPress={save} loading={busy} />}
    >
      <Body small muted>
        The payment stays on record, marked reversed. Its amount goes back onto the tenant&apos;s balance.
      </Body>
      {error && <Notice tone="danger">{error}</Notice>}
      {target && (
        <Body small>
          {money(target.amount, target.currency)}
          {target.tenantName ? ` from ${target.tenantName}` : ""} on {dateLabel(target.paidOn)}.
        </Body>
      )}
      <Field label="Reason" value={reason} onChangeText={setReason} multiline placeholder="For example: cheque bounced, recorded against the wrong tenant" />
    </Sheet>
  );
}

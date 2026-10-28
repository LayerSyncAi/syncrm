/** Log an arrears call, visit or promise to pay against a lease. */
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, DateField, Field, Notice, Sheet } from "../ui";
import { useRun } from "../../lib/useRun";
import { parseAmount } from "@/lib/stay/format";

export type NoteTarget = { leaseId: Id<"stayLeases">; tenantName: string } | null;

export function ArrearsNoteSheet({ target, onClose }: { target: NoteTarget; onClose: () => void }) {
  const addNote = useMutation(api.stay.arrears.addNote);
  const { busy, run } = useRun();
  const [note, setNote] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setNote("");
      setPromiseDate("");
      setPromiseAmount("");
      setError(null);
    }
  }, [target]);

  const save = async () => {
    if (!target) return;
    if (!note.trim()) return setError("Write a note.");
    const amount = promiseAmount.trim() ? parseAmount(promiseAmount) : undefined;
    if (amount !== undefined && !(amount > 0)) return setError("Enter a valid promised amount.");
    setError(null);
    const ok = await run(
      async () => {
        await addNote({ leaseId: target.leaseId, note: note.trim(), promiseDate: promiseDate || undefined, promiseAmount: amount });
        return true;
      },
      { success: "Note saved" },
    );
    if (ok) onClose();
  };

  return (
    <Sheet open={!!target} onClose={onClose} title={`Arrears note: ${target?.tenantName ?? ""}`} footer={<Button title="Save note" onPress={save} loading={busy} />}>
      <Body muted small>
        Log a call, a visit or a promise to pay.
      </Body>
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Note" value={note} onChangeText={setNote} multiline placeholder="Called the tenant, will pay on Friday" />
      <DateField label="Promised payment date (optional)" value={promiseDate} onChange={setPromiseDate} />
      <Field label="Promised amount (optional)" value={promiseAmount} onChangeText={setPromiseAmount} keyboardType="decimal-pad" />
    </Sheet>
  );
}

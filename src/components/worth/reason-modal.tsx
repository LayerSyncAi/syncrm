"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { ErrorNote } from "./ui";

/** Ask for a reason or comment, then run `onSubmit` with it. */
export function ReasonModal({
  open,
  title,
  description,
  label = "Reason",
  confirmLabel,
  destructive,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<unknown>;
}) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setText("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!text.trim()) return setError(`${label} is required.`);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={submit} disabled={busy}>
            {busy ? "Saving..." : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <ErrorNote message={error} />
        <label className="text-xs font-medium text-text-muted">{label}</label>
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </div>
    </Modal>
  );
}

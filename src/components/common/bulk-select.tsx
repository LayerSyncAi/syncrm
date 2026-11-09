"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { getErrorMessage } from "@/lib/errors";

/**
 * Checkbox selection for list pages (Leads, Contacts) and the bar / confirm
 * dialog used to delete the selected rows in one go.
 */
export function useSelection<Id extends string>() {
  const [selected, setSelected] = React.useState<Set<Id>>(() => new Set());

  const toggle = React.useCallback((id: Id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Select every id in `ids`, or clear them all if they are all selected. */
  const toggleAll = React.useCallback((ids: Id[]) => {
    setSelected((prev) => {
      const allOn = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const clear = React.useCallback(() => setSelected(new Set()), []);

  /** Drop ids that are no longer on screen (deleted, filtered out). */
  const keepOnly = React.useCallback((ids: Id[]) => {
    setSelected((prev) => {
      const visible = new Set(ids);
      const next = new Set(Array.from(prev).filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  return { selected, toggle, toggleAll, clear, keepOnly };
}

interface SelectCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}

/** A checkbox that never triggers the row's own click (open the record). */
export function SelectCheckbox({ checked, indeterminate, onChange, label }: SelectCheckboxProps) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={ref}
        type="checkbox"
        className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
    </span>
  );
}

interface BulkActionBarProps {
  count: number;
  noun: { one: string; many: string };
  onDelete: () => void;
  onClear: () => void;
}

/** Floating bar shown while rows are selected. */
export function BulkActionBar({ count, noun, onDelete, onClear }: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-[16px] border border-border bg-card-bg px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.28)] md:bottom-6"
          role="region"
          aria-label="Selected items"
        >
          <span className="text-sm font-medium text-text">
            {count} {count === 1 ? noun.one : noun.many} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              className="h-9 gap-1.5 bg-danger px-3 text-xs text-white hover:bg-danger/90"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button
              variant="secondary"
              className="h-9 w-9 p-0"
              aria-label="Clear selection"
              onClick={onClear}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface BulkSkip {
  name: string;
  reason: string;
}

interface BulkDeleteDialogProps {
  open: boolean;
  count: number;
  noun: { one: string; many: string };
  /** What else goes with each record, e.g. "its activities". */
  description: string;
  /** Names of (some of) the selected records, shown as a preview. */
  names: string[];
  /** Extra options, e.g. "also delete their leads". */
  children?: React.ReactNode;
  /** Runs the delete; returns what was skipped so the dialog can report it. */
  onConfirm: () => Promise<{ deleted: number; skipped: BulkSkip[] }>;
  onClose: () => void;
}

/**
 * Type-to-confirm dialog for deleting the selection. After it runs, rows that
 * couldn't be deleted are listed with the reason instead of closing silently.
 */
export function BulkDeleteDialog({
  open,
  count,
  noun,
  description,
  names,
  children,
  onConfirm,
  onClose,
}: BulkDeleteDialogProps) {
  const [confirmText, setConfirmText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<{ deleted: number; skipped: BulkSkip[] } | null>(null);

  React.useEffect(() => {
    if (open) {
      setConfirmText("");
      setError("");
      setResult(null);
    }
  }, [open]);

  const phrase = `delete ${count} ${count === 1 ? noun.one : noun.many}`;
  const close = () => {
    if (!busy) onClose();
  };

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await onConfirm();
      if (r.skipped.length === 0) {
        onClose();
      } else {
        setResult(r);
      }
    } catch (e) {
      setError(getErrorMessage(e, "Delete failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={result ? "Some items were not deleted" : `Delete ${count} ${count === 1 ? noun.one : noun.many}`}
      description={result ? undefined : `This cannot be undone. ${description}`}
      onClose={close}
      footer={
        result ? (
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={run}
              disabled={busy || confirmText.trim().toLowerCase() !== phrase}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {busy ? "Deleting..." : `Delete ${count}`}
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-text">
            Deleted {result.deleted}. {result.skipped.length} could not be deleted:
          </p>
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-[10px] border border-border p-3 text-sm">
            {result.skipped.map((s, i) => (
              <li key={i}>
                <span className="font-medium text-text">{s.name}</span>{" "}
                <span className="text-text-muted">— {s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="max-h-40 overflow-y-auto rounded-[10px] border border-danger/20 bg-danger/5 p-3 text-sm text-text">
            {names.slice(0, 12).join(", ")}
            {names.length > 12 && <span className="text-text-muted"> and {names.length - 12} more</span>}
          </div>
          {children}
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="space-y-2">
            <p className="text-xs text-text-muted">
              Type <span className="font-mono font-medium text-text">{phrase}</span> to confirm
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={phrase}
              className="font-mono text-sm"
              autoComplete="off"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Send ids to a bulk mutation in chunks, merging the results. */
export async function runInChunks<Id, S>(
  ids: Id[],
  size: number,
  call: (chunk: Id[]) => Promise<{ deleted: number; skipped: S[] }>
): Promise<{ deleted: number; skipped: S[] }> {
  let deleted = 0;
  const skipped: S[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const r = await call(ids.slice(i, i + size));
    deleted += r.deleted;
    skipped.push(...r.skipped);
  }
  return { deleted, skipped };
}

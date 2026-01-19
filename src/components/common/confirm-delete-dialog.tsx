"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ConfirmDeleteDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({
  open,
  title = "Confirm deletion",
  description = "Type Delete to confirm this action.",
  onClose,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [value, setValue] = React.useState("");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) {
      setValue("");
    }
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        role="presentation"
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-[12px] border border-border-strong bg-card-bg p-5 shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
        )}
      >
        <div className="space-y-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-text-muted">{description}</p>
        </div>
        <div className="mt-4 space-y-3">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Type Delete"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={value !== "Delete"}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

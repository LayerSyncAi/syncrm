"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
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

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            role="presentation"
          />
          <motion.div
            className={cn(
              "relative z-10 w-full max-w-md rounded-[12px] border border-border-strong bg-card-bg p-5 shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
            )}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
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
                  className="attention-shake"
                >
                  Delete
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

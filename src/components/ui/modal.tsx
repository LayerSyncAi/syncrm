"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            role="presentation"
          />
          <motion.div
            className={cn(
              "relative z-10 w-full max-w-2xl rounded-[14px] border border-border-strong bg-card-bg shadow-[0_10px_28px_rgba(0,0,0,0.32)]"
            )}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{title}</h3>
                {description ? (
                  <p className="text-sm text-text-muted">{description}</p>
                ) : null}
              </div>
              <Button variant="ghost" className="h-8 px-2" onClick={onClose}>
                Close
              </Button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer ? (
              <div className="border-t border-border bg-card-bg/40 px-5 py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

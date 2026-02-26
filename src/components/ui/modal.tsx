"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  PanInfo,
} from "framer-motion";
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
  const dragY = useMotionValue(0);
  const modalOpacity = useTransform(dragY, [0, 200], [1, 0.5]);
  const modalScale = useTransform(dragY, [0, 200], [1, 0.92]);
  const backdropOpacity = useTransform(dragY, [0, 200], [1, 0.3]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleDragEnd = (_: any, info: PanInfo) => {
    // Fast swipe (velocity > 500) or dragged far enough (> 100px) → close
    if (info.velocity.y > 500 || info.offset.y > 100) {
      onClose();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop with blur */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.2 }}
            style={{ opacity: backdropOpacity }}
            onClick={onClose}
            role="presentation"
          />
          {/* Modal panel with drag-down-to-dismiss */}
          <motion.div
            className={cn(
              "relative z-10 w-full max-w-2xl rounded-[14px] border border-border-strong bg-card-bg shadow-[0_10px_28px_rgba(0,0,0,0.32)] cursor-grab active:cursor-grabbing"
            )}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            style={{ y: dragY, opacity: modalOpacity, scale: modalScale }}
          >
            {/* Drag indicator pill */}
            <div className="flex justify-center pt-2 pb-0">
              <div className="h-1 w-8 rounded-full bg-border-strong opacity-50" />
            </div>
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

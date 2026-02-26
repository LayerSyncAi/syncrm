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
import { cn } from "@/lib/utils";

interface RightDrawerProps {
  open: boolean;
  title: string;
  width?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

// Backdrop fade
const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15, delay: 0.1 } },
};

// Content stagger
const contentVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { delay: 0.15, duration: 0.2 } },
};

export function RightDrawer({
  open,
  title,
  width = "480px",
  onClose,
  children,
  footer,
}: RightDrawerProps) {
  const [mounted, setMounted] = React.useState(false);
  const dragX = useMotionValue(0);
  const backdropOpacity = useTransform(dragX, [0, 300], [1, 0]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleDragEnd = (_: any, info: PanInfo) => {
    // Fast swipe right (velocity > 400) or dragged far enough (> 120px) → close
    if (info.velocity.x > 400 || info.offset.x > 120) {
      onClose();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            role="presentation"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ opacity: backdropOpacity }}
          />
          <motion.div
            className={cn(
              "absolute right-0 top-0 flex h-full flex-col bg-surface-2 shadow-[0_10px_28px_rgba(0,0,0,0.32)]",
              "border-l border-border-strong"
            )}
            style={{ width, x: dragX }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              type: "spring",
              stiffness: 340,
              damping: 26,
              // Lower damping gives slight overshoot
            }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.05, right: 0.35 }}
            onDragEnd={handleDragEnd}
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold">{title}</h3>
            </div>
            <motion.div
              className="flex-1 overflow-y-auto p-5"
              variants={contentVariants}
              initial="hidden"
              animate="visible"
            >
              {children}
            </motion.div>
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

"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface RightDrawerProps {
  open: boolean;
  title: string;
  width?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function RightDrawer({
  open,
  title,
  width = "480px",
  onClose,
  children,
  footer,
}: RightDrawerProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        role="presentation"
      />
      <div
        className={cn(
          "absolute right-0 top-0 flex h-full flex-col bg-surface-2 shadow-[0_10px_28px_rgba(0,0,0,0.32)]",
          "border-l border-border-strong"
        )}
        style={{ width }}
      >
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="border-t border-border bg-card-bg/40 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

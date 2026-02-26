"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

/*
 * AnimatedToaster — wraps sonner's Toaster with:
 *   1. Per-type entrance animations (success→slide right, error→drop top, info→fade center)
 *   2. Auto-dismiss progress bar that pauses on hover
 *   3. Animated icons (check draw, X shake, info pulse)
 *
 * Usage: replace <Toaster /> with <AnimatedToaster /> in layout.tsx.
 * All existing toast.success/error/info calls continue to work.
 */

/* ── Animated icon components ─────────────────────────── */

function SuccessIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
      <circle cx="9" cy="9" r="8" stroke="#16a34a" strokeWidth="1.5" fill="#f0fdf4" />
      <path
        d="M5.5 9.5L7.5 11.5L12.5 6.5"
        stroke="#16a34a"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="toast-check-draw"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="toast-x-shake shrink-0">
      <circle cx="9" cy="9" r="8" stroke="#dc2626" strokeWidth="1.5" fill="#fef2f2" />
      <path d="M6.5 6.5L11.5 11.5M11.5 6.5L6.5 11.5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="toast-info-pulse shrink-0">
      <circle cx="9" cy="9" r="8" stroke="#0284c7" strokeWidth="1.5" fill="#ecfeff" />
      <path d="M9 8V12.5" stroke="#0284c7" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="5.75" r="0.75" fill="#0284c7" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0">
      <path d="M9 2L16.5 15H1.5L9 2Z" stroke="#ca8a04" strokeWidth="1.5" fill="#fffbeb" strokeLinejoin="round" />
      <path d="M9 7V10.5" stroke="#ca8a04" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="12.5" r="0.75" fill="#ca8a04" />
    </svg>
  );
}

export function AnimatedToaster() {
  return (
    <SonnerToaster
      position="top-right"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "!bg-card-bg !border-border-strong !rounded-[10px] !shadow-[0_6px_20px_rgba(0,0,0,0.12)] !p-0 !overflow-hidden group",
          title: "!text-text !text-sm !font-medium",
          description: "!text-text-muted !text-xs",
        },
        unstyled: true,
        duration: 4000,
      }}
      icons={{
        success: <SuccessIcon />,
        error: <ErrorIcon />,
        info: <InfoIcon />,
        warning: <WarningIcon />,
      }}
      // Custom render with progress bar
      // We use CSS-based animations since sonner manages its own lifecycle
    />
  );
}

/*
 * Custom toast functions with per-type entrance styles and progress bar.
 * These use toast.custom() for full control over rendering.
 */

interface AnimatedToastProps {
  id: string | number;
  type: "success" | "error" | "info" | "warning";
  title: string;
  description?: string;
  duration?: number;
}

function AnimatedToastContent({ id, type, title, description, duration = 4000 }: AnimatedToastProps) {
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation after mount
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Progress bar: track elapsed time, pause on hover
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 50;
        if (next >= duration) {
          toast.dismiss(id);
          return duration;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [paused, id, duration]);

  const progress = Math.max(0, 1 - elapsed / duration);

  // Per-type entrance animation class
  const entranceClass = {
    success: "translate-x-8 opacity-0",
    error: "-translate-y-4 opacity-0",
    info: "scale-95 opacity-0",
    warning: "translate-x-8 opacity-0",
  }[type];

  const visibleClass = "translate-x-0 translate-y-0 scale-100 opacity-100";

  // Per-type border color
  const borderColor = {
    success: "border-l-green-500",
    error: "border-l-red-500",
    info: "border-l-sky-500",
    warning: "border-l-amber-500",
  }[type];

  const progressColor = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-sky-500",
    warning: "bg-amber-500",
  }[type];

  const Icon = {
    success: SuccessIcon,
    error: ErrorIcon,
    info: InfoIcon,
    warning: WarningIcon,
  }[type];

  return (
    <div
      className={`w-[356px] rounded-[10px] border border-border-strong border-l-[3px] ${borderColor} bg-card-bg shadow-[0_6px_20px_rgba(0,0,0,0.12)] overflow-hidden transition-all duration-300 ease-out ${visible ? visibleClass : entranceClass}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="mt-0.5">
          <Icon />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text">{title}</p>
          {description && (
            <p className="mt-0.5 text-xs text-text-muted">{description}</p>
          )}
        </div>
        <button
          onClick={() => toast.dismiss(id)}
          className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-border hover:text-text"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-[2px] w-full bg-border">
        <div
          className={`h-full ${progressColor} origin-left transition-none`}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}

/* ── Replacement toast functions ───────────────────────── */

export const animatedToast = {
  success: (title: string, opts?: { description?: string; duration?: number }) =>
    toast.custom(
      (id) => (
        <AnimatedToastContent
          id={id}
          type="success"
          title={title}
          description={opts?.description}
          duration={opts?.duration ?? 4000}
        />
      ),
      { duration: Infinity } // We manage auto-dismiss ourselves
    ),

  error: (title: string, opts?: { description?: string; duration?: number }) =>
    toast.custom(
      (id) => (
        <AnimatedToastContent
          id={id}
          type="error"
          title={title}
          description={opts?.description}
          duration={opts?.duration ?? 5000}
        />
      ),
      { duration: Infinity }
    ),

  info: (title: string, opts?: { description?: string; duration?: number }) =>
    toast.custom(
      (id) => (
        <AnimatedToastContent
          id={id}
          type="info"
          title={title}
          description={opts?.description}
          duration={opts?.duration ?? 4000}
        />
      ),
      { duration: Infinity }
    ),

  warning: (title: string, opts?: { description?: string; duration?: number }) =>
    toast.custom(
      (id) => (
        <AnimatedToastContent
          id={id}
          type="warning"
          title={title}
          description={opts?.description}
          duration={opts?.duration ?? 4500}
        />
      ),
      { duration: Infinity }
    ),
};

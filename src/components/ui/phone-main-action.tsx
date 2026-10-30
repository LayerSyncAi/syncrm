"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const cls =
  "fixed right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-pop)] transition-transform active:scale-[0.97] md:hidden";

// Sits just above the bottom tab bar (60px plus the home-indicator area).
const style = { bottom: "calc(env(safe-area-inset-bottom) + 72px)" };

// True in the browser, false while rendering on the server, without a
// mismatch when the page hydrates.
const noop = () => () => {};
const useIsClient = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * The screen's main job (New lead, Record payment), floating within thumb
 * reach on phones. Desktop shows the same action as a button in the header.
 * Rendered into <body>: pages animate in with a transform, and a transformed
 * ancestor would pin a fixed element to the page instead of the screen.
 */
export function PhoneMainAction({
  label,
  icon: Icon,
  href,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
}) {
  const isClient = useIsClient();
  if (!isClient) return null;
  const body = (
    <>
      <Icon className="h-5 w-5" aria-hidden="true" />
      {label}
    </>
  );
  return createPortal(
    href ? (
      <Link href={href} className={cls} style={style}>
        {body}
      </Link>
    ) : (
      <button type="button" onClick={onClick} className={cls} style={style}>
        {body}
      </button>
    ),
    document.body
  );
}

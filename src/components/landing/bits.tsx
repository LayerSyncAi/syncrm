/**
 * Small shared pieces for the landing page: CTA buttons, headings with an
 * accent phrase, the logo. Server-safe (no hooks).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { whatsAppLink } from "@/config/marketing";
import type { Headline } from "./content";

export function WhatsAppGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.1 8.2c-.2-.5-.4-.5-.6-.5h-.5a1 1 0 0 0-.7.3c-.3.3-1 1-1 2.3s1 2.7 1.2 2.9c.1.2 2 3.1 4.9 4.2 2.4.9 2.9.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4l-.5-.3-1.7-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.3-.1-1-.4-2-1.2a7.3 7.3 0 0 1-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.4.3-.5v-.5l-.8-1.9Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Two stacked copies of the label so it rolls on hover. */
export function Roll({ children }: { children: ReactNode }) {
  return (
    <span className="l-roll">
      <span>{children}</span>
      <span aria-hidden>{children}</span>
    </span>
  );
}

export function WhatsAppButton({
  children = "Chat to us on WhatsApp",
  message,
  size = "md",
  cta,
  className,
}: {
  children?: ReactNode;
  message?: string;
  size?: "sm" | "md" | "lg";
  cta: string;
  className?: string;
}) {
  const sizeClass = size === "sm" ? "l-btn-sm" : size === "lg" ? "l-btn-lg" : "";
  return (
    <a
      href={whatsAppLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      data-cta={cta}
      className={`l-btn l-btn-primary ${sizeClass} ${className ?? ""}`}
    >
      <WhatsAppGlyph size={size === "lg" ? 20 : size === "sm" ? 16 : 18} />
      <Roll>{children}</Roll>
    </a>
  );
}

export function GhostLink({
  href,
  children,
  size = "md",
  className,
  icon,
}: {
  href: string;
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
  icon?: ReactNode;
}) {
  const internal = href.startsWith("/");
  const cls = `l-btn l-btn-ghost ${size === "sm" ? "l-btn-sm" : ""} ${className ?? ""}`;
  const inner = (
    <>
      <Roll>{children}</Roll>
      {icon}
    </>
  );
  return internal ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <a href={href} className={cls}>
      {inner}
    </a>
  );
}

/** A headline whose second part takes the green mono accent. */
export function Accent({ h }: { h: Headline }) {
  return (
    <>
      {h[0]}
      <span className="l-accent">{h[1]}</span>
      {h[2] ?? null}
    </>
  );
}

export function Eyebrow({ children, className, dot = false }: { children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <p className={`l-eyebrow flex items-center gap-2 ${className ?? ""}`}>
      {dot ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--l-accent)] shadow-[0_0_10px_var(--l-accent)]" /> : null}
      {children}
    </p>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`relative inline-flex items-center ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/lockup-reversed.svg" alt="SyncEstate" width={138} height={32} className="l-only-dark h-8 w-auto" />
      {/* The light theme's own lockup: the mark straight on the page like the
          dark one, with a dark wordmark and the lime deepened for light grounds. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/lockup-light.svg" alt="SyncEstate" width={138} height={32} className="l-only-light h-8 w-auto" />
    </span>
  );
}

/** Max-width content column with the page gutters. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-4 sm:px-8 ${className ?? ""}`}>{children}</div>;
}

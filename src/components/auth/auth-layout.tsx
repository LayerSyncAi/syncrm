"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { brand } from "@/config/brand";
import { MODULES, MODULE_ORDER } from "@/config/modules";

/* ── Required field label helper ── */

export function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-sm font-semibold text-text">
      {children}
      <span className="text-red-500 ml-0.5">*</span>
    </label>
  );
}

/* ── Supplemental panel (right side) ── */

/**
 * Charcoal panel with the mark, the tagline and the products one sign-in
 * opens. Hidden on phones, where the form is a single column.
 */
function SupplementalContent() {
  return (
    <div className="relative h-full overflow-hidden rounded-[28px] bg-sidebar-bg text-sidebar-fg">
      {/* A soft green glow behind the mark, as on the logo sheet */}
      <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/15 blur-[70px]" />
      <div className="absolute -bottom-20 -right-16 h-64 w-64 rounded-full bg-primary/10 blur-[60px]" />

      <div className="relative z-10 flex h-full flex-col justify-between gap-8 p-8 lg:p-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="space-y-5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG mark, swappable per client */}
          <img src={brand.logos.mark} alt="" className="h-16 w-auto" />
          <h2 className="text-[28px] font-light leading-tight tracking-[-0.03em] text-white lg:text-[34px]">{brand.tagline}</h2>
          <p className="max-w-sm text-sm leading-relaxed text-white/60">
            Leads, lettings, valuations, developments and the money behind them, on one login. A landlord or tenant you add
            once is the same person everywhere.
          </p>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="space-y-1"
        >
          {MODULE_ORDER.map((key) => {
            const m = MODULES[key];
            const Icon = m.icon;
            return (
              <li key={key} className="flex items-center gap-3 rounded-[14px] px-2 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.06] text-primary ring-1 ring-inset ring-white/10">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white">{m.name}</span>
                  <span className="block truncate text-xs text-white/50">{m.tagline}</span>
                </span>
              </li>
            );
          })}
        </motion.ul>
      </div>
    </div>
  );
}

/* ── Auth layout wrapper ── */

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid h-screen grid-cols-1 md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_440px] xl:grid-cols-[1fr_520px] bg-content-bg">
      {/* Left — scrollable form side */}
      <div className="relative bg-content-bg overflow-y-auto flex flex-col">
        <Link href="/" className="sticky top-0 z-20 bg-content-bg px-6 pt-6 pb-2 sm:px-8 sm:pt-8 md:px-14 lg:px-20" aria-label={`${brand.name} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG logo, swappable per client */}
          <img src={brand.logos.lockup} alt={brand.name} className="h-8 w-auto" />
        </Link>
        <div className="flex flex-1 items-center justify-center px-6 pb-10 sm:px-8 md:px-14 lg:px-20">
          <div className="w-full max-w-lg">
            {children}
          </div>
        </div>
      </div>

      {/* Right — supplemental panel */}
      <div className="hidden md:block p-3">
        <SupplementalContent />
      </div>
    </main>
  );
}

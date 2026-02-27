"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { Star } from "lucide-react";

/* ── Stagger animation variants (exported for use by auth pages) ── */

export const containerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

export const itemVariants: Variants = {
  initial: { y: 20, opacity: 0 },
  animate: {
    y: 0,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 70, damping: 14 },
  },
};

/* ── Avatar data for social proof ── */

const AVATARS = [
  { initials: "SM", bg: "bg-amber-400 text-amber-900" },
  { initials: "JR", bg: "bg-emerald-400 text-emerald-900" },
  { initials: "AL", bg: "bg-sky-400 text-sky-900" },
  { initials: "KP", bg: "bg-rose-400 text-rose-900" },
];

const avatarVariants: Variants = {
  initial: { x: 10, opacity: 0 },
  animate: (i: number) => ({
    x: 0,
    opacity: 1,
    transition: {
      delay: 0.6 + i * 0.1,
      type: "spring" as const,
      stiffness: 100,
    },
  }),
};

/* ── Supplemental panel (right side) ── */

function SupplementalContent() {
  return (
    <section className="sticky top-4 z-10 hidden md:flex h-[calc(100vh_-_32px)] overflow-hidden rounded-2xl relative">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1f2a44] via-[#263554] to-[#1a2236]" />

      {/* Golden glow orbs */}
      <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#eca400]/10 blur-[80px]" />
      <div className="absolute bottom-1/3 -left-10 w-64 h-64 rounded-full bg-[#eca400]/[0.07] blur-[60px]" />
      <div className="absolute bottom-10 right-10 w-40 h-40 rounded-full bg-[#d89500]/[0.05] blur-[50px]" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Content */}
      <div className="absolute inset-0 z-10 flex flex-col justify-center p-10 lg:p-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
        >
          <h2 className="text-3xl font-bold leading-tight text-white lg:text-4xl">
            Close more deals,
            <br />
            <span className="text-[#eca400]">faster than ever.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400 max-w-sm">
            The real estate CRM that helps you track leads, manage your
            pipeline, and close deals with confidence.
          </p>
        </motion.div>

        {/* Social proof */}
        <div className="mt-8 flex items-center gap-3">
          <div className="flex -space-x-3">
            {AVATARS.map((a, i) => (
              <motion.div
                key={a.initials}
                custom={i}
                variants={avatarVariants}
                initial="initial"
                animate="animate"
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#1f2a44] text-xs font-bold ${a.bg}`}
              >
                {a.initials}
              </motion.div>
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className="h-4 w-4 fill-[#eca400] text-[#eca400]"
                />
              ))}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Trusted by 500+ agents
            </p>
          </motion.div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 z-10 h-48 bg-gradient-to-b from-transparent to-[#1f2a44]" />
    </section>
  );
}

/* ── Auth layout wrapper ── */

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-[1fr,_400px] lg:grid-cols-[1fr,_600px] bg-[#1f2a44]">
      {/* Left — form side */}
      <div className="relative flex flex-col justify-center bg-content-bg px-6 py-14 md:px-12 lg:px-20">
        <Link
          href="/"
          className="absolute left-6 top-6 text-xs uppercase tracking-[0.2em] font-semibold text-text-dim hover:text-text transition-colors md:left-12 lg:left-20"
        >
          SynCRM
        </Link>
        <div className="w-full max-w-md mx-auto md:mx-0">{children}</div>
      </div>

      {/* Right — supplemental panel */}
      <div className="hidden md:block bg-[#1f2a44] p-4">
        <SupplementalContent />
      </div>
    </main>
  );
}

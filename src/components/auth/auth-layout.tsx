"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import {
  Star,
  BarChart3,
  Users,
  TrendingUp,
  Building2,
} from "lucide-react";

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

/* ── Mini dashboard mockup (rendered with CSS) ── */

function DashboardMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="mt-10 w-full"
    >
      <div className="rounded-xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-4 shadow-2xl">
        {/* Mock top bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
          </div>
          <div className="flex-1 h-5 rounded-md bg-white/[0.06] mx-6" />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg bg-white/[0.06] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Users className="h-3.5 w-3.5 text-[#eca400]" />
              <span className="text-[10px] text-slate-400">Leads</span>
            </div>
            <p className="text-lg font-bold text-white">247</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />
              <span className="text-[9px] text-emerald-400">+12%</span>
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.06] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Building2 className="h-3.5 w-3.5 text-[#eca400]" />
              <span className="text-[10px] text-slate-400">Properties</span>
            </div>
            <p className="text-lg font-bold text-white">89</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />
              <span className="text-[9px] text-emerald-400">+5%</span>
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.06] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-[#eca400]" />
              <span className="text-[10px] text-slate-400">Deals</span>
            </div>
            <p className="text-lg font-bold text-white">$1.2M</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />
              <span className="text-[9px] text-emerald-400">+18%</span>
            </div>
          </div>
        </div>

        {/* Pipeline bars */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-400 w-16 shrink-0">New Lead</span>
            <div className="flex-1 h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#eca400] to-[#d89500]"
                initial={{ width: 0 }}
                animate={{ width: "85%" }}
                transition={{ delay: 1.0, duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-400 w-16 shrink-0">Contacted</span>
            <div className="flex-1 h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#eca400]/80 to-[#d89500]/80"
                initial={{ width: 0 }}
                animate={{ width: "62%" }}
                transition={{ delay: 1.1, duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-400 w-16 shrink-0">Viewing</span>
            <div className="flex-1 h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#eca400]/60 to-[#d89500]/60"
                initial={{ width: 0 }}
                animate={{ width: "44%" }}
                transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-400 w-16 shrink-0">Closed</span>
            <div className="flex-1 h-3 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500/80 to-emerald-400/80"
                initial={{ width: 0 }}
                animate={{ width: "28%" }}
                transition={{ delay: 1.3, duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Supplemental panel (right side) ── */

function SupplementalContent() {
  return (
    <div className="relative h-full overflow-hidden rounded-2xl">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1f2a44] via-[#263554] to-[#1a2236]" />

      {/* Visible golden glow orbs */}
      <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-[#eca400]/20 blur-[60px]" />
      <div className="absolute bottom-1/4 -left-8 w-56 h-56 rounded-full bg-[#eca400]/15 blur-[50px]" />
      <div className="absolute bottom-10 right-10 w-36 h-36 rounded-full bg-[#d89500]/10 blur-[40px]" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-center h-full p-8 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
        >
          <h2 className="text-2xl font-bold leading-tight text-white lg:text-3xl">
            Close more deals,
            <br />
            <span className="text-[#eca400]">faster than ever.</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400 max-w-sm">
            The real estate CRM that helps you track leads, manage your
            pipeline, and close deals with confidence.
          </p>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 flex items-center gap-3"
        >
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
          <div>
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
          </div>
        </motion.div>

        {/* Dashboard mockup */}
        <DashboardMockup />
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 z-20 h-32 bg-gradient-to-b from-transparent to-[#1a2236]" />
    </div>
  );
}

/* ── Auth layout wrapper ── */

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid h-screen grid-cols-1 md:grid-cols-[1fr,_400px] lg:grid-cols-[1fr,_600px] bg-[#1f2a44]">
      {/* Left — scrollable form side */}
      <div className="relative bg-content-bg overflow-y-auto flex flex-col">
        <Link
          href="/"
          className="sticky top-0 z-20 px-6 pt-6 pb-2 bg-content-bg text-xs uppercase tracking-[0.2em] font-semibold text-text-dim hover:text-text transition-colors md:px-12 lg:px-20"
        >
          SynCRM
        </Link>
        <div className="w-full max-w-md my-auto px-6 pb-10 md:mx-0 md:px-12 lg:px-20">
          {children}
        </div>
      </div>

      {/* Right — supplemental panel */}
      <div className="hidden md:block bg-[#1f2a44] p-4">
        <SupplementalContent />
      </div>
    </main>
  );
}

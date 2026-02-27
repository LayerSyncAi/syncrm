"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Loader2,
  Lock,
  Merge,
  MousePointerClick,
  Sparkles,
  Target,
  Users,
  Waypoints,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.08, type: "spring" as const, stiffness: 200, damping: 20 },
  }),
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const features = [
  {
    icon: Waypoints,
    title: "Pipeline Management",
    description:
      "Visualize every deal across customizable stages. Drag leads through your pipeline and never lose track of a prospect.",
  },
  {
    icon: Target,
    title: "Lead Scoring",
    description:
      "Automatically score and prioritize leads based on configurable criteria so your team focuses on what converts.",
  },
  {
    icon: Building2,
    title: "Property Matching",
    description:
      "Smart matching suggests ideal properties for each lead based on budget, preferences, and location.",
  },
  {
    icon: ClipboardList,
    title: "Task & Activity Tracking",
    description:
      "Schedule follow-ups, log calls, and track every interaction. Overdue alerts ensure nothing falls through the cracks.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Role-based access for admins and agents. Assign leads, track performance, and manage commissions in one place.",
  },
  {
    icon: FileSpreadsheet,
    title: "Import & Export",
    description:
      "Bulk import leads from CSV with smart duplicate detection. Export filtered data to CSV or Excel in seconds.",
  },
  {
    icon: Merge,
    title: "Duplicate Detection & Merge",
    description:
      "Automatically flag duplicate contacts by email or phone and merge them cleanly with full audit trails.",
  },
  {
    icon: BarChart3,
    title: "Dashboard Analytics",
    description:
      "Real-time conversion funnels, pipeline velocity, and agent performance metrics at a glance.",
  },
];

const benefits = [
  "Close deals faster with organized pipelines",
  "Never miss a follow-up with smart reminders",
  "Make data-driven decisions with live analytics",
  "Onboard your team in minutes, not days",
  "Secure role-based access protects sensitive data",
  "Works seamlessly on desktop and mobile",
];

/* ------------------------------------------------------------------ */
/*  Section wrapper with viewport animation                            */
/* ------------------------------------------------------------------ */

function AnimatedSection({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.section
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !isLoading && !hasRedirected.current) {
      hasRedirected.current = true;
      setIsRedirecting(true);
      router.replace("/app/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Checking authentication...</p>
        </div>
      </main>
    );
  }

  if (isAuthenticated || isRedirecting) {
    return (
      <main className="min-h-screen bg-content-bg flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-text-muted">Redirecting to dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-content-bg overflow-x-hidden">
      {/* ── Navbar ────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-content-bg/80 border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-semibold tracking-tight">
              Syn<span className="text-primary-600">CRM</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-text-muted hover:text-text transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-[0_0_0_4px_rgba(236,164,0,0.12)] hover:bg-primary transition-colors"
            >
              Get Started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative isolate pt-20 pb-24 sm:pt-28 sm:pb-32">
        {/* Decorative gradient blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-[520px] w-[720px] rounded-full opacity-30"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(236,164,0,0.25) 0%, rgba(236,164,0,0.08) 40%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-40 -left-32 h-64 w-64 rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(2,132,199,0.3) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-60 -right-32 h-72 w-72 rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(22,163,74,0.2) 0%, transparent 70%)",
          }}
        />

        <div className="mx-auto max-w-3xl px-6 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-600/10 px-3 py-1 text-xs font-medium text-primary-600 ring-1 ring-primary-600/20 mb-6">
              <Zap className="h-3 w-3" />
              Built for real estate teams
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mt-4"
          >
            Your pipeline,{" "}
            <span className="relative">
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, #eca400 0%, #d89500 50%, #b07a00 100%)",
                }}
              >
                perfectly in sync
              </span>
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-primary-600/40"
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 0.8, delay: 0.7, ease: "easeOut" }}
              />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-6 text-lg sm:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed"
          >
            SynCRM is the modern CRM built for real estate agencies. Manage leads,
            match properties, track activities, and close deals faster — all in one
            beautiful, real-time platform.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-[12px] bg-primary-600 px-6 py-3 text-base font-semibold text-white shadow-[0_0_0_4px_rgba(236,164,0,0.12),0_8px_24px_rgba(236,164,0,0.2)] hover:bg-primary hover:shadow-[0_0_0_4px_rgba(236,164,0,0.18),0_12px_32px_rgba(236,164,0,0.25)] transition-all duration-200"
            >
              Start Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center gap-2 rounded-[12px] border border-border-strong px-6 py-3 text-base font-medium text-text-muted hover:bg-card-bg hover:text-text transition-all duration-200"
            >
              <MousePointerClick className="h-4 w-4" />
              See Features
            </Link>
          </motion.div>
        </div>

        {/* ── Hero visual: mock dashboard card ───────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-16 max-w-5xl px-6"
        >
          <div className="rounded-[16px] border border-border bg-card-bg shadow-[0_20px_60px_rgba(15,23,42,0.08)] overflow-hidden">
            {/* Top bar mock */}
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <span className="h-3 w-3 rounded-full bg-danger/60" />
              <span className="h-3 w-3 rounded-full bg-warning/60" />
              <span className="h-3 w-3 rounded-full bg-success/60" />
              <span className="ml-3 text-xs text-text-dim">SynCRM — Dashboard</span>
            </div>
            {/* Content mock */}
            <div className="grid grid-cols-4 gap-4 p-6">
              {[
                { label: "Active Leads", value: "247", color: "text-info" },
                { label: "Properties", value: "1,024", color: "text-success" },
                { label: "This Month", value: "38", color: "text-primary-600" },
                { label: "Conversion", value: "24%", color: "text-warning" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  custom={i}
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  className="rounded-[12px] border border-border bg-surface-2/50 p-4"
                >
                  <p className="text-xs text-text-dim">{stat.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${stat.color}`}>
                    {stat.value}
                  </p>
                </motion.div>
              ))}
            </div>
            {/* Pipeline mock */}
            <div className="px-6 pb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1 flex-1 rounded-full bg-info/20 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-info"
                    initial={{ width: 0 }}
                    animate={{ width: "80%" }}
                    transition={{ duration: 1.2, delay: 1 }}
                  />
                </div>
                <div className="h-1 flex-1 rounded-full bg-primary-600/20 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-primary-600"
                    initial={{ width: 0 }}
                    animate={{ width: "55%" }}
                    transition={{ duration: 1.2, delay: 1.15 }}
                  />
                </div>
                <div className="h-1 flex-1 rounded-full bg-success/20 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-success"
                    initial={{ width: 0 }}
                    animate={{ width: "35%" }}
                    transition={{ duration: 1.2, delay: 1.3 }}
                  />
                </div>
                <div className="h-1 flex-1 rounded-full bg-warning/20 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-warning"
                    initial={{ width: 0 }}
                    animate={{ width: "20%" }}
                    transition={{ duration: 1.2, delay: 1.45 }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-text-dim">
                <span>New Inquiry</span>
                <span>Qualifying</span>
                <span>Negotiation</span>
                <span>Closed Won</span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <AnimatedSection
        className="py-24 sm:py-32 bg-card-bg border-y border-border"
      >
        <div id="features" className="mx-auto max-w-6xl px-6 scroll-mt-20">
          <motion.div variants={fadeUp} custom={0} className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-600">
              Features
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need to manage your pipeline
            </h2>
            <p className="mt-4 text-text-muted text-base leading-relaxed">
              From first contact to closed deal, SynCRM gives your team the tools to
              stay organized, move fast, and win more business.
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                custom={i}
                variants={fadeUp}
                className="group relative rounded-[14px] border border-border bg-content-bg p-6 hover:border-primary-600/30 hover:shadow-[0_8px_30px_rgba(236,164,0,0.08)] transition-all duration-300"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary-600/10 text-primary-600 group-hover:bg-primary-600 group-hover:text-white transition-colors duration-300">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ── Benefits ─────────────────────────────────────────────── */}
      <AnimatedSection className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-16 lg:grid-cols-2 items-center">
            {/* Left: text */}
            <div>
              <motion.span
                variants={fadeUp}
                custom={0}
                className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-600"
              >
                Why SynCRM
              </motion.span>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight"
              >
                Built to help you close more deals
              </motion.h2>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="mt-4 text-text-muted text-base leading-relaxed"
              >
                Every feature is designed around the way real estate teams actually
                work — fast-paced, relationship-driven, and always on the move.
              </motion.p>
              <motion.ul variants={stagger} className="mt-8 space-y-4">
                {benefits.map((benefit, i) => (
                  <motion.li
                    key={benefit}
                    custom={i + 3}
                    variants={fadeUp}
                    className="flex items-start gap-3"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
                    <span className="text-sm leading-relaxed">{benefit}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </div>

            {/* Right: visual card */}
            <motion.div variants={fadeUp} custom={2}>
              <div className="rounded-[16px] border border-border bg-card-bg shadow-[0_16px_48px_rgba(15,23,42,0.06)] p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-9 w-9 rounded-[10px] bg-primary-600/10 flex items-center justify-center">
                    <Lock className="h-4.5 w-4.5 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Role-Based Access</p>
                    <p className="text-xs text-text-dim">
                      Admins and agents see exactly what they need
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { role: "Admin", perms: ["Full dashboard", "User management", "Lead scoring config", "Commission tracking"], color: "bg-primary-600" },
                    { role: "Agent", perms: ["Assigned leads", "Tasks & follow-ups", "Property suggestions", "Activity logging"], color: "bg-info" },
                  ].map((r) => (
                    <div
                      key={r.role}
                      className="rounded-[12px] border border-border bg-surface-2/50 p-4"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${r.color}`}
                        />
                        <span className="text-xs font-semibold">{r.role}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {r.perms.map((p) => (
                          <span
                            key={p}
                            className="rounded-full bg-card-bg border border-border px-2.5 py-0.5 text-[11px] text-text-muted"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </AnimatedSection>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <AnimatedSection className="py-24 sm:py-32 bg-card-bg border-y border-border">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <motion.div
            variants={fadeUp}
            custom={0}
            className="inline-flex h-14 w-14 items-center justify-center rounded-[14px] bg-primary-600/10 mb-6"
          >
            <Sparkles className="h-7 w-7 text-primary-600" />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="text-3xl sm:text-4xl font-bold tracking-tight"
          >
            Ready to sync your pipeline?
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="mt-4 text-text-muted text-base leading-relaxed max-w-xl mx-auto"
          >
            Join real estate teams who use SynCRM to stay organized, collaborate
            better, and close deals faster. Set up your workspace in minutes.
          </motion.p>
          <motion.div
            variants={fadeUp}
            custom={3}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-[12px] bg-primary-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_0_4px_rgba(236,164,0,0.12),0_8px_24px_rgba(236,164,0,0.2)] hover:bg-primary hover:shadow-[0_0_0_4px_rgba(236,164,0,0.18),0_12px_32px_rgba(236,164,0,0.25)] transition-all duration-200"
            >
              Get Started — It&apos;s Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
      </AnimatedSection>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="py-10 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold">
              Syn<span className="text-primary-600">CRM</span>
            </span>
          </div>
          <p className="text-xs text-text-dim">
            &copy; {new Date().getFullYear()} SynCRM. Built for real estate teams.
          </p>
          <Link
            href="/login"
            className="text-xs font-medium text-primary-600 hover:underline"
          >
            Sign in to your account &rarr;
          </Link>
        </div>
      </footer>
    </main>
  );
}

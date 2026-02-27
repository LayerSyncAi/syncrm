"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Briefcase,
  Building,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Compass,
  Crown,
  FileSpreadsheet,
  House,
  Key,
  Landmark,
  LayoutDashboard,
  Loader2,
  Lock,
  MapPin,
  Merge,
  Search,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  User,
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

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const features = [
  {
    icon: Waypoints,
    title: "Pipeline Management",
    description:
      "Visualize every deal across customizable stages. Drag leads through your pipeline and never lose track of a prospect.",
    short: "Drag deals through customizable stages",
    gradient: "from-amber-400 to-orange-400",
    textColor: "text-orange-50",
  },
  {
    icon: Target,
    title: "Lead Scoring",
    description:
      "Automatically score and prioritize leads based on configurable criteria so your team focuses on what converts.",
    short: "Auto-prioritize leads that convert",
    gradient: "from-violet-400 to-indigo-400",
    textColor: "text-indigo-50",
  },
  {
    icon: Building2,
    title: "Property Matching",
    description:
      "Smart matching suggests ideal properties for each lead based on budget, preferences, and location.",
    short: "Smart property suggestions for every lead",
    gradient: "from-emerald-400 to-green-400",
    textColor: "text-green-50",
  },
  {
    icon: ClipboardList,
    title: "Task & Activity Tracking",
    description:
      "Schedule follow-ups, log calls, and track every interaction. Overdue alerts ensure nothing falls through the cracks.",
    short: "Schedule, track, and never miss follow-ups",
    gradient: "from-rose-400 to-pink-400",
    textColor: "text-pink-50",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Role-based access for admins and agents. Assign leads, track performance, and manage commissions in one place.",
    short: "Admin & agent roles with full control",
    gradient: "from-sky-400 to-blue-400",
    textColor: "text-blue-50",
  },
  {
    icon: FileSpreadsheet,
    title: "Import & Export",
    description:
      "Bulk import leads from CSV with smart duplicate detection. Export filtered data to CSV or Excel in seconds.",
    short: "CSV import with smart duplicate detection",
    gradient: "from-red-400 to-orange-400",
    textColor: "text-orange-50",
  },
  {
    icon: Merge,
    title: "Duplicate Detection & Merge",
    description:
      "Automatically flag duplicate contacts by email or phone and merge them cleanly with full audit trails.",
    short: "Find and merge duplicate contacts cleanly",
    gradient: "from-teal-400 to-cyan-400",
    textColor: "text-cyan-50",
  },
  {
    icon: BarChart3,
    title: "Dashboard Analytics",
    description:
      "Real-time conversion funnels, pipeline velocity, and agent performance metrics at a glance.",
    short: "Funnels, velocity, and performance metrics",
    gradient: "from-fuchsia-400 to-purple-400",
    textColor: "text-purple-50",
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
/*  Hero sub-components                                                */
/* ------------------------------------------------------------------ */

function HeroCopy() {
  return (
    <>
      <div className="mb-3 rounded-full bg-text/10">
        <Link
          href="/login"
          className="flex origin-top-left items-center rounded-full border border-text/20 bg-card-bg p-0.5 text-sm transition-transform hover:-rotate-2"
        >
          <span className="rounded-full bg-primary-600 px-2.5 py-0.5 font-medium text-white">
            NEW
          </span>
          <span className="ml-1.5 mr-1 inline-block text-text-muted">
            The CRM built for real estate teams
          </span>
          <ArrowUpRight className="mr-2 inline-block h-3.5 w-3.5 text-text-muted" />
        </Link>
      </div>

      <h1 className="max-w-4xl text-center text-4xl font-black leading-[1.15] text-text md:text-6xl md:leading-[1.15]">
        Manage your entire real estate{" "}
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(135deg, #eca400 0%, #d89500 50%, #b07a00 100%)",
          }}
        >
          pipeline
        </span>{" "}
        in one place
      </h1>

      <p className="mx-auto my-4 max-w-3xl text-center text-base leading-relaxed text-text-muted md:my-6 md:text-xl md:leading-relaxed">
        SynCRM helps real estate teams track leads, match properties, and close
        deals faster — with beautiful dashboards, smart scoring, and real-time
        collaboration.
      </p>

      <Link
        href="/login"
        className="rounded-lg bg-primary-600 px-5 py-3 text-sm font-bold uppercase text-white shadow-[0_4px_16px_rgba(236,164,0,0.3)] transition-colors hover:bg-primary"
      >
        Get Started —{" "}
        <span className="font-normal">no CC required</span>
      </Link>
    </>
  );
}

function HeroMockupScreen() {
  return (
    <div className="absolute bottom-0 left-1/2 h-36 w-[calc(100vw_-_56px)] max-w-[1100px] -translate-x-1/2 overflow-hidden rounded-t-xl bg-[#1f2a44] p-0.5">
      {/* Browser chrome */}
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-0.5">
          <span className="size-2 rounded-full bg-red-400" />
          <span className="size-2 rounded-full bg-yellow-400" />
          <span className="size-2 rounded-full bg-green-400" />
        </div>
        <span className="rounded bg-[#2d3a56] px-2 py-0.5 text-xs text-zinc-100">
          app.syncrm.com
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-white/60" />
      </div>

      {/* App content */}
      <div className="relative z-0 grid h-full w-full grid-cols-[100px,_1fr] overflow-hidden rounded-t-lg bg-card-bg md:grid-cols-[150px,_1fr]">
        {/* Sidebar */}
        <div className="h-full border-r border-border p-2">
          <div className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary-600">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <span className="text-[10px] font-semibold">
              Syn<span className="text-primary-600">CRM</span>
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs text-primary-600">
              <LayoutDashboard className="h-3 w-3" />
              <span>Dashboard</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-text-dim">
              <Users className="h-3 w-3" />
              <span>Leads</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-text-dim">
              <Building2 className="h-3 w-3" />
              <span>Properties</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-text-dim">
              <ClipboardList className="h-3 w-3" />
              <span>Tasks</span>
            </span>
          </div>
        </div>

        {/* Main area */}
        <div className="relative z-0 p-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-1 pr-8 text-xs text-text-dim">
              <Search className="h-3 w-3" />
              Search...
            </span>
            <div className="flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-primary-600" />
              <User className="h-4 w-4 text-text-dim" />
            </div>
          </div>
          <div className="h-full rounded-xl border border-dashed border-border-strong bg-surface-2/50" />
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 top-0 z-10 bg-gradient-to-b from-white/0 to-white" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Logo ticker sub-components                                         */
/* ------------------------------------------------------------------ */

function TranslateWrapper({
  children,
  reverse,
}: {
  children: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <motion.div
      initial={{ translateX: reverse ? "-100%" : "0%" }}
      animate={{ translateX: reverse ? "0%" : "-100%" }}
      transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
      className="flex px-2"
    >
      {children}
    </motion.div>
  );
}

function LogoItem({
  Icon,
  name,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  name: string;
}) {
  return (
    <span className="flex items-center justify-center gap-3 px-4 py-2 md:py-4">
      <Icon className="h-5 w-5 shrink-0 text-primary-600 md:h-6 md:w-6" />
      <span className="whitespace-nowrap text-lg font-semibold uppercase text-text md:text-xl">
        {name}
      </span>
    </span>
  );
}

function LogoItemsTop() {
  return (
    <>
      <LogoItem Icon={Building2} name="Apex Realty" />
      <LogoItem Icon={House} name="HomeFirst" />
      <LogoItem Icon={MapPin} name="CityScope" />
      <LogoItem Icon={Key} name="KeyStone" />
      <LogoItem Icon={Landmark} name="Meridian" />
      <LogoItem Icon={Crown} name="Royal Estates" />
      <LogoItem Icon={Briefcase} name="Premier" />
      <LogoItem Icon={Star} name="Starlight" />
      <LogoItem Icon={Shield} name="TrustHaven" />
      <LogoItem Icon={Compass} name="Compass RE" />
    </>
  );
}

function LogoItemsBottom() {
  return (
    <>
      <LogoItem Icon={Building} name="Harbor" />
      <LogoItem Icon={Trophy} name="Elite Realty" />
      <LogoItem Icon={Target} name="Pinnacle" />
      <LogoItem Icon={House} name="NestFinder" />
      <LogoItem Icon={MapPin} name="UrbanEdge" />
      <LogoItem Icon={Landmark} name="Heritage" />
      <LogoItem Icon={Building2} name="Skyline" />
      <LogoItem Icon={Key} name="OpenDoor" />
      <LogoItem Icon={Crown} name="Prestige" />
      <LogoItem Icon={Shield} name="SafeHarbor" />
    </>
  );
}

function HeroLogos() {
  return (
    <div className="relative -mt-2 -rotate-1 scale-[1.01] border-y-2 border-text/20 bg-card-bg">
      <div className="relative z-0 flex overflow-hidden border-b-2 border-text/20">
        <TranslateWrapper>
          <LogoItemsTop />
        </TranslateWrapper>
        <TranslateWrapper>
          <LogoItemsTop />
        </TranslateWrapper>
        <TranslateWrapper>
          <LogoItemsTop />
        </TranslateWrapper>
      </div>
      <div className="relative z-0 flex overflow-hidden">
        <TranslateWrapper reverse>
          <LogoItemsBottom />
        </TranslateWrapper>
        <TranslateWrapper reverse>
          <LogoItemsBottom />
        </TranslateWrapper>
        <TranslateWrapper reverse>
          <LogoItemsBottom />
        </TranslateWrapper>
      </div>

      {/* Side fades */}
      <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-32 bg-gradient-to-r from-white to-white/0" />
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-32 bg-gradient-to-l from-white to-white/0" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bouncy feature cards                                               */
/* ------------------------------------------------------------------ */

function BounceCard({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      whileHover={{ scale: 0.95, rotate: "-1deg" }}
      className={`group relative min-h-[300px] cursor-pointer overflow-hidden rounded-2xl bg-surface-2 p-8 ${className}`}
    >
      {children}
    </motion.div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mx-auto text-center text-2xl font-semibold md:text-3xl">
      {children}
    </h3>
  );
}

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

export default function LandingPage() {
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
    <main className="min-h-screen overflow-x-hidden bg-content-bg">
      {/* ── Navbar ────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border bg-card-bg/80 backdrop-blur-md">
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
              className="text-sm font-medium text-text-muted transition-colors hover:text-text"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-[0_0_0_4px_rgba(236,164,0,0.12)] transition-colors hover:bg-primary"
            >
              Get Started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="overflow-hidden bg-card-bg">
        <div className="relative flex flex-col items-center justify-center px-6 pb-52 pt-16 sm:px-12 md:pb-60 md:pt-28">
          <HeroCopy />
          <HeroMockupScreen />
        </div>
        <HeroLogos />
      </section>

      {/* ── Breathing spacer ─────────────────────────────────────── */}
      <div className="h-6 bg-content-bg" />

      {/* ── Features ─────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-20 bg-content-bg px-4 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end md:px-8">
            <h2 className="max-w-xl text-4xl font-bold md:text-5xl">
              Grow faster with our{" "}
              <span className="text-text-dim">all-in-one CRM</span>
            </h2>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                window.location.href = "/login";
              }}
              className="whitespace-nowrap rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white shadow-xl transition-colors hover:bg-primary"
            >
              Get started
            </motion.button>
          </div>

          {/* Row 1 — Pipeline Management (4) + Lead Scoring (8) */}
          <div className="mb-4 grid grid-cols-12 gap-4">
            <BounceCard className="col-span-12 md:col-span-4">
              <CardTitle>{features[0].title}</CardTitle>
              <div className={`absolute bottom-0 left-4 right-4 top-32 translate-y-8 rounded-t-2xl bg-gradient-to-br ${features[0].gradient} p-4 transition-transform duration-[250ms] group-hover:translate-y-4 group-hover:rotate-[2deg]`}>
                <features[0].icon className={`mx-auto mb-3 h-8 w-8 ${features[0].textColor}`} />
                <span className={`block text-center font-semibold ${features[0].textColor}`}>
                  {features[0].short}
                </span>
              </div>
            </BounceCard>
            <BounceCard className="col-span-12 md:col-span-8">
              <CardTitle>{features[1].title}</CardTitle>
              <div className={`absolute bottom-0 left-4 right-4 top-32 translate-y-8 rounded-t-2xl bg-gradient-to-br ${features[1].gradient} p-4 transition-transform duration-[250ms] group-hover:translate-y-4 group-hover:rotate-[2deg]`}>
                <features[1].icon className={`mx-auto mb-3 h-8 w-8 ${features[1].textColor}`} />
                <span className={`block text-center font-semibold ${features[1].textColor}`}>
                  {features[1].short}
                </span>
              </div>
            </BounceCard>
          </div>

          {/* Row 2 — Property Matching (8) + Task & Activity (4) */}
          <div className="mb-4 grid grid-cols-12 gap-4">
            <BounceCard className="col-span-12 md:col-span-8">
              <CardTitle>{features[2].title}</CardTitle>
              <div className={`absolute bottom-0 left-4 right-4 top-32 translate-y-8 rounded-t-2xl bg-gradient-to-br ${features[2].gradient} p-4 transition-transform duration-[250ms] group-hover:translate-y-4 group-hover:rotate-[2deg]`}>
                <features[2].icon className={`mx-auto mb-3 h-8 w-8 ${features[2].textColor}`} />
                <span className={`block text-center font-semibold ${features[2].textColor}`}>
                  {features[2].short}
                </span>
              </div>
            </BounceCard>
            <BounceCard className="col-span-12 md:col-span-4">
              <CardTitle>{features[3].title}</CardTitle>
              <div className={`absolute bottom-0 left-4 right-4 top-32 translate-y-8 rounded-t-2xl bg-gradient-to-br ${features[3].gradient} p-4 transition-transform duration-[250ms] group-hover:translate-y-4 group-hover:rotate-[2deg]`}>
                <features[3].icon className={`mx-auto mb-3 h-8 w-8 ${features[3].textColor}`} />
                <span className={`block text-center font-semibold ${features[3].textColor}`}>
                  {features[3].short}
                </span>
              </div>
            </BounceCard>
          </div>

          {/* Row 3 — Team Collaboration (4) + Import & Export (8) */}
          <div className="mb-4 grid grid-cols-12 gap-4">
            <BounceCard className="col-span-12 md:col-span-4">
              <CardTitle>{features[4].title}</CardTitle>
              <div className={`absolute bottom-0 left-4 right-4 top-32 translate-y-8 rounded-t-2xl bg-gradient-to-br ${features[4].gradient} p-4 transition-transform duration-[250ms] group-hover:translate-y-4 group-hover:rotate-[2deg]`}>
                <features[4].icon className={`mx-auto mb-3 h-8 w-8 ${features[4].textColor}`} />
                <span className={`block text-center font-semibold ${features[4].textColor}`}>
                  {features[4].short}
                </span>
              </div>
            </BounceCard>
            <BounceCard className="col-span-12 md:col-span-8">
              <CardTitle>{features[5].title}</CardTitle>
              <div className={`absolute bottom-0 left-4 right-4 top-32 translate-y-8 rounded-t-2xl bg-gradient-to-br ${features[5].gradient} p-4 transition-transform duration-[250ms] group-hover:translate-y-4 group-hover:rotate-[2deg]`}>
                <features[5].icon className={`mx-auto mb-3 h-8 w-8 ${features[5].textColor}`} />
                <span className={`block text-center font-semibold ${features[5].textColor}`}>
                  {features[5].short}
                </span>
              </div>
            </BounceCard>
          </div>

          {/* Row 4 — Duplicate Detection (8) + Dashboard Analytics (4) */}
          <div className="grid grid-cols-12 gap-4">
            <BounceCard className="col-span-12 md:col-span-8">
              <CardTitle>{features[6].title}</CardTitle>
              <div className={`absolute bottom-0 left-4 right-4 top-32 translate-y-8 rounded-t-2xl bg-gradient-to-br ${features[6].gradient} p-4 transition-transform duration-[250ms] group-hover:translate-y-4 group-hover:rotate-[2deg]`}>
                <features[6].icon className={`mx-auto mb-3 h-8 w-8 ${features[6].textColor}`} />
                <span className={`block text-center font-semibold ${features[6].textColor}`}>
                  {features[6].short}
                </span>
              </div>
            </BounceCard>
            <BounceCard className="col-span-12 md:col-span-4">
              <CardTitle>{features[7].title}</CardTitle>
              <div className={`absolute bottom-0 left-4 right-4 top-32 translate-y-8 rounded-t-2xl bg-gradient-to-br ${features[7].gradient} p-4 transition-transform duration-[250ms] group-hover:translate-y-4 group-hover:rotate-[2deg]`}>
                <features[7].icon className={`mx-auto mb-3 h-8 w-8 ${features[7].textColor}`} />
                <span className={`block text-center font-semibold ${features[7].textColor}`}>
                  {features[7].short}
                </span>
              </div>
            </BounceCard>
          </div>
        </div>
      </section>

      {/* ── Benefits ─────────────────────────────────────────────── */}
      <AnimatedSection className="bg-card-bg py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-16 lg:grid-cols-2">
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
                className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
              >
                Built to help you close more deals
              </motion.h2>
              <motion.p
                variants={fadeUp}
                custom={2}
                className="mt-4 text-base leading-relaxed text-text-muted"
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
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    <span className="text-sm leading-relaxed">{benefit}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </div>

            {/* Right: visual card */}
            <motion.div variants={fadeUp} custom={2}>
              <div className="rounded-[16px] border border-border bg-content-bg p-6 shadow-[0_16px_48px_rgba(15,23,42,0.06)]">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary-600/10">
                    <Lock className="h-4 w-4 text-primary-600" />
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
                    {
                      role: "Admin",
                      perms: [
                        "Full dashboard",
                        "User management",
                        "Lead scoring config",
                        "Commission tracking",
                      ],
                      color: "bg-primary-600",
                    },
                    {
                      role: "Agent",
                      perms: [
                        "Assigned leads",
                        "Tasks & follow-ups",
                        "Property suggestions",
                        "Activity logging",
                      ],
                      color: "bg-info",
                    },
                  ].map((r) => (
                    <div
                      key={r.role}
                      className="rounded-[12px] border border-border bg-card-bg p-4"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${r.color}`}
                        />
                        <span className="text-xs font-semibold">{r.role}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {r.perms.map((p) => (
                          <span
                            key={p}
                            className="rounded-full border border-border bg-surface-2/50 px-2.5 py-0.5 text-[11px] text-text-muted"
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
      <AnimatedSection className="bg-content-bg py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <motion.div
            variants={fadeUp}
            custom={0}
            className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-[14px] bg-primary-600/10"
          >
            <Sparkles className="h-7 w-7 text-primary-600" />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Ready to sync your pipeline?
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-text-muted"
          >
            Join real estate teams who use SynCRM to stay organized, collaborate
            better, and close deals faster. Set up your workspace in minutes.
          </motion.p>
          <motion.div
            variants={fadeUp}
            custom={3}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 rounded-[12px] bg-primary-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_0_4px_rgba(236,164,0,0.12),0_8px_24px_rgba(236,164,0,0.2)] transition-all duration-200 hover:bg-primary hover:shadow-[0_0_0_4px_rgba(236,164,0,0.18),0_12px_32px_rgba(236,164,0,0.25)]"
            >
              Get Started — It&apos;s Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </div>
      </AnimatedSection>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
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

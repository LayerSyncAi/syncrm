"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const FloatingLines = dynamic(() => import("@/components/ui/floating-lines"), {
  ssr: false,
});
import { useAuth } from "@/hooks/useAuth";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
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

const CARD_HEIGHT = 500;

const features = [
  {
    icon: Waypoints,
    title: "Pipeline Management",
    description:
      "Visualize every deal across customizable stages. Drag leads through your pipeline and never lose track of a prospect.",
    ctaClass: "bg-amber-300",
  },
  {
    icon: Target,
    title: "Lead Scoring",
    description:
      "Automatically score and prioritize leads based on configurable criteria so your team focuses on what converts.",
    ctaClass: "bg-violet-300",
  },
  {
    icon: Building2,
    title: "Property Matching",
    description:
      "Smart matching suggests ideal properties for each lead based on budget, preferences, and location.",
    ctaClass: "bg-emerald-300",
  },
  {
    icon: ClipboardList,
    title: "Task & Activity Tracking",
    description:
      "Schedule follow-ups, log calls, and track every interaction. Overdue alerts ensure nothing falls through the cracks.",
    ctaClass: "bg-rose-300",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Role-based access for admins and agents. Assign leads, track performance, and manage commissions in one place.",
    ctaClass: "bg-sky-300",
  },
  {
    icon: FileSpreadsheet,
    title: "Import & Export",
    description:
      "Bulk import leads from CSV with smart duplicate detection. Export filtered data to CSV or Excel in seconds.",
    ctaClass: "bg-orange-300",
  },
  {
    icon: Merge,
    title: "Duplicate Detection & Merge",
    description:
      "Automatically flag duplicate contacts by email or phone and merge them cleanly with full audit trails.",
    ctaClass: "bg-teal-300",
  },
  {
    icon: BarChart3,
    title: "Dashboard Analytics",
    description:
      "Real-time conversion funnels, pipeline velocity, and agent performance metrics at a glance.",
    ctaClass: "bg-fuchsia-300",
  },
  {
    icon: Lock,
    title: "Admin & Agent Access",
    description:
      "Full admin control over users, lead scoring, commissions, and pipeline stages — while agents get a focused view of their assigned leads, tasks, and property suggestions.",
    ctaClass: "bg-primary-600/80",
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
/*  Sticky scroll feature cards                                        */
/* ------------------------------------------------------------------ */

function StickyCard({
  position,
  feature,
  scrollYProgress,
}: {
  position: number;
  feature: (typeof features)[number];
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  const scaleFromPct = (position - 1) / features.length;
  const y = useTransform(scrollYProgress, [scaleFromPct, 1], [0, -CARD_HEIGHT]);
  const isOdd = position % 2 === 1;
  const Icon = feature.icon;

  return (
    <motion.div
      style={{
        height: CARD_HEIGHT,
        y: position === features.length ? undefined : y,
        background: isOdd ? "#1f2a44" : "white",
        color: isOdd ? "white" : "#1f2a44",
        zIndex: position,
      }}
      className="sticky top-14 flex w-full origin-top flex-col items-center justify-center px-4"
    >
      <Icon className="mb-4 h-10 w-10" />
      <h3 className="mb-6 text-center text-4xl font-semibold md:text-6xl">
        {feature.title}
      </h3>
      <p className="mb-8 max-w-lg text-center text-sm md:text-base">
        {feature.description}
      </p>
      <Link
        href="/login"
        className={`flex items-center gap-2 rounded px-6 py-4 text-base font-medium uppercase text-[#1f2a44] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 md:text-lg ${feature.ctaClass} ${
          isOdd
            ? "shadow-[4px_4px_0px_white] hover:shadow-[8px_8px_0px_white]"
            : "shadow-[4px_4px_0px_#1f2a44] hover:shadow-[8px_8px_0px_#1f2a44]"
        }`}
      >
        <span>Learn more</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </motion.div>
  );
}

function StickyFeatures() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  return (
    <>
      <div ref={ref} id="features" className="relative scroll-mt-14">
        {features.map((feature, idx) => (
          <StickyCard
            key={feature.title}
            feature={feature}
            scrollYProgress={scrollYProgress}
            position={idx + 1}
          />
        ))}
      </div>
      <div className="h-14 bg-[#1f2a44]" />
    </>
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
    <main className="min-h-screen overflow-x-clip bg-content-bg">
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

      {/* ── Features (sticky scroll cards) ──────────────────────── */}
      <StickyFeatures />

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
      <AnimatedSection className="relative overflow-hidden bg-[#080808] py-24 sm:py-32">
        {/* Floating lines — opaque black canvas, blended via mix-blend-mode: screen */}
        <div className="absolute inset-0 pointer-events-none">
          <FloatingLines
            linesGradient={["#ECA400", "#F59E0B", "#D97706", "#B45309"]}
            enabledWaves={["top", "middle", "bottom"]}
            lineCount={[4, 6, 4]}
            lineDistance={[8, 5, 8]}
            animationSpeed={0.6}
            interactive={false}
            parallax={false}
            mixBlendMode="screen"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <motion.div
            variants={fadeUp}
            custom={0}
            className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600/10 ring-1 ring-primary-600/20"
          >
            <Sparkles className="h-7 w-7 text-primary-500" />
          </motion.div>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="text-3xl font-bold tracking-tight text-white sm:text-5xl"
          >
            Ready to sync your pipeline?
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/70"
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
              className="group inline-flex items-center gap-2 rounded-[12px] bg-primary-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_24px_rgba(236,164,0,0.3)] transition-all duration-200 hover:bg-primary hover:shadow-[0_0_32px_rgba(236,164,0,0.45)]"
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

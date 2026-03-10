"use client";

import { useState, useCallback } from "react";
import Joyride, {
  CallBackProps,
  STATUS,
  Step,
  TooltipRenderProps,
} from "react-joyride";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  X,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  PartyPopper,
  LayoutDashboard,
  Waypoints,
  Users,
  Building2,
  ClipboardList,
  Upload,
  Shield,
  UserCircle,
} from "lucide-react";

const tourSteps: Step[] = [
  {
    target: "body",
    placement: "center",
    disableBeacon: true,
    content: "",
    data: {
      icon: "welcome",
      title: "Welcome to SynCRM!",
      description:
        "Let us show you around. This quick tour will walk you through the main features so you can hit the ground running.",
    },
  },
  {
    target: '[data-tour="sidebar-nav"]',
    placement: "right",
    disableBeacon: true,
    content: "",
    data: {
      icon: "nav",
      title: "Main Navigation",
      description:
        "This is your command center. Quickly access your Dashboard, Leads, Contacts, Properties, and Tasks from here.",
    },
  },
  {
    target: '[href="/app/dashboard"]',
    placement: "right",
    disableBeacon: true,
    content: "",
    data: {
      icon: "dashboard",
      title: "Dashboard",
      description:
        "Your real-time overview of pipeline performance, lead scores, win rates, and top priorities at a glance.",
    },
  },
  {
    target: '[href="/app/leads"]',
    placement: "right",
    disableBeacon: true,
    content: "",
    data: {
      icon: "leads",
      title: "Leads",
      description:
        "Manage all your leads in one place. Track their journey through your pipeline, score them, and never miss a follow-up.",
    },
  },
  {
    target: '[href="/app/contacts"]',
    placement: "right",
    disableBeacon: true,
    content: "",
    data: {
      icon: "contacts",
      title: "Contacts",
      description:
        "Your contact directory. Store phone numbers, emails, and preferred areas for all your clients.",
    },
  },
  {
    target: '[href="/app/properties"]',
    placement: "right",
    disableBeacon: true,
    content: "",
    data: {
      icon: "properties",
      title: "Properties",
      description:
        "List and manage properties for rent or sale. Match them with leads and share between agents.",
    },
  },
  {
    target: '[href="/app/tasks"]',
    placement: "right",
    disableBeacon: true,
    content: "",
    data: {
      icon: "tasks",
      title: "Tasks",
      description:
        "Schedule calls, meetings, viewings, and emails. Stay on top of your daily activities with reminders.",
    },
  },
  {
    target: '[data-tour="sidebar-import-export"]',
    placement: "right-start",
    disableBeacon: true,
    content: "",
    data: {
      icon: "import",
      title: "Import & Export",
      description:
        "Bulk import leads from CSV files or export your data anytime. Great for migrating from other systems.",
    },
  },
  {
    target: '[data-tour="sidebar-admin"]',
    placement: "right-start",
    disableBeacon: true,
    content: "",
    data: {
      icon: "admin",
      title: "Admin Panel",
      description:
        "Manage your team, configure pipeline stages, set up lead scoring rules, and track commissions.",
    },
  },
  {
    target: '[data-tour="user-profile"]',
    placement: "bottom-end",
    disableBeacon: true,
    content: "",
    data: {
      icon: "profile",
      title: "Your Profile",
      description:
        "Access your account settings, set your timezone, and log out from here.",
    },
  },
];

const iconMap: Record<string, React.ReactNode> = {
  welcome: <PartyPopper className="h-6 w-6" />,
  nav: <LayoutDashboard className="h-6 w-6" />,
  dashboard: <LayoutDashboard className="h-6 w-6" />,
  leads: <Waypoints className="h-6 w-6" />,
  contacts: <Users className="h-6 w-6" />,
  properties: <Building2 className="h-6 w-6" />,
  tasks: <ClipboardList className="h-6 w-6" />,
  import: <Upload className="h-6 w-6" />,
  admin: <Shield className="h-6 w-6" />,
  profile: <UserCircle className="h-6 w-6" />,
};

function CustomTooltip({
  index,
  step,
  size,
  isLastStep,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  const data = (step as Step & { data?: { icon: string; title: string; description: string } }).data;
  const isWelcome = index === 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      {...tooltipProps}
      className="relative z-[10001] w-[340px] max-w-[calc(100vw-32px)] rounded-2xl border border-border-strong bg-card-bg shadow-[0_20px_60px_rgba(0,0,0,0.3)] overflow-hidden"
    >
      {/* Top accent gradient */}
      <div className="h-1 w-full bg-gradient-to-r from-[#2a5925] via-[#eca400] to-[#2a5925]" />

      <div className="p-5">
        {/* Icon and title */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#2a5925]/10 text-[#2a5925]">
            {data?.icon ? iconMap[data.icon] : null}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-text">
              {data?.title}
            </h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed text-text-muted mb-4">
          {data?.description}
        </p>

        {/* Progress bar */}
        <div className="flex items-center gap-1.5 mb-4">
          {Array.from({ length: size }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= index ? "bg-[#2a5925]" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <button
            {...skipProps}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-text-dim transition-colors hover:bg-row-hover hover:text-text-muted"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                {...backProps}
                className="flex items-center gap-1 rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-row-hover"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}

            <button
              {...primaryProps}
              className="flex items-center gap-1 rounded-lg bg-[#2a5925] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[#1e3f1a] shadow-sm"
            >
              {isWelcome
                ? "Start Tour"
                : isLastStep
                  ? "Finish"
                  : "Next"}
              {!isLastStep && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Step counter */}
        <p className="mt-3 text-center text-[11px] text-text-dim">
          {index + 1} of {size}
        </p>
      </div>
    </motion.div>
  );
}

interface OnboardingTourProps {
  isAdmin: boolean;
  onComplete: () => void;
}

export function OnboardingTour({ isAdmin, onComplete }: OnboardingTourProps) {
  const [run, setRun] = useState(true);
  const [showCompletion, setShowCompletion] = useState(false);
  const completeOnboarding = useMutation(api.users.completeOnboarding);

  // Filter out admin step for non-admin users
  const steps = isAdmin
    ? tourSteps
    : tourSteps.filter((s) => (s as Step & { data?: { icon: string } }).data?.icon !== "admin");

  const handleCallback = useCallback(
    async (data: CallBackProps) => {
      const { status } = data;

      if (status === STATUS.FINISHED) {
        setRun(false);
        setShowCompletion(true);
      } else if (status === STATUS.SKIPPED) {
        setRun(false);
        try {
          await completeOnboarding();
        } catch (e) {
          console.error("Failed to complete onboarding:", e);
        }
        onComplete();
      }
    },
    [completeOnboarding, onComplete]
  );

  const handleCompletionDismiss = useCallback(async () => {
    setShowCompletion(false);
    try {
      await completeOnboarding();
    } catch (e) {
      console.error("Failed to complete onboarding:", e);
    }
    onComplete();
  }, [completeOnboarding, onComplete]);

  return (
    <>
      <Joyride
        steps={steps}
        run={run}
        continuous
        showSkipButton
        hideCloseButton
        disableOverlayClose
        disableScrolling={false}
        spotlightClicks={false}
        spotlightPadding={8}
        tooltipComponent={CustomTooltip}
        callback={handleCallback}
        styles={{
          options: {
            zIndex: 10000,
            arrowColor: "var(--card-bg, #fff)",
          },
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          },
          spotlight: {
            borderRadius: "12px",
          },
        }}
        floaterProps={{
          styles: {
            arrow: {
              length: 8,
              spread: 16,
            },
          },
        }}
      />

      {/* Completion celebration modal */}
      <AnimatePresence>
        {showCompletion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="relative w-[400px] max-w-[calc(100vw-32px)] rounded-2xl border border-border-strong bg-card-bg shadow-[0_20px_60px_rgba(0,0,0,0.3)] overflow-hidden"
            >
              {/* Top accent */}
              <div className="h-1.5 w-full bg-gradient-to-r from-[#2a5925] via-[#eca400] to-[#2a5925]" />

              <button
                onClick={handleCompletionDismiss}
                className="absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-full text-text-dim transition-colors hover:bg-row-hover hover:text-text-muted"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="px-6 pt-8 pb-6 text-center">
                {/* Animated party icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 15,
                    delay: 0.2,
                  }}
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#2a5925]/10"
                >
                  <PartyPopper className="h-8 w-8 text-[#2a5925]" />
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-xl font-bold text-text"
                >
                  Well done!
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-2 text-sm text-text-muted leading-relaxed"
                >
                  You&apos;ve completed the onboarding tour. You&apos;re all set
                  to start managing your leads, properties, and team like a pro!
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-6"
                >
                  <button
                    onClick={handleCompletionDismiss}
                    className="rounded-xl bg-[#2a5925] px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1e3f1a] hover:shadow-md"
                  >
                    Get Started
                  </button>
                </motion.div>

                {/* Confetti dots decoration */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  {[...Array(12)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute h-2 w-2 rounded-full"
                      style={{
                        background: ["#2a5925", "#eca400", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"][i % 6],
                        left: `${10 + (i * 7.5)}%`,
                        top: `${15 + ((i * 13) % 60)}%`,
                      }}
                      initial={{ opacity: 0, scale: 0, y: 20 }}
                      animate={{
                        opacity: [0, 1, 0],
                        scale: [0, 1.2, 0],
                        y: [20, -30, -60],
                      }}
                      transition={{
                        duration: 1.5,
                        delay: 0.3 + i * 0.08,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { motion, useMotionValue, animate } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// --- #13: Animated counter that rolls up from 0 ---

function AnimatedCounter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);

  useEffect(() => {
    // Reset to 0 and animate to target
    mv.set(0);
    const controls = animate(mv, value, {
      duration: 1,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [mv, value]);

  useEffect(() => {
    const unsubscribe = mv.on("change", (v) => {
      if (ref.current) {
        ref.current.textContent = Math.round(v).toString();
      }
    });
    return unsubscribe;
  }, [mv]);

  // Show actual value as fallback text in case animation doesn't fire
  return <span ref={ref}>{value}</span>;
}

// --- Skeleton loaders (unchanged) ---

function StatsCardSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-12" />
    </Card>
  );
}

function StageRowSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-8" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

// --- #12: Stagger entrance variants ---

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

const stageContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

const stageItemVariants = {
  hidden: { opacity: 0, x: -10 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

export default function DashboardPage() {
  const dashboardData = useQuery(api.leads.dashboardStats, {});

  const isLoading = dashboardData === undefined;

  const stats = dashboardData
    ? [
        { label: "Total leads", value: dashboardData.stats.totalLeads },
        { label: "Open leads", value: dashboardData.stats.openLeads },
        { label: "Won", value: dashboardData.stats.totalWon },
        { label: "Lost", value: dashboardData.stats.totalLost },
      ]
    : [];

  const stageBreakdown = dashboardData?.stageBreakdown ?? [];
  const monthlyProgress = dashboardData?.monthlyProgress ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Pipeline Overview</h2>
                <Badge className="bg-primary/10 text-primary">All Leads</Badge>
              </div>
              <p className="text-sm text-text-muted">
                Monitor your pipeline performance and conversion velocity.
              </p>
            </div>
            <div className="min-w-[220px]">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Win rate</span>
                {isLoading ? (
                  <Skeleton className="h-3 w-8" />
                ) : (
                  <span>{monthlyProgress}%</span>
                )}
              </div>
              {/* #14: Progress bar with spring fill + shimmer */}
              <div className="mt-2 h-2 rounded-full bg-border overflow-hidden">
                {isLoading ? (
                  <Skeleton className="h-2 w-full rounded-full" />
                ) : (
                  <motion.div
                    className="h-2 rounded-full bg-primary relative overflow-hidden"
                    initial={{ width: 0 }}
                    animate={{ width: `${monthlyProgress}%` }}
                    transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.3 }}
                  >
                    <div className="shimmer-overlay" />
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* #12: KPI cards with stagger entrance + hover lift */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {stats.map((stat) => (
            <motion.div
              key={stat.label}
              variants={cardVariants}
              whileHover={{ scale: 1.02, boxShadow: "0 8px 25px rgba(0,0,0,0.1)" }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Card className="p-4">
                <p className="text-xs uppercase tracking-wide text-text-dim">
                  {stat.label}
                </p>
                {/* #13: Counter number roll-up */}
                <p className="mt-3 text-2xl font-semibold">
                  <AnimatedCounter value={stat.value} />
                </p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Leads by Stage
            </h3>
            {/* #17: Live pulse indicator */}
            <span className="flex items-center gap-1.5 text-xs text-text-dim">
              <motion.span
                className="inline-block h-1.5 w-1.5 rounded-full bg-green-500"
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.6, 1, 0.6],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              Live
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <StageRowSkeleton key={i} />
              ))}
            </div>
          ) : stageBreakdown.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              No leads in pipeline yet
            </p>
          ) : (
            // #16: Stage rows with stagger + animated accent bar
            <motion.div
              variants={stageContainerVariants}
              initial="hidden"
              animate="show"
              className="space-y-4"
            >
              {stageBreakdown.map((stage, index) => (
                <motion.div
                  key={stage.id}
                  variants={stageItemVariants}
                  className="group relative pl-4"
                >
                  {/* #16: Left accent bar — grows from top on mount, widens on hover */}
                  <motion.div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-primary transition-[width,filter] duration-200 group-hover:w-1.5 group-hover:brightness-125"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 25,
                      delay: 0.2 + index * 0.08,
                    }}
                    style={{ transformOrigin: "top" }}
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{stage.name}</span>
                      <span className="text-text-muted">
                        <AnimatedCounter value={stage.count} />
                      </span>
                    </div>
                    {/* #14: Progress bar with spring fill + shimmer */}
                    <div className="h-2 rounded-full bg-border overflow-hidden">
                      <motion.div
                        className="h-2 rounded-full bg-primary relative overflow-hidden"
                        initial={{ width: 0 }}
                        animate={{ width: `${stage.percent * 100}%` }}
                        transition={{
                          type: "spring",
                          stiffness: 80,
                          damping: 20,
                          delay: 0.4 + index * 0.08,
                        }}
                      >
                        <div className="shimmer-overlay" />
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

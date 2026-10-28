import { query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { HubFigure, userCanUseModule } from "../lib/modules";
import { getCurrentUserOptional, getEffectiveOrgId } from "../helpers";
import { requireWorth, worthCapabilities } from "./access";
import { jobsForCaller, userNames } from "./jobs";
import { readSettings, listValuerUsers } from "./settings";
import {
  addDays,
  average,
  dueState,
  formatTotals,
  isOpenStatus,
  localToday,
  sumByCurrency,
  turnaroundDays,
  WorthStatus,
} from "./lib";

function monthOf(ts: number) {
  return localToday(ts).slice(0, 7);
}

function feeTotals(jobs: Doc<"worthJobs">[]) {
  return sumByCurrency(jobs.map((j) => ({ amount: j.fee, currency: j.currency })));
}

/** Issued (or invoiced) and not yet paid. Cancelled jobs owe nothing. */
function isUnpaid(j: Doc<"worthJobs">) {
  return j.status !== "cancelled" && !j.paidAt && (!!j.invoicedAt || !!j.issuedAt);
}

/**
 * Headline figures for the Hub director dashboard. Null when the caller
 * can't open this module, so the Hub can call it unconditionally.
 */
export const hubSummary = query({
  args: {},
  handler: async (ctx): Promise<HubFigure[] | null> => {
    const me = await getCurrentUserOptional(ctx);
    if (!me) return null;
    const orgId = getEffectiveOrgId(me);
    if (!orgId) return null;
    const org = await ctx.db.get(orgId);
    // Platform staff viewing an org see it as its admin (helpers.ts).
    const viewer = me.orgId ? me : { ...me, role: "admin" as const, agentMode: false };
    if (!org || !userCanUseModule(viewer, org, "worth")) return null;
    const caps = worthCapabilities(viewer);

    const jobs = caps.seesAllJobs
      ? await ctx.db.query("worthJobs").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect()
      : await ctx.db
          .query("worthJobs")
          .withIndex("by_org_valuer", (q) => q.eq("orgId", orgId).eq("assignedValuerId", viewer._id))
          .collect();
    const settings = await readSettings(ctx, orgId);
    const today = localToday(Date.now());
    const month = today.slice(0, 7);
    const issuedThisMonth = jobs.filter((j) => j.status === "issued" && j.issuedDate?.startsWith(month));
    const unpaid = jobs.filter(isUnpaid);
    const feeFigures: HubFigure[] = [
      {
        label: "Fees issued this month",
        value: formatTotals(feeTotals(issuedThisMonth)),
        href: "/app/worth/reports",
      },
      {
        label: "Unpaid valuation fees",
        value: formatTotals(feeTotals(unpaid)),
        hint: `${unpaid.length} job${unpaid.length === 1 ? "" : "s"}`,
        tone: unpaid.length > 0 ? "warning" : "default",
        href: "/app/worth/reports",
      },
    ];
    // Accounts-only users see fee figures only.
    if (!caps.seesValues) return feeFigures;

    const open = jobs.filter((j) => isOpenStatus(j.status));
    const overdue = open.filter((j) => dueState(j, today, settings.dueSoonDays) === "overdue");
    const figures: HubFigure[] = [
      { label: "Open valuations", value: String(open.length), href: "/app/worth/jobs" },
      {
        label: "Overdue valuations",
        value: String(overdue.length),
        tone: overdue.length > 0 ? "warning" : "good",
        href: "/app/worth/jobs",
      },
      { label: "Reports issued this month", value: String(issuedThisMonth.length), tone: "good", href: "/app/worth/archive" },
    ];
    if (caps.seesAllJobs || caps.canManageFees) figures.push(feeFigures[1]);
    return figures;
  },
});

/** The Worth dashboard: status counts, due dates, workload, turnaround, fees. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorth(ctx);
    const jobs = await jobsForCaller(ctx, access);
    const settings = await readSettings(ctx, access.orgId);
    const names = await userNames(ctx, access.orgId);
    const now = Date.now();
    const today = localToday(now);
    const month = today.slice(0, 7);
    const weekEnd = addDays(today, 7);

    const byStatus: Partial<Record<WorthStatus, number>> = {};
    for (const j of jobs) if (isOpenStatus(j.status)) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;

    const row = (j: Doc<"worthJobs">) => ({
      _id: j._id,
      reference: j.reference,
      propertyAddress: j.propertyAddress,
      clientName: j.clientName,
      status: j.status,
      dueDate: j.dueDate,
      valuerName: j.assignedValuerId ? names.get(j.assignedValuerId) ?? "Unknown" : null,
      dueFlag: dueState(j, today, settings.dueSoonDays),
    });
    const active = jobs.filter((j) => isOpenStatus(j.status) && j.status !== "on_hold");
    const overdue = active.filter((j) => j.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const dueThisWeek = active
      .filter((j) => j.dueDate >= today && j.dueDate <= weekEnd)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const myJobs = active
      .filter((j) => j.assignedValuerId === access.user._id)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    // Workload per valuer: open jobs and jobs issued this month.
    const valuers = access.caps.seesAllJobs ? await listValuerUsers(ctx, access.orgId) : [];
    const workload = valuers.map((u) => {
      const theirs = jobs.filter((j) => j.assignedValuerId === u._id);
      return {
        userId: u._id as Id<"users">,
        name: names.get(u._id) ?? "Unknown",
        open: theirs.filter((j) => isOpenStatus(j.status)).length,
        issuedThisMonth: theirs.filter((j) => j.status === "issued" && j.issuedDate?.startsWith(month)).length,
      };
    });

    // Average turnaround over the last 90 days of issues.
    const since = addDays(today, -90);
    const turnarounds = jobs
      .filter((j) => j.status === "issued" && (j.issuedDate ?? "") >= since)
      .map((j) => turnaroundDays(j))
      .filter((d): d is number => d !== null);

    const issuedThisMonth = jobs.filter((j) => j.status === "issued" && j.issuedDate?.startsWith(month));
    const invoicedThisMonth = jobs.filter((j) => j.invoicedAt && monthOf(j.invoicedAt) === month);
    const unpaid = jobs.filter(isUnpaid);

    return {
      caps: access.caps,
      byStatus,
      openCount: jobs.filter((j) => isOpenStatus(j.status)).length,
      overdue: overdue.slice(0, 50).map(row),
      dueThisWeek: dueThisWeek.slice(0, 50).map(row),
      myJobs: myJobs.map(row),
      workload,
      averageTurnaroundDays: average(turnarounds),
      turnaroundSample: turnarounds.length,
      fees: {
        issuedThisMonth: feeTotals(issuedThisMonth),
        invoicedThisMonth: feeTotals(invoicedThisMonth),
        unpaid: feeTotals(unpaid),
        unpaidCount: unpaid.length,
      },
    };
  },
});

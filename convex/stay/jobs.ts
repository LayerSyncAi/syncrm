/**
 * The SyncStay daily job (BRD Stay ST-13, ST-16, ST-20, ST-32).
 *
 * Once a day, for every agency with Stay switched on:
 *  1. leases: apply planned rent increases, raise the month's rent charge
 *     `invoiceLeadDays` before its due date (idempotent through
 *     by_lease_period), and alert the manager 60 and 30 days before expiry;
 *  2. open charges: email the rent invoice and the overdue reminders.
 * Work is split into small scheduled batches so no single transaction grows
 * with the size of the agency. Every step is safe to run twice.
 */
import { v } from "convex/values";
import { internalMutation, MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { orgModules } from "../lib/modules";
import { notifyUsers, orgAdminIds } from "../lib/notify";
import { recordAudit } from "../logs";
import {
  daysBetween,
  dateLabel,
  expiryAlertToSend,
  formatAmount,
  outstanding,
  periodLabel,
  reminderToSend,
  rentChargesDue,
  todayIn,
} from "./ledger";
import { agencyOf, chainAccount, getSettings, leaseChain, leaseLabels, userLabel } from "./shared";
import { insertCharge } from "./money";
import { expiryEmail, invoiceEmail, queueEmail, reminderEmail } from "./emails";

const LEASE_BATCH = 100;
const CHARGE_BATCH = 200;

function appUrl(path: string): string {
  const base = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

/** Cron entry point: fan out one batch chain per agency. */
export const runDaily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    for (const org of orgs) {
      if (org.deletingAt || !orgModules(org).includes("stay")) continue;
      await ctx.scheduler.runAfter(0, internal.stay.jobs.runLeases, { orgId: org._id, cursor: null });
    }
  },
});

/** Run the job for one agency now (support and testing). */
export const runForOrg = internalMutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.stay.jobs.runLeases, { orgId: args.orgId, cursor: null });
  },
});

async function systemAudit(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  a: { action: string; description: string; targetType: string; targetId: string; metadata?: Record<string, unknown> }
) {
  await recordAudit(ctx, { ...a, category: "stay", actorLabel: "SyncStay daily job", orgId });
}

export const runLeases = internalMutation({
  args: { orgId: v.id("organizations"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org || org.deletingAt) return;
    const settings = await getSettings(ctx, args.orgId);
    const today = todayIn(settings.timezone);
    const page = await ctx.db
      .query("stayLeases")
      .withIndex("by_org_status", (q) => q.eq("orgId", args.orgId).eq("status", "active"))
      .paginate({ numItems: LEASE_BATCH, cursor: args.cursor });

    const label = await leaseLabels(ctx, page.page);
    for (const original of page.page) {
      let lease = original;

      // ST-16: planned rent increase reaches its date.
      const inc = lease.rentIncrease;
      if (inc && !inc.appliedAt && inc.effectiveDate <= today) {
        await ctx.db.patch(lease._id, {
          rentAmount: inc.newRent,
          rentIncrease: { ...inc, appliedAt: Date.now() },
          updatedAt: Date.now(),
        });
        await systemAudit(ctx, args.orgId, {
          action: "stay.lease_rent_increase_applied",
          description: `Rent changed from ${formatAmount(lease.rentAmount, lease.currency)} to ${formatAmount(inc.newRent, lease.currency)} on ${inc.effectiveDate}`,
          targetType: "stayLease",
          targetId: lease._id,
        });
        lease = (await ctx.db.get(lease._id))!;
      }

      // ST-20: rent charges, raised in time for the invoice.
      // A renewal carries on from its predecessor, so it charges from its start.
      const enteredOn = lease.renewedFromLeaseId ? undefined : todayIn(settings.timezone, lease.createdAt);
      for (const due of rentChargesDue(lease, today, settings.invoiceLeadDays, enteredOn)) {
        if (await hasChargeForPeriod(ctx, lease, due.period)) continue;
        await insertCharge(ctx, lease, {
          kind: "rent",
          description: `Rent ${periodLabel(due.period)}`,
          amount: due.amount,
          dueDate: due.dueDate,
          period: due.period,
        });
        lease = (await ctx.db.get(lease._id))!;
      }

      // ST-13: expiry alerts to the manager.
      const alert = expiryAlertToSend(daysBetween(today, lease.endDate), settings.expiryAlertDays, lease.expiryAlertsSent ?? []);
      if (alert.send !== null && !lease.noticeGivenOn) {
        const lab = label(lease);
        const daysLeft = daysBetween(today, lease.endDate);
        const recipients = lease.managerUserId ? [lease.managerUserId] : await orgAdminIds(ctx, args.orgId);
        const title = `Lease ends in ${daysLeft} days: ${lab.tenantName}`;
        await notifyUsers(ctx, recipients, {
          orgId: args.orgId,
          module: "stay",
          kind: "stay_lease_expiry",
          title,
          body: `${lab.propertyName}, ${lab.unitLabel} ends on ${dateLabel(lease.endDate)}.`,
          href: `/app/stay/leases/${lease._id}`,
        });
        for (const uid of recipients) {
          const u = await ctx.db.get(uid);
          if (!u?.email) continue;
          await queueEmail(
            ctx,
            args.orgId,
            expiryEmail({
              agency: agencyOf(org),
              to: u.email,
              managerName: userLabel(u),
              tenantName: lab.tenantName,
              property: `${lab.propertyName}, ${lab.unitLabel}`,
              endDate: dateLabel(lease.endDate),
              daysLeft,
              link: appUrl(`/app/stay/leases/${lease._id}`),
              leaseId: lease._id,
            })
          );
        }
        await ctx.db.patch(lease._id, {
          expiryAlertsSent: [...new Set([...(lease.expiryAlertsSent ?? []), ...alert.markSent])],
        });
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.stay.jobs.runLeases, { orgId: args.orgId, cursor: page.continueCursor });
    } else {
      await ctx.scheduler.runAfter(0, internal.stay.jobs.runCharges, { orgId: args.orgId, status: "unpaid", cursor: null });
    }
  },
});

/** A renewal must not re-raise a period its predecessor already charged. */
async function hasChargeForPeriod(ctx: MutationCtx, lease: Doc<"stayLeases">, period: string): Promise<boolean> {
  const ids = [lease._id, ...(lease.renewedFromLeaseId ? [lease.renewedFromLeaseId] : [])];
  for (const id of ids) {
    const existing = await ctx.db
      .query("stayCharges")
      .withIndex("by_lease_period", (q) => q.eq("leaseId", id).eq("period", period))
      .first();
    if (existing) return true;
  }
  return false;
}

export const runCharges = internalMutation({
  args: {
    orgId: v.id("organizations"),
    status: v.union(v.literal("unpaid"), v.literal("part_paid")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org || org.deletingAt) return;
    const settings = await getSettings(ctx, args.orgId);
    const today = todayIn(settings.timezone);
    const agency = agencyOf(org);
    const page = await ctx.db
      .query("stayCharges")
      .withIndex("by_org_status", (q) => q.eq("orgId", args.orgId).eq("status", args.status))
      .paginate({ numItems: CHARGE_BATCH, cursor: args.cursor });

    const leaseDocs = new Map<string, Doc<"stayLeases">>();
    for (const id of new Set(page.page.map((c) => c.leaseId))) {
      const l = await ctx.db.get(id);
      if (l) leaseDocs.set(id, l);
    }
    const label = await leaseLabels(ctx, [...leaseDocs.values()]);
    const accounts = new Map<string, Awaited<ReturnType<typeof chainAccount>>>();
    const accountOf = async (l: Doc<"stayLeases">) => {
      let acc = accounts.get(l._id);
      if (!acc) {
        acc = await chainAccount(ctx, await leaseChain(ctx, l), today);
        accounts.set(l._id, acc);
      }
      return acc;
    };

    // Reminders go out once per lease per run, for the oldest charge due one.
    const remind = new Map<string, number>();
    for (const c of page.page) {
      const lease = leaseDocs.get(c.leaseId);
      if (!lease) continue;
      const lab = label(lease);

      if (c.kind === "rent" && !c.invoiceEmailedAt && daysBetween(today, c.dueDate) <= settings.invoiceLeadDays) {
        // Ended leases get no new invoices; the charge was raised before move-out.
        if (lease.status !== "ended" && lab.tenantEmail) {
          const acc = await accountOf(lease);
          await queueEmail(
            ctx,
            args.orgId,
            invoiceEmail({
              agency,
              to: lab.tenantEmail,
              tenantName: lab.tenantName,
              period: c.period ? periodLabel(c.period, true) : c.description,
              dueDate: dateLabel(c.dueDate),
              amount: formatAmount(outstanding(c), c.currency),
              property: `${lab.propertyName}, ${lab.unitLabel}`,
              balance: formatAmount(acc.balance, c.currency),
              chargeId: c._id,
            })
          );
        }
        await ctx.db.patch(c._id, { invoiceEmailedAt: Date.now() });
      }

      const days = daysBetween(c.dueDate, today);
      if (days < 0) continue;
      const r = reminderToSend(days, settings.reminderDays, c.remindersSent ?? []);
      if (r.send === null) continue;
      await ctx.db.patch(c._id, { remindersSent: [...new Set([...(c.remindersSent ?? []), ...r.markSent])] });
      remind.set(lease._id, Math.max(remind.get(lease._id) ?? 0, days));
    }

    for (const [leaseId, days] of remind) {
      const lease = leaseDocs.get(leaseId)!;
      const lab = label(lease);
      if (!lab.tenantEmail) continue;
      const acc = await accountOf(lease);
      if (acc.overdue <= 0) continue;
      await queueEmail(
        ctx,
        args.orgId,
        reminderEmail({
          agency,
          to: lab.tenantEmail,
          tenantName: lab.tenantName,
          overdue: formatAmount(acc.overdue, acc.currency),
          daysOverdue: days,
          property: `${lab.propertyName}, ${lab.unitLabel}`,
          leaseId,
        })
      );
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.stay.jobs.runCharges, { orgId: args.orgId, status: args.status, cursor: page.continueCursor });
    } else if (args.status === "unpaid") {
      await ctx.scheduler.runAfter(0, internal.stay.jobs.runCharges, { orgId: args.orgId, status: "part_paid", cursor: null });
    }
  },
});

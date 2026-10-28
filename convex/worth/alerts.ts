/**
 * VW-12: the daily job that flags valuations due within the agency's
 * due-soon window or past their due date, and reminds the assigned valuer
 * once per state (Hub notification and email). An unassigned job alerts the
 * org's directors instead.
 */
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { notifyUsers, orgAdminIds } from "../lib/notify";
import { addDays, dueState, localToday } from "./lib";
import { jobHref } from "./jobs";
import { readSettings } from "./settings";

const ACTIVE = ["new", "assigned", "inspected", "draft", "in_review"] as const;

export const flagDueJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = localToday(Date.now());
    // Wide enough for any org's due-soon setting (capped at 30 days).
    const horizon = addDays(today, 30);
    const soonDays = new Map<Id<"organizations">, number>();
    let flagged = 0;
    for (const status of ACTIVE) {
      const jobs = await ctx.db
        .query("worthJobs")
        .withIndex("by_status_due", (q) => q.eq("status", status).lte("dueDate", horizon))
        .take(2000);
      for (const job of jobs) {
        if (!soonDays.has(job.orgId)) soonDays.set(job.orgId, (await readSettings(ctx, job.orgId)).dueSoonDays);
        const state = dueState(job, today, soonDays.get(job.orgId)!);
        if (!state || state === job.dueAlert) continue;
        // Never step back from overdue to due soon for the same due date.
        if (job.dueAlert === "overdue") continue;
        await ctx.db.patch(job._id, { dueAlert: state });
        flagged++;
        const recipients = job.assignedValuerId ? [job.assignedValuerId] : await orgAdminIds(ctx, job.orgId);
        const title = state === "overdue" ? `${job.reference} is overdue` : `${job.reference} is due ${job.dueDate}`;
        await notifyUsers(ctx, recipients, {
          orgId: job.orgId,
          module: "worth",
          kind: state === "overdue" ? "worth.overdue" : "worth.due_soon",
          title,
          body: job.propertyAddress,
          href: jobHref(job._id),
        });
        for (const userId of recipients) {
          const u = await ctx.db.get(userId);
          if (!u?.email || !u.isActive) continue;
          await ctx.scheduler.runAfter(0, internal.worth.emails.sendDueAlert, {
            to: u.email,
            userId,
            orgId: job.orgId,
            jobId: job._id,
            reference: job.reference,
            propertyAddress: job.propertyAddress,
            dueDate: job.dueDate,
            state,
          });
        }
      }
    }
    return { flagged };
  },
});

/**
 * SyncWorth archive and management reports (BRD §6). The server returns
 * rows the caller may see; the app groups them (src/lib/worth/reporting.ts)
 * and exports to PDF and Excel.
 */
import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";
import { requireCap, requireWorth } from "./access";
import { jobsForCaller, userNames } from "./jobs";
import { isIsoDate, localToday, normaliseSuburb, stageDurations, turnaroundDays, daysBetween } from "./lib";
import { worthPurpose } from "../schemas/worth";

/** Searchable archive of issued valuations (and those reopened for correction). */
export const archive = query({
  args: {
    q: v.optional(v.string()),
    suburb: v.optional(v.string()),
    purpose: v.optional(worthPurpose),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "seesEvidence", "The archive is open to the valuation team only");
    const issued = await ctx.db
      .query("worthJobs")
      .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", "issued"))
      .collect();
    const q = args.q?.trim().toLowerCase();
    const suburb = args.suburb ? normaliseSuburb(args.suburb) : "";
    const names = await userNames(ctx, access.orgId);
    const rows = issued.filter((j) => {
      if (q && ![j.reference, j.clientName, j.propertyAddress, j.suburb].some((s) => s.toLowerCase().includes(q))) {
        return false;
      }
      if (suburb && !normaliseSuburb(j.suburb).includes(suburb)) return false;
      if (args.purpose && j.purpose !== args.purpose) return false;
      if (args.from && (j.issuedDate ?? "") < args.from) return false;
      if (args.to && (j.issuedDate ?? "") > args.to) return false;
      return true;
    });
    rows.sort((a, b) => (b.issuedDate ?? "").localeCompare(a.issuedDate ?? ""));
    return rows.slice(0, 500).map((j) => ({
      _id: j._id,
      reference: j.reference,
      propertyAddress: j.propertyAddress,
      suburb: j.suburb,
      clientName: j.clientName,
      purpose: j.purpose,
      propertyClass: j.propertyClass,
      issuedDate: j.issuedDate ?? "",
      version: j.version,
      values: j.values,
      signedBy: j.signedByUserId ? names.get(j.signedByUserId) ?? "Unknown" : "",
    }));
  },
});

/**
 * Instruction register for jobs received in [from, to], with turnaround and
 * time at each stage, plus every unpaid fee regardless of date.
 */
export const register = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    if (!isIsoDate(args.from) || !isIsoDate(args.to)) throw new ConvexError("Choose a valid date range");
    const jobs = await jobsForCaller(ctx, access);
    const names = await userNames(ctx, access.orgId);
    const now = Date.now();
    const today = localToday(now);
    const inRange = jobs
      .filter((j) => j.receivedDate >= args.from && j.receivedDate <= args.to)
      .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));
    const register = inRange.map((j) => ({
      _id: j._id,
      reference: j.reference,
      receivedDate: j.receivedDate,
      dueDate: j.dueDate,
      issuedDate: j.issuedDate ?? "",
      clientName: j.clientName,
      partyType: j.partyType,
      purpose: j.purpose,
      propertyAddress: j.propertyAddress,
      suburb: j.suburb,
      valuerName: j.assignedValuerId ? names.get(j.assignedValuerId) ?? "Unknown" : "",
      status: j.status,
      fee: j.fee,
      currency: j.currency,
      invoiced: !!j.invoicedAt,
      paid: !!j.paidAt,
      turnaroundDays: turnaroundDays(j),
      stageMs: stageDurations(j.statusLog, now),
    }));
    const unpaid = jobs
      .filter((j) => j.status !== "cancelled" && !j.paidAt && (j.invoicedAt || j.issuedAt))
      .map((j) => ({
        _id: j._id,
        reference: j.reference,
        clientName: j.clientName,
        issuedDate: j.issuedDate ?? "",
        fee: j.fee,
        currency: j.currency,
        ageDays: j.issuedDate ? Math.max(0, daysBetween(j.issuedDate, today)) : 0,
      }))
      .sort((a, b) => b.ageDays - a.ageDays);
    return { register, unpaid, seesAllJobs: access.caps.seesAllJobs };
  },
});

/** Evidence report: comparables and past values in a suburb over a period. */
export const evidence = query({
  args: { suburb: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const access = await requireWorth(ctx);
    requireCap(access, "seesEvidence", "Evidence is open to the valuation team only");
    if (!isIsoDate(args.from) || !isIsoDate(args.to)) throw new ConvexError("Choose a valid date range");
    const suburb = normaliseSuburb(args.suburb);
    const rows = await ctx.db
      .query("worthComparables")
      .withIndex("by_org_date", (q) => q.eq("orgId", access.orgId).gte("date", args.from).lte("date", args.to))
      .order("desc")
      .take(5000);
    return rows
      .filter((c) => !suburb || c.suburbKey.includes(suburb))
      .slice(0, 1000)
      .map((c) => ({
        _id: c._id,
        date: c.date,
        kind: c.kind,
        source: c.source,
        address: c.address,
        suburb: c.suburb,
        propertyType: c.propertyType,
        landSizeM2: c.landSizeM2,
        buildingSizeM2: c.buildingSizeM2,
        price: c.price,
        rent: c.rent,
        currency: c.currency,
      }));
  },
});

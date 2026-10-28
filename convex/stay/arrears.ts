/**
 * Arrears (BRD Stay ST-30 to ST-33): every tenant owing money, aged by days
 * overdue, filterable by manager, property and landlord, with notes.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getVisibleLease, requireStay } from "./access";
import {
  AGE_BUCKETS,
  AgeBucket,
  addTo,
  ageBucket,
  CurrencyTotals,
  daysBetween,
  isOverdue,
  isValidDate,
  outstanding,
  round2,
  StayCurrency,
} from "./ledger";
import { canSeeLease, leaseLabels, stayAudit, todayForOrg } from "./shared";

export const list = query({
  args: {
    managerUserId: v.optional(v.id("users")),
    stayPropertyId: v.optional(v.id("stayProperties")),
    landlordContactId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const today = await todayForOrg(ctx, access.orgId);
    const open = (
      await Promise.all(
        (["unpaid", "part_paid"] as const).map((status) =>
          ctx.db
            .query("stayCharges")
            .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", status))
            .collect()
        )
      )
    )
      .flat()
      .filter((c) => isOverdue(c, today));

    const leaseDocs = await Promise.all([...new Set(open.map((c) => c.leaseId))].map((id) => ctx.db.get(id)));
    const leaseMap = new Map(
      leaseDocs
        .filter((l): l is Doc<"stayLeases"> => !!l && canSeeLease(access, l))
        .filter((l) => !args.managerUserId || l.managerUserId === args.managerUserId)
        .filter((l) => !args.stayPropertyId || l.stayPropertyId === args.stayPropertyId)
        .filter((l) => !args.landlordContactId || l.landlordContactId === args.landlordContactId)
        .map((l) => [l._id as string, l])
    );

    // One row per tenancy: a renewal chain shows under its current lease.
    const headOf = async (l: Doc<"stayLeases">) => {
      let head = l;
      for (let i = 0; i < 50 && head.renewedToLeaseId; i++) {
        const next = await ctx.db.get(head.renewedToLeaseId);
        if (!next) break;
        head = next;
      }
      return head;
    };
    type Row = {
      leaseId: Id<"stayLeases">;
      lease: Doc<"stayLeases">;
      currency: StayCurrency;
      total: number;
      buckets: Record<AgeBucket, number>;
      oldestDue: string;
      daysOverdue: number;
    };
    const rows = new Map<string, Row>();
    for (const c of open) {
      const l = leaseMap.get(c.leaseId);
      if (!l) continue;
      const head = await headOf(l);
      const owe = outstanding(c);
      const days = daysBetween(c.dueDate, today);
      let row = rows.get(head._id);
      if (!row) {
        row = {
          leaseId: head._id,
          lease: head,
          currency: c.currency,
          total: 0,
          buckets: { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 },
          oldestDue: c.dueDate,
          daysOverdue: days,
        };
        rows.set(head._id, row);
      }
      row.total = round2(row.total + owe);
      const b = ageBucket(days);
      row.buckets[b] = round2(row.buckets[b] + owe);
      if (c.dueDate < row.oldestDue) {
        row.oldestDue = c.dueDate;
        row.daysOverdue = days;
      }
    }

    const heads = [...rows.values()].map((r) => r.lease);
    const label = await leaseLabels(ctx, heads);
    const lastNotes = await Promise.all(
      heads.map((l) =>
        ctx.db
          .query("stayArrearsNotes")
          .withIndex("by_lease", (q) => q.eq("leaseId", l._id))
          .order("desc")
          .first()
      )
    );

    const totals: CurrencyTotals = {};
    const bucketTotals: Record<AgeBucket, CurrencyTotals> = { "0_30": {}, "31_60": {}, "61_90": {}, "90_plus": {} };
    const out = [...rows.values()].map((r, i) => {
      addTo(totals, r.currency, r.total);
      for (const b of AGE_BUCKETS) if (r.buckets[b]) addTo(bucketTotals[b], r.currency, r.buckets[b]);
      const lab = label(r.lease);
      const note = lastNotes[i];
      return {
        leaseId: r.leaseId,
        tenantContactId: r.lease.tenantContactId,
        leaseStatus: r.lease.status,
        ...lab,
        currency: r.currency,
        total: r.total,
        credit: r.lease.creditBalance ?? 0,
        buckets: r.buckets,
        oldestDue: r.oldestDue,
        daysOverdue: r.daysOverdue,
        bucket: ageBucket(r.daysOverdue),
        lastNote: note
          ? { note: note.note, promiseDate: note.promiseDate ?? null, promiseAmount: note.promiseAmount ?? null, createdAt: note.createdAt }
          : null,
      };
    });
    out.sort((a, b) => b.daysOverdue - a.daysOverdue || b.total - a.total);
    return { rows: out, totals, bucketTotals, today };
  },
});

/** ST-33: log a call or a promise to pay against a tenant's arrears. */
export const addNote = mutation({
  args: {
    leaseId: v.id("stayLeases"),
    note: v.string(),
    promiseDate: v.optional(v.string()),
    promiseAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const lease = await getVisibleLease(ctx, access, args.leaseId);
    const note = args.note.trim();
    if (!note) throw new ConvexError("Write a note");
    if (args.promiseDate && !isValidDate(args.promiseDate)) throw new ConvexError("Enter a valid promise date");
    if (args.promiseAmount !== undefined && !(args.promiseAmount > 0)) throw new ConvexError("Promised amount must be more than zero");
    const id = await ctx.db.insert("stayArrearsNotes", {
      orgId: access.orgId,
      leaseId: lease._id,
      note,
      promiseDate: args.promiseDate || undefined,
      promiseAmount: args.promiseAmount,
      createdByUserId: access.user._id,
      createdAt: Date.now(),
    });
    await stayAudit(ctx, access, {
      action: "stay.arrears_note",
      description: `Arrears note: ${note.slice(0, 80)}`,
      targetType: "stayLease",
      targetId: lease._id,
    });
    return id;
  },
});

/**
 * Landlord statement when SyncFinance is not switched on (BRD Stay §8):
 * rent collected in the month (by payment date), less the management fee per
 * property, less expenses recharged to the landlord, per currency.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { requireStay, StayAccess } from "./access";
import {
  dateLabel,
  formatAmount,
  isValidPeriod,
  landlordTotals,
  periodLabel,
  periodRange,
  round2,
  StayCurrency,
} from "./ledger";
import { agencyOf, leaseLabels, nameMaps, stayAudit, visibleStayProperties } from "./shared";
import { queueEmail, statementEmail } from "./emails";

async function buildStatement(ctx: QueryCtx | MutationCtx, access: StayAccess, landlordId: Id<"contacts">, month: string) {
  const sps = (await visibleStayProperties(ctx, access)).filter((sp) => sp.landlordContactId === landlordId);
  return statementForProperties(ctx, access.orgId, landlordId, sps, month);
}

/**
 * The statement for a landlord over the given properties. The caller decides
 * which properties are in scope: staff see those they manage, the landlord
 * portal passes the landlord's own.
 */
export async function statementForProperties(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  landlordId: Id<"contacts">,
  sps: Doc<"stayProperties">[],
  month: string
) {
  if (!isValidPeriod(month)) throw new ConvexError("Pick a month");
  const { from, to } = periodRange(month);
  const landlord = await ctx.db.get(landlordId);
  if (!landlord || landlord.orgId !== orgId) return null;
  const names = await nameMaps(ctx, { properties: sps.map((sp) => sp.propertyId) });

  const payments: Doc<"stayPayments">[] = [];
  const expenses: Doc<"stayExpenses">[] = [];
  const depositApplied: Array<{ stayPropertyId: Id<"stayProperties">; leaseId: Id<"stayLeases">; currency: StayCurrency; amount: number; date: string }> = [];
  for (const sp of sps) {
    const leases = await ctx.db.query("stayLeases").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect();
    for (const l of leases) {
      const ps = await ctx.db.query("stayPayments").withIndex("by_lease", (q) => q.eq("leaseId", l._id)).collect();
      payments.push(...ps.filter((p) => p.purpose === "rent" && !p.reversedAt && p.paidOn >= from && p.paidOn <= to));
      const dep = await ctx.db.query("stayDeposits").withIndex("by_lease", (q) => q.eq("leaseId", l._id)).first();
      // A deposit the landlord already holds is not money passing through us.
      if (dep && dep.heldIn !== "landlord") {
        for (const m of dep.movements) {
          if (m.kind === "applied" && m.date >= from && m.date <= to) {
            depositApplied.push({ stayPropertyId: sp._id, leaseId: l._id, currency: dep.currency, amount: m.amount, date: m.date });
          }
        }
      }
    }
    const es = await ctx.db.query("stayExpenses").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect();
    expenses.push(...es.filter((e) => e.rechargeToLandlord && e.date >= from && e.date <= to));
  }

  const leaseDocs = (await Promise.all([...new Set([...payments.map((p) => p.leaseId), ...depositApplied.map((d) => d.leaseId)])].map((id) => ctx.db.get(id)))).filter(
    (l): l is Doc<"stayLeases"> => !!l
  );
  const label = await leaseLabels(ctx, leaseDocs);
  const leaseMap = new Map(leaseDocs.map((l) => [l._id as string, l]));
  const feePct: Record<string, number> = Object.fromEntries(sps.map((sp) => [sp._id, sp.managementFeePct]));
  const totals = landlordTotals(
    payments.map((p) => ({ stayPropertyId: p.stayPropertyId, currency: p.currency, amount: p.amount })),
    depositApplied.map((d) => ({ stayPropertyId: d.stayPropertyId, currency: d.currency, amount: d.amount })),
    expenses.map((e) => ({ stayPropertyId: e.stayPropertyId, currency: e.currency, amount: e.amount })),
    feePct
  );

  const sections = totals.map((t) => ({
    ...t,
    collections: payments
      .filter((p) => p.currency === t.currency)
      .sort((a, b) => (a.paidOn < b.paidOn ? -1 : 1))
      .map((p) => {
        const lab = label(leaseMap.get(p.leaseId)!);
        const pct = feePct[p.stayPropertyId] ?? 0;
        return {
          date: p.paidOn,
          receiptNumber: p.receiptNumber,
          propertyName: lab.propertyName,
          unitLabel: lab.unitLabel,
          tenantName: lab.tenantName,
          amount: p.amount,
          feePct: pct,
          fee: round2((p.amount * pct) / 100),
        };
      }),
    depositLines: depositApplied
      .filter((d) => d.currency === t.currency)
      .map((d) => {
        const lab = label(leaseMap.get(d.leaseId)!);
        return { date: d.date, propertyName: lab.propertyName, unitLabel: lab.unitLabel, tenantName: lab.tenantName, amount: d.amount };
      }),
    expenseLines: expenses
      .filter((e) => e.currency === t.currency)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((e) => ({
        date: e.date,
        propertyName: names.property(sps.find((sp) => sp._id === e.stayPropertyId)?.propertyId)?.title ?? "Property",
        description: e.description,
        supplier: e.supplier ?? "",
        amount: e.amount,
      })),
  }));

  return {
    landlord: {
      _id: landlord._id,
      name: landlord.name,
      email: landlord.email ?? "",
      phone: landlord.phone ?? "",
      bankDetails: landlord.bankDetails ?? {},
    },
    month,
    monthLabel: periodLabel(month, true),
    from,
    to,
    properties: sps.map((sp) => ({ name: names.property(sp.propertyId)?.title ?? "Property", feePct: sp.managementFeePct })),
    sections,
  };
}

export const get = query({
  args: { landlordContactId: v.id("contacts"), month: v.string() },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const st = await buildStatement(ctx, access, args.landlordContactId, args.month);
    if (!st || !st.properties.length) return null;
    const org = (await ctx.db.get(access.orgId))!;
    return { ...st, agency: { ...agencyOf(org), vatNumber: org.vatNumber ?? "" } };
  },
});

/** Every landlord with a property the caller sees, with the month's net. */
export const overview = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const sps = await visibleStayProperties(ctx, access);
    const ids = [...new Set(sps.map((sp) => sp.landlordContactId))];
    const out = [];
    for (const id of ids) {
      const st = await buildStatement(ctx, access, id, args.month);
      if (!st) continue;
      out.push({
        landlordContactId: id,
        name: st.landlord.name,
        email: st.landlord.email,
        propertyCount: st.properties.length,
        totals: st.sections.map((s) => ({ currency: s.currency, collected: s.collected, fee: s.fee, expenses: s.expenses, net: s.net })),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

async function emailOne(ctx: MutationCtx, access: StayAccess, landlordId: Id<"contacts">, month: string): Promise<boolean> {
  const st = await buildStatement(ctx, access, landlordId, month);
  if (!st || !st.properties.length || !st.landlord.email) return false;
  const org = (await ctx.db.get(access.orgId))!;
  const sent = await queueEmail(
    ctx,
    access.orgId,
    statementEmail({
      agency: agencyOf(org),
      to: st.landlord.email,
      landlordName: st.landlord.name,
      month: st.monthLabel,
      landlordId: st.landlord._id,
      sections: st.sections.map((s) => ({
        currency: s.currency,
        lines: [
          ...s.collections.map((c) => [`${c.propertyName} ${c.unitLabel}, ${c.tenantName} (${dateLabel(c.date)})`, c.receiptNumber, formatAmount(c.amount, s.currency)]),
          ...s.depositLines.map((d) => [`${d.propertyName} ${d.unitLabel}, ${d.tenantName}: deposit applied`, "", formatAmount(d.amount, s.currency)]),
          ...s.expenseLines.map((e) => [`${e.propertyName}: ${e.description}`, "Expense", `-${formatAmount(e.amount, s.currency)}`]),
        ],
        totals: [
          ["Rent collected", formatAmount(s.collected, s.currency)],
          ...(s.depositApplied ? ([["Deposit applied", formatAmount(s.depositApplied, s.currency)]] as Array<[string, string]>) : []),
          ["Management fee", `-${formatAmount(s.fee, s.currency)}`],
          ["Expenses", `-${formatAmount(s.expenses, s.currency)}`],
          ["Net due to you", formatAmount(s.net, s.currency)],
        ],
      })),
    }),
    access.user._id
  );
  if (sent) {
    await stayAudit(ctx, access, {
      action: "stay.statement_email",
      description: `Emailed ${st.monthLabel} statement to ${st.landlord.name}`,
      targetType: "contact",
      targetId: st.landlord._id,
      targetLabel: st.landlord.name,
      metadata: { month, totals: st.sections.map((s) => ({ currency: s.currency, net: s.net })) },
    });
  }
  return sent;
}

export const email = mutation({
  args: { landlordContactId: v.id("contacts"), month: v.string() },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const sent = await emailOne(ctx, access, args.landlordContactId, args.month);
    if (!sent) throw new ConvexError("This landlord has no email address or no properties you manage");
  },
});

/** "Send every landlord their statement in one click" (BRD §1). */
export const emailAll = mutation({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const sps = await visibleStayProperties(ctx, access);
    const ids = [...new Set(sps.map((sp) => sp.landlordContactId))];
    let sent = 0;
    let skipped = 0;
    for (const id of ids) {
      if (await emailOne(ctx, access, id, args.month)) sent++;
      else skipped++;
    }
    return { sent, skipped };
  },
});

/**
 * Sync Dev dashboard and Hub figures: stands available, reserved and sold,
 * and what buyers have paid and still owe, per currency.
 */
import { query } from "../_generated/server";
import { getCurrentUserOptional, getEffectiveOrgId } from "../helpers";
import { HubFigure, userCanUseModule } from "../lib/modules";
import { formatTotals } from "../stay/ledger";
import { todayForOrg } from "../stay/shared";
import { round2 } from "../finance/lib";
import { requireSales } from "./access";
import { effectiveStatus } from "./lib";

type Totals = Partial<Record<"USD" | "ZiG", number>>;
const add = (t: Totals, c: "USD" | "ZiG", n: number) => {
  t[c] = round2((t[c] ?? 0) + n);
};

export const summary = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireSales(ctx);
    const today = await todayForOrg(ctx, access.orgId);
    const [devs, stands, sales] = await Promise.all([
      ctx.db.query("finDevelopments").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect(),
      ctx.db.query("devStands").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect(),
      ctx.db.query("finStands").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect(),
    ]);
    const counts = { available: 0, reserved: 0, sold: 0 };
    for (const s of stands) counts[effectiveStatus(s, today)]++;
    const contracted: Totals = {};
    const collected: Totals = {};
    const outstanding: Totals = {};
    const overdue: Totals = {};
    let overdueBuyers = 0;
    for (const s of sales) {
      if (s.status === "cancelled") continue;
      add(contracted, s.currency, s.price);
      add(collected, s.currency, s.paidToDate);
      add(outstanding, s.currency, s.balance);
      if (s.overdue > 0) {
        add(overdue, s.currency, s.overdue);
        overdueBuyers++;
      }
    }
    return {
      developments: devs.filter((d) => d.isActive).length,
      stands: stands.length,
      ...counts,
      contracted: formatTotals(contracted),
      collected: formatTotals(collected),
      outstanding: formatTotals(outstanding),
      overdue: formatTotals(overdue),
      overdueBuyers,
      role: { canManage: access.canManage, financeOn: access.financeOn, devOn: access.devOn },
      today,
    };
  },
});

/** Headline figures for the Hub. Null when Sync Dev is not open to the caller. */
export const hubSummary = query({
  args: {},
  handler: async (ctx): Promise<HubFigure[] | null> => {
    const me = await getCurrentUserOptional(ctx);
    if (!me) return null;
    const orgId = getEffectiveOrgId(me);
    if (!orgId) return null;
    const org = await ctx.db.get(orgId);
    const viewer = me.orgId ? me : { ...me, role: "admin" as const };
    if (!org || !userCanUseModule(viewer, org, "dev")) return null;
    const today = await todayForOrg(ctx, orgId);
    const [stands, sales] = await Promise.all([
      ctx.db.query("devStands").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
      ctx.db.query("finStands").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
    ]);
    const available = stands.filter((s) => effectiveStatus(s, today) === "available").length;
    const outstanding: Totals = {};
    const overdue: Totals = {};
    for (const s of sales) {
      if (s.status === "cancelled") continue;
      add(outstanding, s.currency, s.balance);
      if (s.overdue > 0) add(overdue, s.currency, s.overdue);
    }
    return [
      { label: "Stands available", value: String(available), href: "/app/dev" },
      { label: "Owed by buyers", value: formatTotals(outstanding), href: "/app/dev/buyers" },
      { label: "Overdue", value: formatTotals(overdue), tone: Object.keys(overdue).length ? "warning" : "good", href: "/app/dev/buyers" },
    ];
  },
});

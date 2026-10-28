import { query, QueryCtx } from "../_generated/server";
import { HubFigure, userCanUseModule } from "../lib/modules";
import { getCurrentUserOptional, getEffectiveOrgId } from "../helpers";
import { requireStay, StayAccess } from "./access";
import {
  addDays,
  addTo,
  CurrencyTotals,
  formatTotals,
  isOverdue,
  outstanding,
  periodOf,
  periodRange,
} from "./ledger";
import { leaseLabels, todayForOrg, visibleLeases, visibleStayProperties } from "./shared";

/** The figures on the Stay dashboard, scoped to what the caller may see. */
async function figures(ctx: QueryCtx, access: StayAccess) {
  const today = await todayForOrg(ctx, access.orgId);
  const { from, to } = periodRange(periodOf(today));
  const leases = await visibleLeases(ctx, access);
  const leaseIds = new Set(leases.map((l) => l._id as string));
  const sees = (leaseId: string) => access.seesAll || leaseIds.has(leaseId);

  const rentDue: CurrencyTotals = {};
  const monthCharges = await ctx.db
    .query("stayCharges")
    .withIndex("by_org_due", (q) => q.eq("orgId", access.orgId).gte("dueDate", from).lte("dueDate", to))
    .collect();
  for (const c of monthCharges) {
    if (c.kind === "rent" && c.status !== "cancelled" && sees(c.leaseId)) addTo(rentDue, c.currency, c.amount);
  }

  const collected: CurrencyTotals = {};
  const payments = await ctx.db
    .query("stayPayments")
    .withIndex("by_org_paid", (q) => q.eq("orgId", access.orgId).gte("paidOn", from).lte("paidOn", today))
    .collect();
  for (const p of payments) {
    if (p.purpose === "rent" && !p.reversedAt && sees(p.leaseId)) addTo(collected, p.currency, p.amount);
  }

  const arrears: CurrencyTotals = {};
  const tenantsInArrears = new Set<string>();
  for (const status of ["unpaid", "part_paid"] as const) {
    const open = await ctx.db
      .query("stayCharges")
      .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", status))
      .collect();
    for (const c of open) {
      if (!isOverdue(c, today) || !sees(c.leaseId)) continue;
      addTo(arrears, c.currency, outstanding(c));
      tenantsInArrears.add(c.tenantContactId);
    }
  }

  const sps = await visibleStayProperties(ctx, access);
  const spIds = new Set(sps.map((sp) => sp._id as string));
  let units = 0;
  let vacant = 0;
  let occupied = 0;
  let notice = 0;
  let inspectionsDue = 0;
  const inspectionHorizon = addDays(today, 7);
  for (const sp of sps) {
    const list = await ctx.db
      .query("stayUnits")
      .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id))
      .collect();
    for (const u of list) {
      units++;
      if (u.status === "vacant") vacant++;
      else if (u.status === "notice") notice++;
      else occupied++;
      if (u.nextInspectionDue && u.nextInspectionDue <= inspectionHorizon) inspectionsDue++;
    }
  }

  const horizon = addDays(today, 60);
  const expiring = leases
    .filter((l) => l.status === "active" && l.endDate >= today && l.endDate <= horizon)
    .sort((a, b) => (a.endDate < b.endDate ? -1 : 1));

  let openMaintenance = 0;
  for (const status of ["new", "in_progress"] as const) {
    const rows = await ctx.db
      .query("stayMaintenance")
      .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", status))
      .collect();
    openMaintenance += rows.filter((m) => access.seesAll || spIds.has(m.stayPropertyId)).length;
  }

  return {
    today,
    rentDue,
    collected,
    arrears,
    tenantsInArrears: tenantsInArrears.size,
    units,
    vacant,
    occupied,
    notice,
    occupancyPct: units ? Math.round(((occupied + notice) / units) * 100) : 0,
    expiring,
    openMaintenance,
    inspectionsDue,
    propertyCount: sps.length,
  };
}

/** The Stay dashboard. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    const f = await figures(ctx, access);
    const label = await leaseLabels(ctx, f.expiring.slice(0, 10));
    return {
      today: f.today,
      rentDue: f.rentDue,
      collected: f.collected,
      arrears: f.arrears,
      tenantsInArrears: f.tenantsInArrears,
      units: f.units,
      vacant: f.vacant,
      occupied: f.occupied,
      notice: f.notice,
      occupancyPct: f.occupancyPct,
      expiringCount: f.expiring.length,
      expiring: f.expiring.slice(0, 10).map((l) => ({
        _id: l._id,
        endDate: l.endDate,
        ...label(l),
      })),
      openMaintenance: f.openMaintenance,
      inspectionsDue: f.inspectionsDue,
      propertyCount: f.propertyCount,
      isDirector: access.isDirector,
      canEditLeases: access.canEditLeases,
    };
  },
});

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
    const viewer = me.orgId ? me : { ...me, role: "admin" as const };
    if (!org || !userCanUseModule(viewer, org, "stay")) return null;

    let access: StayAccess;
    try {
      access = await requireStay(ctx);
    } catch {
      return null;
    }
    const f = await figures(ctx, access);
    return [
      {
        label: "Occupancy",
        value: f.units ? `${f.occupancyPct}%` : "No units",
        hint: f.units ? `${f.vacant} vacant of ${f.units} units` : undefined,
        href: "/app/stay/properties",
      },
      {
        label: "Rent collected this month",
        value: formatTotals(f.collected),
        hint: `Due ${formatTotals(f.rentDue)}`,
        tone: "good",
        href: "/app/stay/payments",
      },
      {
        label: "Arrears",
        value: formatTotals(f.arrears),
        hint: `${f.tenantsInArrears} tenant${f.tenantsInArrears === 1 ? "" : "s"} owing`,
        tone: Object.values(f.arrears).some((n) => (n ?? 0) > 0) ? "warning" : "default",
        href: "/app/stay/arrears",
      },
      {
        label: "Leases expiring in 60 days",
        value: String(f.expiring.length),
        tone: f.expiring.length ? "warning" : "default",
        href: "/app/stay/leases?expiring=60",
      },
    ];
  },
});

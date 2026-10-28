/**
 * Report data that no other screen already serves. Arrears by age, deposits
 * held, payments by date range and the expiry list reuse arrears.list,
 * deposits.list, payments.list and leases.list.
 */
import { query } from "../_generated/server";
import { requireStay } from "./access";
import { daysBetween } from "./ledger";
import { nameMaps, todayForOrg, userLabel, visibleStayProperties } from "./shared";

/** Rent roll and vacancy list: every unit with its current lease, if any. */
export const units = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    const today = await todayForOrg(ctx, access.orgId);
    const sps = await visibleStayProperties(ctx, access);
    const names = await nameMaps(ctx, {
      properties: sps.map((sp) => sp.propertyId),
      contacts: sps.map((sp) => sp.landlordContactId),
      users: sps.flatMap((sp) => (sp.managerUserId ? [sp.managerUserId] : [])),
    });
    const rows = [];
    for (const sp of sps) {
      const [units, leases] = await Promise.all([
        ctx.db.query("stayUnits").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect(),
        ctx.db.query("stayLeases").withIndex("by_stay_property", (q) => q.eq("stayPropertyId", sp._id)).collect(),
      ]);
      const tenants = await nameMaps(ctx, { contacts: leases.map((l) => l.tenantContactId) });
      for (const u of units) {
        const active = leases.find((l) => l.unitId === u._id && l.status === "active");
        // Vacant since the most recent move-out on this unit.
        const lastEnded = leases
          .filter((l) => l.unitId === u._id && l.status === "ended")
          .map((l) => l.moveOutDate ?? l.endDate)
          .sort()
          .pop();
        rows.push({
          unitId: u._id,
          stayPropertyId: sp._id,
          propertyName: names.property(sp.propertyId)?.title ?? "Property",
          address: names.property(sp.propertyId)?.location ?? "",
          unitLabel: u.label,
          bedrooms: u.bedrooms ?? null,
          status: u.status,
          landlordName: names.contact(sp.landlordContactId)?.name ?? "",
          managerName: sp.managerUserId ? userLabel(names.user(sp.managerUserId)) : "",
          leaseId: active?._id ?? null,
          tenantName: active ? tenants.contact(active.tenantContactId)?.name ?? "" : "",
          rentAmount: active?.rentAmount ?? null,
          currency: active?.currency ?? null,
          startDate: active?.startDate ?? null,
          endDate: active?.endDate ?? null,
          vacantSince: !active && lastEnded ? lastEnded : null,
          vacantDays: !active && lastEnded ? Math.max(0, daysBetween(lastEnded, today)) : null,
          nextInspectionDue: u.nextInspectionDue ?? null,
        });
      }
    }
    return rows.sort(
      (a, b) => a.propertyName.localeCompare(b.propertyName) || a.unitLabel.localeCompare(b.unitLabel, undefined, { numeric: true })
    );
  },
});

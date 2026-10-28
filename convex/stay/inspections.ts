/**
 * Sync Stay inspections (BRD Stay §5.7): move-in, routine and move-out
 * reports, room by room. A draft is freely editable. Completing locks the
 * report; later remarks are dated addenda. Completing a routine or move-in
 * inspection moves the unit's next due date forward by its interval, and a
 * daily job alerts the property manager when one falls due.
 */
import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { getVisibleLease, requireStay, StayAccess } from "./access";
import {
  activeLeaseForUnit,
  assertAssignable,
  getVisibleUnit,
  insertMaintenanceRequest,
  stayPropertyTitles,
  visibleStayProperties,
} from "./maintenance";
import { notifyUsers, orgAdminIds } from "../lib/notify";
import { recordAudit } from "../logs";
import { sendEmail } from "../email";
import { renderEmailShell, emailEyebrow, emailHeading, emailText, ACCENTS, escapeHtml } from "../emailLayout";

const typeValidator = v.union(v.literal("move_in"), v.literal("routine"), v.literal("move_out"));
const conditionValidator = v.union(
  v.literal("good"),
  v.literal("fair"),
  v.literal("poor"),
  v.literal("damaged")
);
const roomValidator = v.object({
  name: v.string(),
  condition: v.optional(conditionValidator),
  note: v.optional(v.string()),
  photos: v.array(v.id("_storage")),
});
const metersValidator = v.object({
  water: v.optional(v.string()),
  electricity: v.optional(v.string()),
});

const TYPE_LABELS = { move_in: "Move-in", routine: "Routine", move_out: "Move-out" } as const;
const DEFAULT_ROOMS = ["Living room", "Kitchen", "Bedroom 1", "Bathroom", "Exterior"];
const DUE_SOON_DAYS = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Add whole months to a "YYYY-MM-DD" date, clamping to the month end. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** overdue: before today. due_soon: within 30 days. Otherwise null. */
export function inspectionDueState(
  nextDue: string | undefined,
  today: string
): "overdue" | "due_soon" | null {
  if (!nextDue) return null;
  if (nextDue < today) return "overdue";
  return nextDue <= addDays(today, DUE_SOON_DAYS) ? "due_soon" : null;
}

function userName(u: Doc<"users"> | null | undefined): string {
  return u ? u.fullName || u.name || u.email || "Unknown" : "Unknown";
}

async function getVisibleInspection(
  ctx: Parameters<typeof getVisibleUnit>[0],
  access: StayAccess,
  id: Id<"stayInspections">
) {
  const row = await ctx.db.get(id);
  if (!row || row.orgId !== access.orgId) throw new ConvexError("Inspection not found");
  const { unit, sp } = await getVisibleUnit(ctx, access, row.unitId);
  return { row, unit, sp };
}

async function roomsWithUrls(
  ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } },
  rooms: Doc<"stayInspections">["rooms"]
) {
  const out = [];
  for (const r of rooms) {
    const photoUrls: string[] = [];
    for (const id of r.photos) {
      const url = await ctx.storage.getUrl(id);
      if (url) photoUrls.push(url);
    }
    out.push({ ...r, photoUrls });
  }
  return out;
}

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("draft"), v.literal("completed"))),
    unitId: v.optional(v.id("stayUnits")),
    type: v.optional(typeValidator),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const props = await visibleStayProperties(ctx, access);
    let rows: Doc<"stayInspections">[];
    if (args.unitId) {
      rows = await ctx.db
        .query("stayInspections")
        .withIndex("by_unit", (q) => q.eq("unitId", args.unitId!))
        .order("desc")
        .take(200);
    } else if (args.status) {
      rows = await ctx.db
        .query("stayInspections")
        .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", args.status!))
        .order("desc")
        .take(300);
    } else {
      rows = await ctx.db
        .query("stayInspections")
        .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
        .order("desc")
        .take(300);
    }
    rows = rows.filter(
      (r) =>
        r.orgId === access.orgId &&
        props.has(r.stayPropertyId) &&
        (!args.status || r.status === args.status) &&
        (!args.type || r.type === args.type)
    );
    const titles = await stayPropertyTitles(ctx, props.values());
    const units = new Map<Id<"stayUnits">, string>();
    const users = new Map<Id<"users">, string>();
    const out = [];
    for (const r of rows) {
      if (!units.has(r.unitId)) units.set(r.unitId, (await ctx.db.get(r.unitId))?.label ?? "Unit");
      if (!users.has(r.inspectorUserId)) {
        users.set(r.inspectorUserId, userName(await ctx.db.get(r.inspectorUserId)));
      }
      out.push({
        _id: r._id,
        type: r.type,
        typeLabel: TYPE_LABELS[r.type],
        date: r.date,
        status: r.status,
        unitId: r.unitId,
        unitLabel: units.get(r.unitId)!,
        propertyTitle: titles.get(r.stayPropertyId) ?? "Property",
        inspectorName: users.get(r.inspectorUserId)!,
        roomCount: r.rooms.length,
        issueCount: r.rooms.filter((x) => x.condition === "poor" || x.condition === "damaged").length,
        sentToLandlordAt: r.sentToLandlordAt,
        completedAt: r.completedAt,
      });
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  },
});

/** Units whose routine inspection is overdue or due within 30 days. */
export const dueUnits = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    const props = await visibleStayProperties(ctx, access);
    const titles = await stayPropertyTitles(ctx, props.values());
    const units = await ctx.db
      .query("stayUnits")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .take(1500);
    const today = todayIso();
    const out = [];
    for (const u of units) {
      if (!props.has(u.stayPropertyId) || u.status === "vacant") continue;
      const state = inspectionDueState(u.nextInspectionDue, today);
      if (!state) continue;
      out.push({
        unitId: u._id,
        unitLabel: u.label,
        propertyTitle: titles.get(u.stayPropertyId) ?? "Property",
        nextInspectionDue: u.nextInspectionDue!,
        state,
      });
    }
    return out.sort((a, b) => (a.nextInspectionDue < b.nextInspectionDue ? -1 : 1));
  },
});

/** Leases on a unit, newest first, for choosing which tenancy an inspection belongs to. */
export const leasesForUnit = query({
  args: { unitId: v.id("stayUnits") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    await getVisibleUnit(ctx, access, args.unitId);
    const leases = await ctx.db
      .query("stayLeases")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .order("desc")
      .take(20);
    const out = [];
    for (const l of leases) {
      const t = await ctx.db.get(l.tenantContactId);
      out.push({
        leaseId: l._id,
        tenantName: t?.name ?? "Tenant",
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
      });
    }
    return out;
  },
});

export const get = query({
  args: { id: v.id("stayInspections") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row, unit, sp } = await getVisibleInspection(ctx, access, args.id);
    return await inspectionDetail(ctx, row, unit, sp, access.canEditLeases);
  },
});

/**
 * The full report view of one inspection, with photo URLs and, for a
 * move-out, the move-in it is compared with. Shared by the staff screens and
 * the landlord/tenant portals, which check access before calling it.
 */
export async function inspectionDetail(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"stayInspections">,
  unit: Doc<"stayUnits">,
  sp: Doc<"stayProperties">,
  canSend: boolean
) {
  const [prop, inspector, lease] = await Promise.all([
    ctx.db.get(sp.propertyId),
    ctx.db.get(row.inspectorUserId),
    row.leaseId ? ctx.db.get(row.leaseId) : null,
  ]);
  const tenant = lease ? await ctx.db.get(lease.tenantContactId) : null;

  const addenda = [];
  for (const a of row.addenda) {
    addenda.push({ note: a.note, at: a.at, byName: userName(await ctx.db.get(a.byUserId)) });
  }

  // A move-out sits beside the move-in it is judged against (ST-79).
  let moveIn = null;
  if (row.type === "move_out") {
    const candidates = row.leaseId
      ? await ctx.db
          .query("stayInspections")
          .withIndex("by_lease", (q) => q.eq("leaseId", row.leaseId!))
          .order("desc")
          .take(20)
      : await ctx.db
          .query("stayInspections")
          .withIndex("by_unit", (q) => q.eq("unitId", row.unitId))
          .order("desc")
          .take(20);
    const mi = candidates.find((c) => c.type === "move_in" && c.status === "completed");
    if (mi) {
      moveIn = {
        _id: mi._id,
        date: mi.date,
        meterReadings: mi.meterReadings,
        rooms: await roomsWithUrls(ctx, mi.rooms),
      };
    }
  }

  return {
    _id: row._id,
    type: row.type,
    typeLabel: TYPE_LABELS[row.type],
    status: row.status,
    date: row.date,
    unitId: unit._id,
    unitLabel: unit.label,
    stayPropertyId: sp._id,
    propertyTitle: prop?.title ?? "Property",
    propertyLocation: prop?.location ?? "",
    leaseId: row.leaseId,
    tenantName: tenant?.name,
    inspectorUserId: row.inspectorUserId,
    inspectorName: userName(inspector),
    rooms: await roomsWithUrls(ctx, row.rooms),
    meterReadings: row.meterReadings,
    comments: row.comments,
    completedAt: row.completedAt,
    addenda,
    tenantAck: row.tenantAck,
    sentToLandlordAt: row.sentToLandlordAt,
    moveIn,
    canSend,
  };
}

export const create = mutation({
  args: {
    unitId: v.id("stayUnits"),
    type: typeValidator,
    date: v.string(),
    inspectorUserId: v.optional(v.id("users")),
    leaseId: v.optional(v.id("stayLeases")),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { unit, sp } = await getVisibleUnit(ctx, access, args.unitId);
    if (!DATE_RE.test(args.date)) throw new ConvexError("Pick a valid date");
    if (args.inspectorUserId) await assertAssignable(ctx, access, args.inspectorUserId);
    let leaseId = args.leaseId;
    if (leaseId) {
      const lease = await getVisibleLease(ctx, access, leaseId);
      if (lease.unitId !== unit._id) throw new ConvexError("Lease not found");
    } else {
      leaseId = (await activeLeaseForUnit(ctx, unit._id))?._id;
    }
    const names = unit.rooms.length ? unit.rooms : DEFAULT_ROOMS;
    const now = Date.now();
    return await ctx.db.insert("stayInspections", {
      orgId: access.orgId,
      stayPropertyId: sp._id,
      unitId: unit._id,
      leaseId,
      type: args.type,
      date: args.date,
      inspectorUserId: args.inspectorUserId ?? access.user._id,
      rooms: names.map((name) => ({ name, photos: [] })),
      status: "draft",
      addenda: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Save a draft. Photos dropped from a room are deleted from storage. */
export const saveDraft = mutation({
  args: {
    id: v.id("stayInspections"),
    date: v.optional(v.string()),
    inspectorUserId: v.optional(v.id("users")),
    rooms: v.optional(v.array(roomValidator)),
    meterReadings: v.optional(metersValidator),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row } = await getVisibleInspection(ctx, access, args.id);
    if (row.status !== "draft") {
      throw new ConvexError("This report is completed. Add an addendum instead");
    }
    const patch: Partial<Doc<"stayInspections">> = { updatedAt: Date.now() };
    if (args.date !== undefined) {
      if (!DATE_RE.test(args.date)) throw new ConvexError("Pick a valid date");
      patch.date = args.date;
    }
    if (args.inspectorUserId) {
      await assertAssignable(ctx, access, args.inspectorUserId);
      patch.inspectorUserId = args.inspectorUserId;
    }
    if (args.rooms) {
      if (args.rooms.length === 0) throw new ConvexError("Keep at least one room");
      const keep = new Set<string>(args.rooms.flatMap((r) => r.photos));
      for (const r of row.rooms) {
        for (const p of r.photos) if (!keep.has(p)) await ctx.storage.delete(p);
      }
      patch.rooms = args.rooms.map((r) => ({
        name: r.name.trim() || "Room",
        condition: r.condition,
        note: r.note?.trim() || undefined,
        photos: r.photos,
      }));
    }
    if (args.meterReadings) patch.meterReadings = args.meterReadings;
    if (args.comments !== undefined) patch.comments = args.comments.trim() || undefined;
    await ctx.db.patch(row._id, patch);
  },
});

export const complete = mutation({
  args: { id: v.id("stayInspections") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row, unit, sp } = await getVisibleInspection(ctx, access, args.id);
    if (row.status !== "draft") throw new ConvexError("Already completed");
    if (row.rooms.some((r) => !r.condition)) throw new ConvexError("Rate every room before completing");
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "completed", completedAt: now, updatedAt: now });

    if (
      (row.type === "routine" || row.type === "move_in") &&
      unit.inspectionIntervalMonths &&
      unit.inspectionIntervalMonths > 0
    ) {
      await ctx.db.patch(unit._id, {
        nextInspectionDue: addMonths(row.date, unit.inspectionIntervalMonths),
        updatedAt: now,
      });
    }
    await recordAudit(ctx, {
      actorUserId: access.user._id,
      actorLabel: userName(access.user),
      action: "stay.inspection.complete",
      category: "stay",
      description: `Completed ${TYPE_LABELS[row.type].toLowerCase()} inspection of ${unit.label}`,
      targetType: "stayInspections",
      targetId: row._id,
      targetLabel: unit.label,
      orgId: access.orgId,
    });
    await notifyUsers(ctx, [sp.managerUserId].filter((u) => u !== access.user._id), {
      orgId: access.orgId,
      module: "stay",
      kind: "inspection_completed",
      title: `${TYPE_LABELS[row.type]} inspection completed`,
      body: unit.label,
      href: `/app/stay/inspections/${row._id}`,
    });
  },
});

export const addAddendum = mutation({
  args: { id: v.id("stayInspections"), note: v.string() },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row } = await getVisibleInspection(ctx, access, args.id);
    if (row.status !== "completed") throw new ConvexError("Addenda can be added once the report is completed");
    const note = args.note.trim();
    if (!note) throw new ConvexError("Write the addendum");
    await ctx.db.patch(row._id, {
      addenda: [...row.addenda, { note, at: Date.now(), byUserId: access.user._id }],
      updatedAt: Date.now(),
    });
  },
});

export const removeDraft = mutation({
  args: { id: v.id("stayInspections") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row } = await getVisibleInspection(ctx, access, args.id);
    if (row.status !== "draft") throw new ConvexError("Completed reports cannot be deleted");
    for (const r of row.rooms) for (const p of r.photos) await ctx.storage.delete(p);
    await ctx.db.delete(row._id);
  },
});

/** One click from a room to a maintenance request linked to this report. */
export const raiseMaintenance = mutation({
  args: {
    id: v.id("stayInspections"),
    roomName: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row, unit, sp } = await getVisibleInspection(ctx, access, args.id);
    const room = row.rooms.find((r) => r.name === args.roomName);
    if (!room) throw new ConvexError("Room not found");
    return await insertMaintenanceRequest(ctx, {
      unit,
      sp,
      raisedByUserId: access.user._id,
      raisedVia: "inspection",
      title: args.title?.trim() || `${room.name}: repair needed`,
      description:
        args.description?.trim() ||
        room.note ||
        `Found during the ${TYPE_LABELS[row.type].toLowerCase()} inspection of ${row.date}.`,
      leaseId: row.leaseId,
      inspectionId: row._id,
    });
  },
});

/** The unit's standard room list, used by every new inspection. */
export const updateUnitRooms = mutation({
  args: { unitId: v.id("stayUnits"), rooms: v.array(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    if (!access.canEditLeases) throw new ConvexError("Your role cannot edit units");
    const { unit } = await getVisibleUnit(ctx, access, args.unitId);
    const rooms = [...new Set(args.rooms.map((r) => r.trim()).filter(Boolean))].slice(0, 40);
    if (rooms.length === 0) throw new ConvexError("Keep at least one room");
    await ctx.db.patch(unit._id, { rooms, updatedAt: Date.now() });
  },
});

/** Routine interval in months. Null switches routine inspections off. */
export const setUnitInterval = mutation({
  args: { unitId: v.id("stayUnits"), months: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    if (!access.canEditLeases) throw new ConvexError("Your role cannot edit units");
    const { unit } = await getVisibleUnit(ctx, access, args.unitId);
    if (args.months === null) {
      await ctx.db.patch(unit._id, {
        inspectionIntervalMonths: undefined,
        nextInspectionDue: undefined,
        updatedAt: Date.now(),
      });
      return;
    }
    const months = Math.round(args.months);
    if (months < 1 || months > 60) throw new ConvexError("Use 1 to 60 months");
    const past = await ctx.db
      .query("stayInspections")
      .withIndex("by_unit", (q) => q.eq("unitId", unit._id))
      .order("desc")
      .take(30);
    const last = past.find(
      (i) => i.status === "completed" && (i.type === "routine" || i.type === "move_in")
    );
    await ctx.db.patch(unit._id, {
      inspectionIntervalMonths: months,
      nextInspectionDue: addMonths(last?.date ?? todayIso(), months),
      updatedAt: Date.now(),
    });
  },
});

export const sendToLandlord = mutation({
  args: { id: v.id("stayInspections") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    if (!access.canEditLeases) throw new ConvexError("Your role cannot send reports");
    const { row, unit } = await getVisibleInspection(ctx, access, args.id);
    if (row.status !== "completed") throw new ConvexError("Complete the report first");
    await ctx.db.patch(row._id, { sentToLandlordAt: Date.now(), updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.stay.inspections.emailLandlordReport, {
      inspectionId: row._id,
    });
    await recordAudit(ctx, {
      actorUserId: access.user._id,
      actorLabel: userName(access.user),
      action: "stay.inspection.send",
      category: "stay",
      description: `Sent ${TYPE_LABELS[row.type].toLowerCase()} inspection of ${unit.label} to the landlord`,
      targetType: "stayInspections",
      targetId: row._id,
      targetLabel: unit.label,
      orgId: access.orgId,
    });
  },
});

export const landlordEmailContext = internalQuery({
  args: { inspectionId: v.id("stayInspections") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.inspectionId);
    if (!row) return null;
    const sp = await ctx.db.get(row.stayPropertyId);
    const [landlord, unit, org, prop] = await Promise.all([
      sp ? ctx.db.get(sp.landlordContactId) : null,
      ctx.db.get(row.unitId),
      ctx.db.get(row.orgId),
      sp ? ctx.db.get(sp.propertyId) : null,
    ]);
    if (!landlord?.email) return null;
    return {
      orgId: row.orgId,
      to: landlord.email,
      landlordName: landlord.name,
      typeLabel: TYPE_LABELS[row.type],
      date: row.date,
      unitLabel: unit?.label ?? "the unit",
      propertyTitle: prop?.title ?? "your property",
      orgName: org?.name ?? "Your property manager",
      roomCount: row.rooms.length,
      issueCount: row.rooms.filter((r) => r.condition === "poor" || r.condition === "damaged").length,
    };
  },
});

export const emailLandlordReport = internalAction({
  args: { inspectionId: v.id("stayInspections") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(internal.stay.inspections.landlordEmailContext, args);
    if (!info) return;
    const { accent, tint } = ACCENTS.blue;
    const issues =
      info.issueCount === 0
        ? "No rooms were rated poor or damaged."
        : `${info.issueCount} of ${info.roomCount} rooms were rated poor or damaged.`;
    await sendEmail(
      {
        to: info.to,
        subject: `${info.typeLabel} inspection report: ${info.unitLabel}, ${info.propertyTitle}`,
        html: renderEmailShell({
          accentColor: accent,
          preheader: `${info.typeLabel} inspection of ${info.unitLabel} is complete.`,
          content:
            emailEyebrow("Inspection report", accent, tint) +
            emailHeading(`${info.typeLabel} inspection complete`) +
            emailText(
              `Hello ${escapeHtml(info.landlordName)},<br><br>The ${info.typeLabel.toLowerCase()} inspection of <strong>${escapeHtml(info.unitLabel)}</strong>, ${escapeHtml(info.propertyTitle)}, on ${info.date} is complete. ${issues}`
            ) +
            emailText("The full report with photos is available in your landlord portal.") +
            emailText(`Regards,<br>${escapeHtml(info.orgName)}`),
        }),
        text: `Hello ${info.landlordName}, the ${info.typeLabel.toLowerCase()} inspection of ${info.unitLabel}, ${info.propertyTitle}, on ${info.date} is complete. ${issues} The full report is available in your landlord portal. ${info.orgName}`,
      },
      ctx,
      { kind: "stay_inspection_report", relatedType: "stayInspections", relatedId: args.inspectionId, orgId: info.orgId }
    );
  },
});

/**
 * Daily: alert the property manager (or the directors when none is set) about
 * units whose inspection is due. A notification already sent for the same unit
 * and due date is not repeated. Returns the people to email.
 */
export const claimDueInspections = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = todayIso();
    const units = await ctx.db.query("stayUnits").take(4000);
    const emails: {
      orgId: Id<"organizations">;
      to: string;
      name: string;
      unitLabel: string;
      propertyTitle: string;
      due: string;
    }[] = [];
    const seen = new Map<Id<"users">, Doc<"notifications">[]>();
    const admins = new Map<Id<"organizations">, Id<"users">[]>();

    for (const unit of units) {
      if (!unit.nextInspectionDue || unit.nextInspectionDue > today || unit.status === "vacant") continue;
      const sp = await ctx.db.get(unit.stayPropertyId);
      if (!sp || !sp.isActive) continue;
      const prop = await ctx.db.get(sp.propertyId);
      let recipients: Id<"users">[];
      if (sp.managerUserId) recipients = [sp.managerUserId];
      else {
        if (!admins.has(unit.orgId)) admins.set(unit.orgId, await orgAdminIds(ctx, unit.orgId));
        recipients = admins.get(unit.orgId)!;
      }
      const href = `/app/stay/inspections/new?unitId=${unit._id}`;
      const body = `${unit.label}, ${prop?.title ?? "property"}. Due ${unit.nextInspectionDue}`;
      for (const userId of recipients) {
        if (!seen.has(userId)) {
          seen.set(
            userId,
            await ctx.db
              .query("notifications")
              .withIndex("by_user_created", (q) => q.eq("userId", userId))
              .order("desc")
              .take(200)
          );
        }
        if (seen.get(userId)!.some((n) => n.kind === "inspection_due" && n.href === href && n.body === body)) {
          continue;
        }
        await notifyUsers(ctx, [userId], {
          orgId: unit.orgId,
          module: "stay",
          kind: "inspection_due",
          title: "Inspection due",
          body,
          href,
        });
        const user = await ctx.db.get(userId);
        if (user?.isActive && user.email) {
          emails.push({
            orgId: unit.orgId,
            to: user.email,
            name: userName(user),
            unitLabel: unit.label,
            propertyTitle: prop?.title ?? "property",
            due: unit.nextInspectionDue,
          });
        }
      }
    }
    return emails;
  },
});

export const processDueInspections = internalAction({
  args: {},
  handler: async (ctx) => {
    const emails = await ctx.runMutation(internal.stay.inspections.claimDueInspections, {});
    const { accent, tint } = ACCENTS.amber;
    for (const e of emails) {
      await sendEmail(
        {
          to: e.to,
          subject: `Inspection due: ${e.unitLabel}, ${e.propertyTitle}`,
          html: renderEmailShell({
            accentColor: accent,
            preheader: `${e.unitLabel} is due for inspection.`,
            content:
              emailEyebrow("Inspection due", accent, tint) +
              emailHeading(`${escapeHtml(e.unitLabel)} is due for inspection`) +
              emailText(
                `Hello ${escapeHtml(e.name)},<br><br>${escapeHtml(e.unitLabel)}, ${escapeHtml(e.propertyTitle)}, was due for a routine inspection on ${e.due}. Open Sync Stay to start the report.`
              ),
          }),
          text: `Hello ${e.name}, ${e.unitLabel}, ${e.propertyTitle}, was due for a routine inspection on ${e.due}.`,
        },
        ctx,
        { kind: "stay_inspection_due", orgId: e.orgId }
      );
    }
  },
});

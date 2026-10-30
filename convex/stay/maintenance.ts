/**
 * SyncStay maintenance (BRD Stay §5.6). A request belongs to a unit, moves
 * new > in progress > done, can be assigned to a staff member, and its cost
 * becomes a stayExpenses row. Costs above the property's repair threshold
 * wait for the landlord's approval (staff can record it on their behalf until
 * the landlord portal exists).
 *
 * The exported helpers (insertMaintenanceRequest, changeMaintenanceStatus,
 * shapeMaintenanceRequest) take already-authorised input so the tenant and
 * landlord portals can reuse them.
 */
import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalQuery,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { getVisibleStayProperty, requireStay, StayAccess } from "./access";
import { notifyUsers } from "../lib/notify";
import { recordAudit } from "../logs";
import { hasEstateRole } from "../lib/modules";
import { sendEmail } from "../email";
import { renderEmailShell, emailEyebrow, emailHeading, emailText, ACCENTS, escapeHtml } from "../emailLayout";
import { stayCurrency } from "../schemas/stay";

const statusValidator = v.union(v.literal("new"), v.literal("in_progress"), v.literal("done"));
type Status = "new" | "in_progress" | "done";

const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  in_progress: "In progress",
  done: "Done",
};

const MAX_ROWS = 300;

/** True when a repair cost needs the landlord's sign-off. */
export function needsLandlordApproval(cost: number, threshold: number | undefined | null): boolean {
  return threshold != null && threshold > 0 && cost > threshold;
}

export type MaintenanceDisplay = {
  _id: Id<"stayMaintenance">;
  title: string;
  description: string;
  status: Status;
  statusLabel: string;
  raisedVia: Doc<"stayMaintenance">["raisedVia"];
  unitId: Id<"stayUnits">;
  unitLabel: string;
  stayPropertyId: Id<"stayProperties">;
  propertyTitle: string;
  leaseId?: Id<"stayLeases">;
  assigneeUserId?: Id<"users">;
  assigneeName?: string;
  cost?: number;
  currency?: Doc<"stayMaintenance">["currency"];
  expenseId?: Id<"stayExpenses">;
  inspectionId?: Id<"stayInspections">;
  landlordApproval?: Doc<"stayMaintenance">["landlordApproval"];
  photoUrls: string[];
  photoCount: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

/** Shape a request for display. Pure, so portals can reuse it with their own lookups. */
export function shapeMaintenanceRequest(
  row: Doc<"stayMaintenance">,
  extra: {
    unitLabel: string;
    propertyTitle: string;
    assigneeName?: string;
    photoUrls?: string[];
  }
): MaintenanceDisplay {
  return {
    _id: row._id,
    title: row.title,
    description: row.description,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status],
    raisedVia: row.raisedVia,
    unitId: row.unitId,
    unitLabel: extra.unitLabel,
    stayPropertyId: row.stayPropertyId,
    propertyTitle: extra.propertyTitle,
    leaseId: row.leaseId,
    assigneeUserId: row.assigneeUserId,
    assigneeName: extra.assigneeName,
    cost: row.cost,
    currency: row.currency,
    expenseId: row.expenseId,
    inspectionId: row.inspectionId,
    landlordApproval: row.landlordApproval,
    photoUrls: extra.photoUrls ?? [],
    photoCount: row.photos.length,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function userName(u: Doc<"users"> | null | undefined): string {
  return u ? u.fullName || u.name || u.email || "Unknown" : "Unknown";
}

/** Stay properties the caller may see, keyed by id. */
export async function visibleStayProperties(
  ctx: QueryCtx | MutationCtx,
  access: StayAccess
): Promise<Map<Id<"stayProperties">, Doc<"stayProperties">>> {
  const rows = access.seesAll
    ? await ctx.db
        .query("stayProperties")
        .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
        .take(1000)
    : await ctx.db
        .query("stayProperties")
        .withIndex("by_org_manager", (q) =>
          q.eq("orgId", access.orgId).eq("managerUserId", access.user._id)
        )
        .take(1000);
  return new Map(rows.map((r) => [r._id, r]));
}

/** Hub property titles for a set of Stay properties. */
export async function stayPropertyTitles(
  ctx: QueryCtx | MutationCtx,
  sps: Iterable<Doc<"stayProperties">>
): Promise<Map<Id<"stayProperties">, string>> {
  const out = new Map<Id<"stayProperties">, string>();
  for (const sp of sps) {
    const p = await ctx.db.get(sp.propertyId);
    out.set(sp._id, p?.title ?? "Property");
  }
  return out;
}

/** The unit's current lease, if any. */
export async function activeLeaseForUnit(
  ctx: QueryCtx | MutationCtx,
  unitId: Id<"stayUnits">
): Promise<Doc<"stayLeases"> | null> {
  const leases = await ctx.db
    .query("stayLeases")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .order("desc")
    .take(20);
  return leases.find((l) => l.status === "active") ?? null;
}

/** Load a unit the caller may see, or throw. */
export async function getVisibleUnit(
  ctx: QueryCtx | MutationCtx,
  access: StayAccess,
  unitId: Id<"stayUnits">
) {
  const unit = await ctx.db.get(unitId);
  if (!unit || unit.orgId !== access.orgId) throw new ConvexError("Unit not found");
  const sp = await getVisibleStayProperty(ctx, access, unit.stayPropertyId);
  return { unit, sp };
}

async function getVisibleRequest(ctx: QueryCtx | MutationCtx, access: StayAccess, id: Id<"stayMaintenance">) {
  const row = await ctx.db.get(id);
  if (!row || row.orgId !== access.orgId) throw new ConvexError("Request not found");
  const sp = await getVisibleStayProperty(ctx, access, row.stayPropertyId);
  return { row, sp };
}

/** Units the caller can raise work or inspections against, with their tenant. */
export const unitOptions = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    const props = await visibleStayProperties(ctx, access);
    const titles = await stayPropertyTitles(ctx, props.values());
    const units = await ctx.db
      .query("stayUnits")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .take(1500);
    const out = [];
    for (const u of units) {
      if (!props.has(u.stayPropertyId)) continue;
      const lease = await activeLeaseForUnit(ctx, u._id);
      const tenant = lease ? await ctx.db.get(lease.tenantContactId) : null;
      out.push({
        unitId: u._id,
        label: u.label,
        stayPropertyId: u.stayPropertyId,
        propertyTitle: titles.get(u.stayPropertyId) ?? "Property",
        rooms: u.rooms,
        inspectionIntervalMonths: u.inspectionIntervalMonths,
        nextInspectionDue: u.nextInspectionDue,
        activeLeaseId: lease?._id,
        tenantName: tenant?.name,
      });
    }
    return out.sort((a, b) =>
      `${a.propertyTitle} ${a.label}`.localeCompare(`${b.propertyTitle} ${b.label}`)
    );
  },
});

/** Staff who can be assigned work: property managers and directors. */
export const staffOptions = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireStay(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .take(500);
    return users
      .filter((u) => u.isActive && (u.role === "admin" || hasEstateRole(u, "property_manager")))
      .map((u) => ({ _id: u._id, name: userName(u) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const list = query({
  args: {
    status: v.optional(statusValidator),
    stayPropertyId: v.optional(v.id("stayProperties")),
    unitId: v.optional(v.id("stayUnits")),
    leaseId: v.optional(v.id("stayLeases")),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const props = await visibleStayProperties(ctx, access);

    let rows: Doc<"stayMaintenance">[];
    if (args.unitId) {
      rows = await ctx.db
        .query("stayMaintenance")
        .withIndex("by_unit", (q) => q.eq("unitId", args.unitId!))
        .order("desc")
        .take(MAX_ROWS);
    } else if (args.leaseId) {
      rows = await ctx.db
        .query("stayMaintenance")
        .withIndex("by_lease", (q) => q.eq("leaseId", args.leaseId!))
        .order("desc")
        .take(MAX_ROWS);
    } else if (args.stayPropertyId) {
      rows = await ctx.db
        .query("stayMaintenance")
        .withIndex("by_stay_property", (q) => q.eq("stayPropertyId", args.stayPropertyId!))
        .order("desc")
        .take(MAX_ROWS);
    } else if (args.status) {
      rows = await ctx.db
        .query("stayMaintenance")
        .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", args.status!))
        .order("desc")
        .take(MAX_ROWS);
    } else {
      rows = await ctx.db
        .query("stayMaintenance")
        .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
        .order("desc")
        .take(MAX_ROWS);
    }
    rows = rows.filter(
      (r) =>
        r.orgId === access.orgId &&
        props.has(r.stayPropertyId) &&
        (!args.status || r.status === args.status)
    );

    const titles = await stayPropertyTitles(ctx, props.values());
    const unitCache = new Map<Id<"stayUnits">, string>();
    const userCache = new Map<Id<"users">, string>();
    const out: MaintenanceDisplay[] = [];
    for (const r of rows) {
      if (!unitCache.has(r.unitId)) {
        const u = await ctx.db.get(r.unitId);
        unitCache.set(r.unitId, u?.label ?? "Unit");
      }
      let assigneeName: string | undefined;
      if (r.assigneeUserId) {
        if (!userCache.has(r.assigneeUserId)) {
          userCache.set(r.assigneeUserId, userName(await ctx.db.get(r.assigneeUserId)));
        }
        assigneeName = userCache.get(r.assigneeUserId);
      }
      out.push(
        shapeMaintenanceRequest(r, {
          unitLabel: unitCache.get(r.unitId)!,
          propertyTitle: titles.get(r.stayPropertyId) ?? "Property",
          assigneeName,
        })
      );
    }
    return out;
  },
});

export const get = query({
  args: { id: v.id("stayMaintenance") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row, sp } = await getVisibleRequest(ctx, access, args.id);
    const [unit, prop, assignee, raisedBy, expense, lease] = await Promise.all([
      ctx.db.get(row.unitId),
      ctx.db.get(sp.propertyId),
      row.assigneeUserId ? ctx.db.get(row.assigneeUserId) : null,
      ctx.db.get(row.raisedByUserId),
      row.expenseId ? ctx.db.get(row.expenseId) : null,
      row.leaseId ? ctx.db.get(row.leaseId) : null,
    ]);
    const tenant = lease ? await ctx.db.get(lease.tenantContactId) : null;
    const photoUrls: string[] = [];
    for (const id of row.photos) {
      const url = await ctx.storage.getUrl(id);
      if (url) photoUrls.push(url);
    }
    return {
      ...shapeMaintenanceRequest(row, {
        unitLabel: unit?.label ?? "Unit",
        propertyTitle: prop?.title ?? "Property",
        assigneeName: assignee ? userName(assignee) : undefined,
        photoUrls,
      }),
      photos: row.photos,
      raisedByName: userName(raisedBy),
      tenantName: tenant?.name,
      repairApprovalThreshold: sp.repairApprovalThreshold,
      expense: expense
        ? {
            amount: expense.amount,
            currency: expense.currency,
            supplier: expense.supplier,
            rechargeToLandlord: expense.rechargeToLandlord,
            date: expense.date,
          }
        : null,
    };
  },
});

/**
 * Insert a request and alert the assignee and property manager. Callers have
 * already authorised the unit. Portals pass raisedVia "tenant_portal".
 */
export async function insertMaintenanceRequest(
  ctx: MutationCtx,
  args: {
    unit: Doc<"stayUnits">;
    sp: Doc<"stayProperties">;
    raisedByUserId: Id<"users">;
    raisedVia: Doc<"stayMaintenance">["raisedVia"];
    title: string;
    description: string;
    photos?: Id<"_storage">[];
    leaseId?: Id<"stayLeases">;
    assigneeUserId?: Id<"users">;
    inspectionId?: Id<"stayInspections">;
  }
): Promise<Id<"stayMaintenance">> {
  const title = args.title.trim();
  if (!title) throw new ConvexError("Add a short title");
  const now = Date.now();
  const id = await ctx.db.insert("stayMaintenance", {
    orgId: args.sp.orgId,
    stayPropertyId: args.sp._id,
    unitId: args.unit._id,
    leaseId: args.leaseId,
    raisedVia: args.raisedVia,
    raisedByUserId: args.raisedByUserId,
    title,
    description: args.description.trim(),
    photos: args.photos ?? [],
    status: "new",
    assigneeUserId: args.assigneeUserId,
    inspectionId: args.inspectionId,
    createdAt: now,
    updatedAt: now,
  });
  await notifyUsers(
    ctx,
    [args.assigneeUserId, args.sp.managerUserId].filter((u) => u !== args.raisedByUserId),
    {
      orgId: args.sp.orgId,
      module: "stay",
      kind: "maintenance_new",
      title: `Maintenance request: ${title}`,
      body: `${args.unit.label}${args.assigneeUserId ? "" : ". Not yet assigned"}`,
      href: `/app/stay/maintenance/${id}`,
    }
  );
  return id;
}

export const create = mutation({
  args: {
    unitId: v.id("stayUnits"),
    title: v.string(),
    description: v.string(),
    photos: v.optional(v.array(v.id("_storage"))),
    assigneeUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { unit, sp } = await getVisibleUnit(ctx, access, args.unitId);
    if (args.assigneeUserId) await assertAssignable(ctx, access, args.assigneeUserId);
    const lease = await activeLeaseForUnit(ctx, unit._id);
    return await insertMaintenanceRequest(ctx, {
      unit,
      sp,
      raisedByUserId: access.user._id,
      raisedVia: "staff",
      title: args.title,
      description: args.description,
      photos: args.photos,
      leaseId: lease?._id,
      assigneeUserId: args.assigneeUserId,
    });
  },
});

export async function assertAssignable(ctx: QueryCtx | MutationCtx, access: StayAccess, userId: Id<"users">) {
  const u = await ctx.db.get(userId);
  if (
    !u ||
    u.orgId !== access.orgId ||
    !u.isActive ||
    !(u.role === "admin" || hasEstateRole(u, "property_manager"))
  ) {
    throw new ConvexError("That person cannot be assigned maintenance");
  }
}

export const update = mutation({
  args: {
    id: v.id("stayMaintenance"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    photos: v.optional(v.array(v.id("_storage"))),
    /** Pass null to unassign. */
    assigneeUserId: v.optional(v.union(v.id("users"), v.null())),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row } = await getVisibleRequest(ctx, access, args.id);
    const patch: Partial<Doc<"stayMaintenance">> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      if (!args.title.trim()) throw new ConvexError("Add a short title");
      patch.title = args.title.trim();
    }
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.photos) {
      // Removed photos are no longer referenced anywhere, so free the files.
      const keep = new Set<string>(args.photos);
      for (const old of row.photos) if (!keep.has(old)) await ctx.storage.delete(old);
      patch.photos = args.photos;
    }
    if (args.assigneeUserId !== undefined) {
      if (args.assigneeUserId === null) {
        patch.assigneeUserId = undefined;
      } else {
        await assertAssignable(ctx, access, args.assigneeUserId);
        patch.assigneeUserId = args.assigneeUserId;
        if (args.assigneeUserId !== row.assigneeUserId && args.assigneeUserId !== access.user._id) {
          await notifyUsers(ctx, [args.assigneeUserId], {
            orgId: access.orgId,
            module: "stay",
            kind: "maintenance_assigned",
            title: `Assigned to you: ${patch.title ?? row.title}`,
            href: `/app/stay/maintenance/${row._id}`,
          });
        }
      }
    }
    await ctx.db.patch(row._id, patch);
  },
});

/** Move a request to a new status, alerting staff and emailing the tenant. */
export async function changeMaintenanceStatus(
  ctx: MutationCtx,
  row: Doc<"stayMaintenance">,
  sp: Doc<"stayProperties">,
  status: Status,
  actorUserId: Id<"users">
) {
  if (row.status === status) return;
  const now = Date.now();
  await ctx.db.patch(row._id, {
    status,
    completedAt: status === "done" ? now : undefined,
    updatedAt: now,
  });
  await notifyUsers(
    ctx,
    [row.assigneeUserId, sp.managerUserId, row.raisedVia === "staff" ? row.raisedByUserId : undefined].filter(
      (u) => u !== actorUserId
    ),
    {
      orgId: row.orgId,
      module: "stay",
      kind: "maintenance_status",
      title: `${row.title}: ${STATUS_LABELS[status]}`,
      href: `/app/stay/maintenance/${row._id}`,
    }
  );
  if (row.leaseId) {
    await ctx.scheduler.runAfter(0, internal.stay.maintenance.emailTenantStatus, {
      maintenanceId: row._id,
    });
  }
}

export const setStatus = mutation({
  args: { id: v.id("stayMaintenance"), status: statusValidator },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row, sp } = await getVisibleRequest(ctx, access, args.id);
    await changeMaintenanceStatus(ctx, row, sp, args.status, access.user._id);
  },
});

/** Record or correct the repair cost. Creates the expense row on first save. */
export const recordCost = mutation({
  args: {
    id: v.id("stayMaintenance"),
    cost: v.number(),
    currency: v.optional(stayCurrency),
    supplier: v.optional(v.string()),
    rechargeToLandlord: v.optional(v.boolean()),
    /** "YYYY-MM-DD". Defaults to today. */
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row, sp } = await getVisibleRequest(ctx, access, args.id);
    if (!(args.cost > 0)) throw new ConvexError("Enter a cost above zero");
    const lease = row.leaseId ? await ctx.db.get(row.leaseId) : null;
    const currency = args.currency ?? row.currency ?? lease?.currency ?? "USD";
    const date = args.date ?? new Date().toISOString().slice(0, 10);
    const supplier = args.supplier?.trim() || undefined;
    const now = Date.now();

    let expenseId = row.expenseId;
    const existing = expenseId ? await ctx.db.get(expenseId) : null;
    if (existing) {
      await ctx.db.patch(existing._id, {
        amount: args.cost,
        currency,
        supplier,
        date,
        rechargeToLandlord: args.rechargeToLandlord ?? existing.rechargeToLandlord,
      });
    } else {
      const unit = await ctx.db.get(row.unitId);
      expenseId = await ctx.db.insert("stayExpenses", {
        orgId: row.orgId,
        stayPropertyId: row.stayPropertyId,
        unitId: row.unitId,
        maintenanceId: row._id,
        date,
        description: `Repair: ${row.title}${unit ? ` (${unit.label})` : ""}`,
        amount: args.cost,
        currency,
        supplier,
        rechargeToLandlord: args.rechargeToLandlord ?? true,
        createdByUserId: access.user._id,
        createdAt: now,
      });
    }

    const needsApproval = needsLandlordApproval(args.cost, sp.repairApprovalThreshold);
    // A new or changed amount over the threshold asks for approval again.
    const approval = needsApproval
      ? row.landlordApproval?.status === "approved" && row.cost === args.cost
        ? row.landlordApproval
        : { status: "pending" as const }
      : undefined;
    await ctx.db.patch(row._id, {
      cost: args.cost,
      currency,
      expenseId,
      landlordApproval: approval,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      actorUserId: access.user._id,
      actorLabel: userName(access.user),
      action: "stay.maintenance.cost",
      category: "stay",
      description: `Recorded ${currency} ${args.cost} repair cost on "${row.title}"`,
      targetType: "stayMaintenance",
      targetId: row._id,
      targetLabel: row.title,
      orgId: access.orgId,
    });
    if (needsApproval && approval?.status === "pending") {
      await notifyUsers(ctx, [sp.managerUserId].filter((u) => u !== access.user._id), {
        orgId: access.orgId,
        module: "stay",
        kind: "maintenance_approval",
        title: `Landlord approval needed: ${row.title}`,
        body: `${currency} ${args.cost} is above the repair threshold`,
        href: `/app/stay/maintenance/${row._id}`,
      });
    }
    return { needsApproval };
  },
});

/** Staff record the landlord's decision until the landlord portal exists. */
export const setLandlordApproval = mutation({
  args: {
    id: v.id("stayMaintenance"),
    status: v.union(v.literal("approved"), v.literal("declined")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    if (!access.canEditLeases) throw new ConvexError("Your role cannot record approvals");
    const { row } = await getVisibleRequest(ctx, access, args.id);
    if (!row.landlordApproval) throw new ConvexError("This request does not need approval");
    await ctx.db.patch(row._id, {
      landlordApproval: { status: args.status, at: Date.now(), note: args.note?.trim() || undefined },
      updatedAt: Date.now(),
    });
    await notifyUsers(ctx, [row.assigneeUserId].filter((u) => u !== access.user._id), {
      orgId: access.orgId,
      module: "stay",
      kind: "maintenance_approval",
      title: `Repair ${args.status}: ${row.title}`,
      href: `/app/stay/maintenance/${row._id}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("stayMaintenance") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const { row } = await getVisibleRequest(ctx, access, args.id);
    // Costed work has an expense on the books, so it is kept.
    if (row.expenseId) throw new ConvexError("A request with a recorded cost cannot be deleted");
    for (const p of row.photos) await ctx.storage.delete(p);
    await ctx.db.delete(row._id);
  },
});

export const emailContext = internalQuery({
  args: { maintenanceId: v.id("stayMaintenance") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.maintenanceId);
    if (!row?.leaseId) return null;
    const [lease, unit, org] = await Promise.all([
      ctx.db.get(row.leaseId),
      ctx.db.get(row.unitId),
      ctx.db.get(row.orgId),
    ]);
    const tenant = lease ? await ctx.db.get(lease.tenantContactId) : null;
    if (!tenant?.email) return null;
    return {
      orgId: row.orgId,
      to: tenant.email,
      tenantName: tenant.name,
      title: row.title,
      status: row.status,
      unitLabel: unit?.label ?? "your unit",
      orgName: org?.name ?? "Your property manager",
    };
  },
});

export const emailTenantStatus = internalAction({
  args: { maintenanceId: v.id("stayMaintenance") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(internal.stay.maintenance.emailContext, args);
    if (!info) return;
    const label = STATUS_LABELS[info.status].toLowerCase();
    const { accent, tint } = ACCENTS.blue;
    const intro =
      info.status === "done"
        ? "The work is complete. Tell us if anything still needs attention."
        : info.status === "in_progress"
          ? "Work on your request has started."
          : "We have your request and will update you as it moves.";
    await sendEmail(
      {
        to: info.to,
        subject: `Maintenance update: ${info.title}`,
        html: renderEmailShell({
          accentColor: accent,
          preheader: `Your request is now ${label}.`,
          content:
            emailEyebrow("Maintenance", accent, tint) +
            emailHeading(`Your request is now ${label}`) +
            emailText(
              `Hello ${escapeHtml(info.tenantName)},<br><br><strong>${escapeHtml(info.title)}</strong> (${escapeHtml(info.unitLabel)}). ${intro}`
            ) +
            emailText(`Regards,<br>${escapeHtml(info.orgName)}`),
        }),
        text: `Hello ${info.tenantName}, your maintenance request "${info.title}" (${info.unitLabel}) is now ${label}. ${intro} ${info.orgName}`,
      },
      ctx,
      { kind: "stay_maintenance_status", relatedType: "stayMaintenance", relatedId: args.maintenanceId, orgId: info.orgId }
    );
  },
});

/**
 * Server helpers shared by the Sync Stay functions: settings, visibility-
 * scoped lists, lease chains, audit and Hub contact records.
 */
import { ConvexError } from "convex/values";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { recordAudit } from "../logs";
import { normalizePhone } from "../contacts";
import { StayAccess, canSeeStayProperty } from "./access";
import {
  DEFAULT_EXPIRY_ALERT_DAYS,
  DEFAULT_INVOICE_LEAD_DAYS,
  DEFAULT_RECEIPT_PREFIX,
  DEFAULT_REMINDER_DAYS,
  DEFAULT_TIMEZONE,
  buildStatement,
  formatReceiptNumber,
  outstanding,
  round2,
  todayIn,
} from "./ledger";

type Ctx = QueryCtx | MutationCtx;

export function userLabel(u: Pick<Doc<"users">, "fullName" | "name" | "email"> | null | undefined): string {
  return u?.fullName || u?.name || u?.email || "Unknown";
}

// ── Settings ─────────────────────────────────────────────────────────

export type StaySettingsView = {
  invoiceLeadDays: number;
  reminderDays: number[];
  expiryAlertDays: number[];
  receiptPrefix: string;
  nextReceiptSeq: number;
  timezone: string;
};

export async function getSettings(ctx: Ctx, orgId: Id<"organizations">): Promise<StaySettingsView> {
  const row = await ctx.db
    .query("staySettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  return {
    invoiceLeadDays: row?.invoiceLeadDays ?? DEFAULT_INVOICE_LEAD_DAYS,
    reminderDays: row?.reminderDays ?? DEFAULT_REMINDER_DAYS,
    expiryAlertDays: row?.expiryAlertDays ?? DEFAULT_EXPIRY_ALERT_DAYS,
    receiptPrefix: row?.receiptPrefix ?? DEFAULT_RECEIPT_PREFIX,
    nextReceiptSeq: row?.nextReceiptSeq ?? 1,
    timezone: row?.timezone ?? DEFAULT_TIMEZONE,
  };
}

export async function ensureSettings(ctx: MutationCtx, orgId: Id<"organizations">): Promise<Doc<"staySettings">> {
  const row = await ctx.db
    .query("staySettings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (row) return row;
  const id = await ctx.db.insert("staySettings", {
    orgId,
    invoiceLeadDays: DEFAULT_INVOICE_LEAD_DAYS,
    reminderDays: DEFAULT_REMINDER_DAYS,
    expiryAlertDays: DEFAULT_EXPIRY_ALERT_DAYS,
    receiptPrefix: DEFAULT_RECEIPT_PREFIX,
    nextReceiptSeq: 1,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

/**
 * Next receipt number for the agency. Allocated inside the caller's
 * transaction, so two payments can never share a number: Convex retries the
 * losing transaction against the updated counter.
 */
export async function allocateReceiptNumber(ctx: MutationCtx, orgId: Id<"organizations">): Promise<string> {
  const settings = await ensureSettings(ctx, orgId);
  const seq = settings.nextReceiptSeq;
  await ctx.db.patch(settings._id, { nextReceiptSeq: seq + 1, updatedAt: Date.now() });
  return formatReceiptNumber(settings.receiptPrefix, seq);
}

export async function todayForOrg(ctx: Ctx, orgId: Id<"organizations">): Promise<string> {
  const s = await getSettings(ctx, orgId);
  return todayIn(s.timezone);
}

// ── Visibility-scoped lists ──────────────────────────────────────────

/** Every Stay property the caller may see. */
export async function visibleStayProperties(ctx: Ctx, access: StayAccess): Promise<Doc<"stayProperties">[]> {
  if (access.seesAll) {
    return ctx.db
      .query("stayProperties")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
  }
  return ctx.db
    .query("stayProperties")
    .withIndex("by_org_manager", (q) => q.eq("orgId", access.orgId).eq("managerUserId", access.user._id))
    .collect();
}

/** Every lease the caller may see, optionally only one status. */
export async function visibleLeases(
  ctx: Ctx,
  access: StayAccess,
  status?: Doc<"stayLeases">["status"]
): Promise<Doc<"stayLeases">[]> {
  if (access.seesAll) {
    if (status) {
      return ctx.db
        .query("stayLeases")
        .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", status))
        .collect();
    }
    return ctx.db
      .query("stayLeases")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .collect();
  }
  const mine = await ctx.db
    .query("stayLeases")
    .withIndex("by_org_manager", (q) => q.eq("orgId", access.orgId).eq("managerUserId", access.user._id))
    .collect();
  return status ? mine.filter((l) => l.status === status) : mine;
}

export function canSeeLease(access: StayAccess, lease: Pick<Doc<"stayLeases">, "orgId" | "managerUserId">): boolean {
  return lease.orgId === access.orgId && (access.seesAll || lease.managerUserId === access.user._id);
}

export { canSeeStayProperty };

// ── Lease chains ─────────────────────────────────────────────────────

/**
 * A lease and every lease it renewed, oldest first. Arrears left on an old
 * lease stay with the tenant after renewal, so payments and balances work
 * across the chain.
 */
export async function leaseChain(ctx: Ctx, lease: Doc<"stayLeases">): Promise<Doc<"stayLeases">[]> {
  const chain: Doc<"stayLeases">[] = [lease];
  let cur = lease;
  // Bounded walk; a chain of renewals is short in practice.
  for (let i = 0; i < 50 && cur.renewedFromLeaseId; i++) {
    const prev = await ctx.db.get(cur.renewedFromLeaseId);
    if (!prev || prev.orgId !== lease.orgId) break;
    chain.unshift(prev);
    cur = prev;
  }
  return chain;
}

export async function chargesForLeases(ctx: Ctx, leaseIds: Id<"stayLeases">[]): Promise<Doc<"stayCharges">[]> {
  const lists = await Promise.all(
    leaseIds.map((id) =>
      ctx.db
        .query("stayCharges")
        .withIndex("by_lease", (q) => q.eq("leaseId", id))
        .collect()
    )
  );
  return lists.flat();
}

export async function paymentsForLeases(ctx: Ctx, leaseIds: Id<"stayLeases">[]): Promise<Doc<"stayPayments">[]> {
  const lists = await Promise.all(
    leaseIds.map((id) =>
      ctx.db
        .query("stayPayments")
        .withIndex("by_lease", (q) => q.eq("leaseId", id))
        .collect()
    )
  );
  return lists.flat();
}

export async function depositForLease(ctx: Ctx, leaseId: Id<"stayLeases">): Promise<Doc<"stayDeposits"> | null> {
  return ctx.db
    .query("stayDeposits")
    .withIndex("by_lease", (q) => q.eq("leaseId", leaseId))
    .first();
}

// ── Audit ────────────────────────────────────────────────────────────

export async function stayAudit(
  ctx: MutationCtx,
  access: Pick<StayAccess, "user" | "orgId">,
  args: {
    action: string;
    description: string;
    targetType: string;
    targetId: string;
    targetLabel?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await recordAudit(ctx, {
    actorUserId: access.user._id,
    actorLabel: userLabel(access.user),
    category: "stay",
    orgId: access.orgId,
    ...args,
  });
}

// ── Hub contacts (landlords and tenants) ─────────────────────────────

export type PersonInput = {
  name: string;
  phone?: string;
  email?: string;
  entityKind?: "individual" | "company";
  idNumber?: string;
  company?: string;
  bankDetails?: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    branch?: string;
  };
};

function clean(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

/**
 * Org contacts that look like the same person, by phone or email. Stay warns
 * on these instead of silently creating a second record.
 */
export async function findLikelyDuplicates(
  ctx: Ctx,
  orgId: Id<"organizations">,
  phone: string | undefined,
  email: string | undefined
): Promise<Doc<"contacts">[]> {
  const found = new Map<string, Doc<"contacts">>();
  const normalized = phone ? normalizePhone(phone) : "";
  if (normalized.length >= 7) {
    const byPhone = await ctx.db
      .query("contacts")
      .withIndex("by_normalized_phone", (q) => q.eq("normalizedPhone", normalized))
      .take(20);
    for (const c of byPhone) if (c.orgId === orgId) found.set(c._id, c);
  }
  const e = email?.trim().toLowerCase();
  if (e && e.includes("@")) {
    const all = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    for (const c of all) if (c.email?.trim().toLowerCase() === e) found.set(c._id, c);
  }
  return [...found.values()];
}

/** Write the Stay-relevant fields onto a contact, leaving blanks untouched. */
function personPatch(p: PersonInput): Partial<Doc<"contacts">> {
  const patch: Partial<Doc<"contacts">> = {};
  if (clean(p.name)) patch.name = p.name.trim();
  if (clean(p.phone)) {
    patch.phone = p.phone!.trim();
    patch.normalizedPhone = normalizePhone(p.phone!);
  }
  if (clean(p.email)) patch.email = p.email!.trim();
  if (p.entityKind) patch.entityKind = p.entityKind;
  if (clean(p.idNumber)) patch.idNumber = p.idNumber!.trim();
  if (clean(p.company)) patch.company = p.company!.trim();
  if (p.bankDetails) {
    const b = {
      bankName: clean(p.bankDetails.bankName),
      accountName: clean(p.bankDetails.accountName),
      accountNumber: clean(p.bankDetails.accountNumber),
      branch: clean(p.bankDetails.branch),
    };
    if (Object.values(b).some(Boolean)) patch.bankDetails = b;
  }
  return patch;
}

/** Load an org contact for use in Stay, or throw. */
export async function getOrgContact(
  ctx: Ctx,
  orgId: Id<"organizations">,
  id: Id<"contacts">
): Promise<Doc<"contacts">> {
  const c = await ctx.db.get(id);
  if (!c || c.orgId !== orgId) throw new ConvexError("Contact not found");
  return c;
}

/**
 * Use an existing contact as a landlord (adding the role) or create one.
 * The landlord role is "both" when the person is already a seller.
 */
export async function upsertLandlord(
  ctx: MutationCtx,
  access: StayAccess,
  input: { existingContactId?: Id<"contacts">; person?: PersonInput }
): Promise<Id<"contacts">> {
  const now = Date.now();
  if (input.existingContactId) {
    const c = await getOrgContact(ctx, access.orgId, input.existingContactId);
    const ownerType = c.ownerType === "seller" || c.ownerType === "both" ? "both" : "landlord";
    await ctx.db.patch(c._id, { ...(input.person ? personPatch(input.person) : {}), ownerType, updatedAt: now });
    return c._id;
  }
  const p = input.person;
  if (!p || !clean(p.name)) throw new ConvexError("Landlord name is required");
  return ctx.db.insert("contacts", {
    ...personPatch(p),
    name: p.name.trim(),
    ownerType: "landlord",
    isBuyerTenant: false,
    entityKind: p.entityKind ?? "individual",
    ownerUserIds: [access.user._id],
    createdByUserId: access.user._id,
    orgId: access.orgId,
    createdAt: now,
    updatedAt: now,
  });
}

/** Use an existing contact as a lease tenant or create one. */
export async function upsertTenant(
  ctx: MutationCtx,
  access: StayAccess,
  input: { existingContactId?: Id<"contacts">; person?: PersonInput }
): Promise<Id<"contacts">> {
  const now = Date.now();
  if (input.existingContactId) {
    const c = await getOrgContact(ctx, access.orgId, input.existingContactId);
    await ctx.db.patch(c._id, { ...(input.person ? personPatch(input.person) : {}), isLeaseTenant: true, updatedAt: now });
    return c._id;
  }
  const p = input.person;
  if (!p || !clean(p.name)) throw new ConvexError("Tenant name is required");
  return ctx.db.insert("contacts", {
    ...personPatch(p),
    name: p.name.trim(),
    isLeaseTenant: true,
    // A lease tenant is not a CRM rental prospect; keep them out of Contacts.
    isBuyerTenant: false,
    entityKind: p.entityKind ?? "individual",
    ownerUserIds: [access.user._id],
    createdByUserId: access.user._id,
    orgId: access.orgId,
    createdAt: now,
    updatedAt: now,
  });
}

export function updatePersonPatch(p: PersonInput) {
  return personPatch(p);
}

/** Link a landlord to a Hub property the way the CRM Owners module does. */
export async function linkLandlordToProperty(
  ctx: MutationCtx,
  access: StayAccess,
  propertyId: Id<"properties">,
  contactId: Id<"contacts">
) {
  const existing = await ctx.db
    .query("propertyOwners")
    .withIndex("by_property_contact", (q) => q.eq("propertyId", propertyId).eq("contactId", contactId))
    .first();
  if (existing) {
    if (existing.role !== "landlord") await ctx.db.patch(existing._id, { role: "landlord" });
    return;
  }
  await ctx.db.insert("propertyOwners", {
    propertyId,
    contactId,
    role: "landlord",
    linkedByUserId: access.user._id,
    linkedAt: Date.now(),
    orgId: access.orgId,
  });
}

/** Display names for a set of ids, fetched once each. */
export async function nameMaps(
  ctx: Ctx,
  ids: { contacts?: Iterable<Id<"contacts">>; users?: Iterable<Id<"users">>; properties?: Iterable<Id<"properties">>; units?: Iterable<Id<"stayUnits">> }
) {
  const load = async <T extends "contacts" | "users" | "properties" | "stayUnits">(list?: Iterable<Id<T>>) => {
    const uniq = [...new Set(list ?? [])];
    const docs = await Promise.all(uniq.map((id) => ctx.db.get(id)));
    return new Map(uniq.map((id, i) => [id as string, docs[i]]));
  };
  const [contacts, users, properties, units] = await Promise.all([
    load(ids.contacts),
    load(ids.users),
    load(ids.properties),
    load(ids.units),
  ]);
  return {
    contact: (id: Id<"contacts"> | undefined) => (id ? (contacts.get(id) as Doc<"contacts"> | null | undefined) ?? null : null),
    user: (id: Id<"users"> | undefined) => (id ? (users.get(id) as Doc<"users"> | null | undefined) ?? null : null),
    property: (id: Id<"properties"> | undefined) => (id ? (properties.get(id) as Doc<"properties"> | null | undefined) ?? null : null),
    unit: (id: Id<"stayUnits"> | undefined) => (id ? (units.get(id) as Doc<"stayUnits"> | null | undefined) ?? null : null),
  };
}

/**
 * Names for a set of leases (tenant, unit, building), loaded once. Most list
 * screens show these three beside every row.
 */
export async function leaseLabels(ctx: Ctx, leases: Doc<"stayLeases">[]) {
  const sps = await Promise.all([...new Set(leases.map((l) => l.stayPropertyId))].map((id) => ctx.db.get(id)));
  const spMap = new Map(sps.filter(Boolean).map((sp) => [sp!._id as string, sp!]));
  const names = await nameMaps(ctx, {
    contacts: leases.flatMap((l) => [l.tenantContactId, l.landlordContactId]),
    users: leases.map((l) => l.managerUserId).filter((x): x is Id<"users"> => !!x),
    properties: [...spMap.values()].map((sp) => sp.propertyId),
    units: leases.map((l) => l.unitId),
  });
  return (l: Doc<"stayLeases">) => {
    const sp = spMap.get(l.stayPropertyId);
    const prop = names.property(sp?.propertyId);
    return {
      tenantName: names.contact(l.tenantContactId)?.name ?? "Unknown tenant",
      tenantEmail: names.contact(l.tenantContactId)?.email ?? null,
      tenantPhone: names.contact(l.tenantContactId)?.phone ?? null,
      landlordName: names.contact(l.landlordContactId)?.name ?? "Unknown landlord",
      managerName: l.managerUserId ? userLabel(names.user(l.managerUserId)) : null,
      unitLabel: names.unit(l.unitId)?.label ?? "Unit",
      propertyName: prop?.title ?? "Property",
      propertyAddress: prop?.location ?? "",
    };
  };
}

/** Visible-property guard for list filters passed from the client. */
export function propertyFilterOk(access: StayAccess, sp: Doc<"stayProperties"> | null): sp is Doc<"stayProperties"> {
  return canSeeStayProperty(access, sp);
}

// ── Units and agency ─────────────────────────────────────────────────

/**
 * Unit status follows its leases (BRD ST-05): vacant without an active lease,
 * "notice" once the tenant has given notice, otherwise occupied.
 */
export async function refreshUnitStatus(ctx: MutationCtx, unitId: Id<"stayUnits">) {
  const unit = await ctx.db.get(unitId);
  if (!unit) return;
  const active = (
    await ctx.db
      .query("stayLeases")
      .withIndex("by_unit", (q) => q.eq("unitId", unitId))
      .collect()
  ).filter((l) => l.status === "active");
  const status: Doc<"stayUnits">["status"] = !active.length
    ? "vacant"
    : active.some((l) => l.noticeGivenOn)
      ? "notice"
      : "occupied";
  if (unit.status !== status) await ctx.db.patch(unitId, { status, updatedAt: Date.now() });
}

/** Agency details printed on receipts, statements and emails. */
export function agencyOf(org: Doc<"organizations">) {
  return {
    name: org.name,
    address: org.address ?? undefined,
    phone: org.phone ?? undefined,
    email: org.email ?? undefined,
  };
}

// ── Balances and statements ──────────────────────────────────────────

/**
 * Balance and running statement for a renewal chain (one currency). The
 * balance is everything owed less lease credit; `overdue` counts only
 * charges whose due date has arrived.
 */
export async function chainAccount(ctx: Ctx, chain: Doc<"stayLeases">[], today: string) {
  const ids = chain.map((l) => l._id);
  const latest = chain[chain.length - 1];
  const [charges, payments, deposit] = await Promise.all([
    chargesForLeases(ctx, ids),
    paymentsForLeases(ctx, ids),
    depositForLease(ctx, latest._id),
  ]);
  const rentPayments = payments.filter((p) => p.purpose === "rent");
  const depositApplied = (deposit?.movements ?? [])
    .filter((m) => m.kind === "applied")
    .map((m) => ({ date: m.date, amount: m.amount, at: m.at }));
  const statement = buildStatement(
    charges.map((c) => ({
      id: c._id,
      date: c.dueDate,
      description: c.description,
      amount: c.amount,
      status: c.status,
      createdAt: c.createdAt,
    })),
    rentPayments.map((p) => ({
      id: p._id,
      date: p.paidOn,
      receiptNumber: p.receiptNumber,
      amount: p.amount,
      method: p.method,
      createdAt: p.createdAt,
      reversedOn: p.reversedAt ? todayIn(DEFAULT_TIMEZONE, p.reversedAt) : undefined,
      reverseReason: p.reverseReason,
    })),
    depositApplied
  );
  let owed = 0;
  let overdue = 0;
  let oldestOverdue: string | null = null;
  for (const c of charges) {
    if (c.status === "cancelled") continue;
    const o = outstanding(c);
    owed = round2(owed + o);
    if (o > 0 && c.dueDate <= today) {
      overdue = round2(overdue + o);
      if (!oldestOverdue || c.dueDate < oldestOverdue) oldestOverdue = c.dueDate;
    }
  }
  const credit = latest.creditBalance ?? 0;
  return {
    currency: latest.currency,
    charges,
    payments,
    deposit,
    statement,
    owed,
    credit,
    balance: round2(owed - credit),
    overdue,
    oldestOverdue,
  };
}

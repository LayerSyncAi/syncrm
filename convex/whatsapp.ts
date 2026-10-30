/**
 * The backend of the SynCRM for WhatsApp browser extension (the
 * LayerSyncAi/syncrm-whatsapp repo). A chat links to a lead by phone number:
 * the extension signs in as the agent, so everything here uses their session
 * and the CRM's usual access rules.
 *
 * Follow-ups need nothing here: the extension calls activities.createForLead,
 * so they remind the agent like any other task.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { computeAndStoreScore } from "./leadScoring";
import { MIN_DUPLICATE_PHONE_DIGITS } from "./lib/contactRoles";
import { requireModuleUser } from "./lib/moduleAccess";
import { internationalDigits, phoneVariants, pickOpenLead } from "./lib/whatsappLeads";
import { checkRateLimit } from "./rateLimit";

const MAX_PHONES = 100;
const MAX_TRANSCRIPT_CHARS = 20000;
// normalizedPhone indexes are not org-scoped, so leave room for other agencies'
// rows on the same number.
const PHONE_SCAN = 20;
const LEADS_PER_CONTACT = 50;
const ACTIVITIES_PER_LEAD = 200;

/** Everything the org holds on a number, whoever owns it. */
async function findByPhone(ctx: QueryCtx, orgId: Id<"organizations">, phone: string) {
  const contacts = new Map<Id<"contacts">, Doc<"contacts">>();
  const leads = new Map<Id<"leads">, Doc<"leads">>();

  for (const variant of phoneVariants(phone)) {
    const [contactRows, leadRows] = await Promise.all([
      ctx.db
        .query("contacts")
        .withIndex("by_normalized_phone", (q) => q.eq("normalizedPhone", variant))
        .take(PHONE_SCAN),
      ctx.db
        .query("leads")
        .withIndex("by_normalized_phone", (q) => q.eq("normalizedPhone", variant))
        .take(PHONE_SCAN),
    ]);
    for (const c of contactRows) if (c.orgId === orgId) contacts.set(c._id, c);
    for (const l of leadRows) if (l.orgId === orgId) leads.set(l._id, l);
  }

  // A lead copies its contact's number, so either side can be out of date.
  for (const lead of leads.values()) {
    const contact = await ctx.db.get(lead.contactId);
    if (contact) contacts.set(contact._id, contact);
  }
  for (const contact of contacts.values()) {
    const rows = await ctx.db
      .query("leads")
      .withIndex("by_contact", (q) => q.eq("contactId", contact._id))
      .take(LEADS_PER_CONTACT);
    for (const l of rows) if (l.orgId === orgId) leads.set(l._id, l);
  }

  return { contacts: [...contacts.values()], leads: [...leads.values()] };
}

function canOpenLead(lead: Doc<"leads">, user: Doc<"users">) {
  return user.role === "admin" || lead.ownerUserId === user._id;
}

async function ownerName(ctx: QueryCtx, userId: Id<"users">) {
  const owner = await ctx.db.get(userId);
  return owner?.fullName || owner?.name || "another agent";
}

/**
 * What the CRM knows about the number in the open chat. Like the duplicate
 * warnings, this names a colleague's lead without opening it, so nobody
 * creates a second record for the same person.
 */
export const lookup = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireModuleUser(ctx, "crm");
    const { contacts, leads } = await findByPhone(ctx, user.orgId, args.phone);

    const lead = pickOpenLead(leads, user._id);
    if (lead && !canOpenLead(lead, user)) {
      return { status: "other_agent" as const, ownerName: await ownerName(ctx, lead.ownerUserId) };
    }
    if (lead) {
      const stage = await ctx.db.get(lead.stageId);
      const activities = await ctx.db
        .query("activities")
        .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
        .take(ACTIVITIES_PER_LEAD);
      const followUps = activities
        .filter((a) => a.status === "todo" && a.scheduledAt)
        .map((a) => a.scheduledAt as number)
        .sort((a, b) => a - b);
      return {
        status: "lead" as const,
        lead: {
          _id: lead._id,
          fullName: lead.fullName,
          interestType: lead.interestType,
          stageName: stage?.name ?? "Unknown",
          ownerName: await ownerName(ctx, lead.ownerUserId),
          nextFollowUpAt: followUps[0] ?? null,
        },
      };
    }

    const contact = contacts[0];
    return contact
      ? { status: "contact" as const, name: contact.name }
      : { status: "new" as const };
  },
});

/** Which of these numbers the org already has, to spot enquiries with no lead. */
export const knownPhones = query({
  args: { phones: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { user } = await requireModuleUser(ctx, "crm");
    const known: string[] = [];
    for (const phone of args.phones.slice(0, MAX_PHONES)) {
      const rows = await Promise.all(
        phoneVariants(phone).flatMap((variant) => [
          ctx.db
            .query("contacts")
            .withIndex("by_normalized_phone", (q) => q.eq("normalizedPhone", variant))
            .take(PHONE_SCAN),
          ctx.db
            .query("leads")
            .withIndex("by_normalized_phone", (q) => q.eq("normalizedPhone", variant))
            .take(PHONE_SCAN),
        ])
      );
      if (rows.flat().some((row) => row.orgId === user.orgId)) known.push(phone);
    }
    return known;
  },
});

/**
 * Add a lead from a chat. Reuses the person's contact when they have one and
 * returns the existing open lead rather than creating a second.
 */
export const createLead = mutation({
  args: {
    phone: v.string(),
    name: v.string(),
    interestType: v.union(v.literal("rent"), v.literal("buy")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireModuleUser(ctx, "crm");
    await checkRateLimit(ctx, "leadCreate", user._id);

    const name = args.name.trim();
    if (!name) throw new ConvexError("Enter a name");
    const digits = internationalDigits(args.phone);
    if (digits.length < MIN_DUPLICATE_PHONE_DIGITS) throw new ConvexError("Enter a valid phone number");

    const { contacts, leads } = await findByPhone(ctx, user.orgId, digits);
    const existing = pickOpenLead(leads, user._id);
    if (existing) {
      if (canOpenLead(existing, user)) return existing._id;
      throw new ConvexError(`Already with ${await ownerName(ctx, existing.ownerUserId)}`);
    }

    const stages = await ctx.db
      .query("pipelineStages")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId))
      .take(50);
    stages.sort((a, b) => a.order - b.order);
    const stage = stages.find((s) => !s.isTerminal);
    if (!stage) throw new ConvexError("No pipeline stages configured");

    const now = Date.now();
    let contact = contacts.find((c) => c.ownerUserIds.includes(user._id)) ?? contacts[0];
    if (contact) {
      // A past client or a landlord is enquiring, so whoever is talking to
      // them needs the contact and it now belongs in Contacts as well.
      await ctx.db.patch(contact._id, {
        ownerUserIds: contact.ownerUserIds.includes(user._id)
          ? contact.ownerUserIds
          : [...contact.ownerUserIds, user._id],
        isBuyerTenant: true,
        updatedAt: now,
      });
    } else {
      const contactId = await ctx.db.insert("contacts", {
        name,
        phone: `+${digits}`,
        normalizedPhone: digits,
        interestType: args.interestType,
        isBuyerTenant: true,
        ownerUserIds: [user._id],
        createdByUserId: user._id,
        orgId: user.orgId,
        createdAt: now,
        updatedAt: now,
      });
      contact = (await ctx.db.get(contactId))!;
    }

    const leadId = await ctx.db.insert("leads", {
      contactId: contact._id,
      fullName: contact.name,
      phone: contact.phone,
      normalizedPhone: contact.normalizedPhone,
      email: contact.email,
      source: "whatsapp",
      interestType: args.interestType,
      preferredAreas: [],
      notes: "",
      stageId: stage._id,
      ownerUserId: user._id,
      orgId: user.orgId,
      createdAt: now,
      updatedAt: now,
    });
    await computeAndStoreScore(ctx, leadId, user.orgId);
    return leadId;
  },
});

/** Keep the messages an agent chose to save on the lead's timeline. */
export const saveChat = mutation({
  args: {
    leadId: v.id("leads"),
    transcript: v.string(),
    messageCount: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireModuleUser(ctx, "crm");
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.orgId !== user.orgId || !canOpenLead(lead, user)) {
      throw new ConvexError("Lead not found");
    }
    const transcript = args.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
    if (!transcript) throw new ConvexError("There are no new messages to save");

    const now = Date.now();
    const activityId = await ctx.db.insert("activities", {
      leadId: lead._id,
      contactId: lead.contactId,
      type: "whatsapp",
      title: `WhatsApp chat (${args.messageCount} ${args.messageCount === 1 ? "message" : "messages"})`,
      description: transcript,
      completedAt: now,
      status: "completed",
      assignedToUserId: user._id,
      createdByUserId: user._id,
      orgId: user.orgId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(lead._id, {
      lastActivityAt: now,
      activityCount: (lead.activityCount ?? 0) + 1,
      updatedAt: now,
    });
    return activityId;
  },
});

/**
 * Bulk sends and the correspondence log.
 *
 * Recipients come from captured data (an audience) or from an imported list.
 * Each audience returns people with the values the message placeholders use
 * ({name}, {owed}, {overdue}, {nextDue}, {nextDueDate}, {item}). The compose
 * screen previews every message before anything is sent.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { userCanUseModule } from "../lib/modules";
import { dateLabel, formatAmount, outstanding } from "../stay/ledger";
import { leaseLabels, nameMaps, todayForOrg, userLabel } from "../stay/shared";
import { round2 } from "../finance/lib";
import { queueMessages, requireNotify } from "./send";
import { fillTemplate } from "./lib";

type Recipient = { key: string; name: string; email: string; phone: string; currency?: string; amount?: number; values: Record<string, string> };

const audienceArg = v.union(
  v.literal("contacts"),
  v.literal("staff"),
  v.literal("instalments"),
  v.literal("invoices"),
  v.literal("tenants")
);

/** Which audiences the caller may use, by the modules they can open. */
export const audiences = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireNotify(ctx);
    const finance = userCanUseModule(access.user, access.org, "finance") && (access.user.role === "admin" || !!access.user.estateRoles?.includes("accounts"));
    // Buyers on payment plans live in SyncDev and Finance alike.
    const instalments = finance || userCanUseModule(access.user, access.org, "dev");
    const stay = userCanUseModule(access.user, access.org, "stay");
    return [
      { key: "contacts", label: "Contacts", hint: "Clients captured in the Hub", available: true },
      { key: "staff", label: "Staff", hint: "Internal: your team", available: access.user.role === "admin" },
      { key: "instalments", label: "Clients on instalments", hint: "Paid, owed and overdue on payment plans", available: instalments },
      { key: "invoices", label: "Unpaid invoices", hint: "Clients with invoices still open", available: finance },
      { key: "tenants", label: "Tenants in arrears", hint: "Rent overdue in SyncStay", available: stay },
    ];
  },
});

/** The people in an audience, with their placeholder values. */
export const recipients = query({
  args: {
    audience: audienceArg,
    // contacts: all, landlords, tenants or sellers. Others: overdue only.
    filter: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Recipient[]> => {
    const access = await requireNotify(ctx);
    const org = access.org;
    const today = await todayForOrg(ctx, access.orgId);
    const agency = org.name;
    const out: Recipient[] = [];
    const finance = userCanUseModule(access.user, org, "finance") && (access.user.role === "admin" || !!access.user.estateRoles?.includes("accounts"));
    const instalments = finance || userCanUseModule(access.user, org, "dev");

    if (args.audience === "contacts") {
      const contacts = await ctx.db
        .query("contacts")
        .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
        .collect();
      const f = args.filter ?? "all";
      for (const c of contacts) {
        if (f === "landlords" && c.ownerType !== "landlord" && c.ownerType !== "both") continue;
        if (f === "sellers" && c.ownerType !== "seller" && c.ownerType !== "both") continue;
        if (f === "tenants" && !c.isLeaseTenant) continue;
        if (!c.email && !c.phone) continue;
        out.push({ key: c._id, name: c.name, email: c.email ?? "", phone: c.phone ?? "", values: { name: c.name, agency } });
      }
    } else if (args.audience === "staff") {
      if (access.user.role !== "admin") throw new ConvexError("Only directors can message all staff");
      const users = await ctx.db
        .query("users")
        .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
        .collect();
      for (const u of users.filter((x) => x.isActive)) {
        out.push({ key: u._id, name: userLabel(u), email: u.email ?? "", phone: "", values: { name: userLabel(u), agency } });
      }
    } else if (args.audience === "instalments") {
      if (!instalments) throw new ConvexError("SyncDev or SyncFinance is needed for clients on instalments");
      const devs = new Map(
        (await ctx.db.query("finDevelopments").withIndex("by_org", (q) => q.eq("orgId", access.orgId)).collect()).map((d) => [d._id as string, d])
      );
      const stands = await ctx.db
        .query("finStands")
        .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
        .collect();
      for (const s of stands) {
        if (s.status !== "active" || s.balance <= 0) continue;
        if (args.filter === "overdue" && s.overdue <= 0) continue;
        const c = s.currency;
        out.push({
          key: s._id,
          name: s.buyerName,
          email: s.buyerEmail ?? "",
          phone: s.buyerPhone ?? "",
          currency: c,
          amount: s.overdue || s.balance,
          values: {
            name: s.buyerName,
            owed: formatAmount(s.balance, c),
            overdue: formatAmount(s.overdue, c),
            paid: formatAmount(s.paidToDate, c),
            nextDue: s.nextDueAmount ? formatAmount(s.nextDueAmount, c) : "",
            nextDueDate: s.nextDueDate ? dateLabel(s.nextDueDate) : "",
            item: `Stand ${s.standNumber}, ${devs.get(s.developmentId)?.name ?? ""}`.trim(),
            agency,
          },
        });
      }
    } else if (args.audience === "invoices") {
      if (!finance) throw new ConvexError("SyncFinance is not available to you");
      const invs = (
        await Promise.all(
          (["unpaid", "part_paid"] as const).map((st) =>
            ctx.db
              .query("finInvoices")
              .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", st))
              .collect()
          )
        )
      ).flat();
      // One message per client and currency, listing their invoices.
      const by = new Map<string, Doc<"finInvoices">[]>();
      for (const i of invs) {
        const k = `${i.contactId ?? i.clientName.toLowerCase()}|${i.currency}`;
        by.set(k, [...(by.get(k) ?? []), i]);
      }
      const names = await nameMaps(ctx, { contacts: invs.map((i) => i.contactId).filter((x): x is Id<"contacts"> => !!x) });
      for (const [k, list] of by) {
        const first = list[0];
        const c = first.currency;
        const owed = round2(list.reduce((s, i) => s + i.total - i.amountPaid, 0));
        const overdue = round2(list.filter((i) => i.dueDate < today).reduce((s, i) => s + i.total - i.amountPaid, 0));
        if (args.filter === "overdue" && overdue <= 0) continue;
        const contact = names.contact(first.contactId);
        out.push({
          key: k,
          name: first.clientName,
          email: first.clientEmail ?? contact?.email ?? "",
          phone: contact?.phone ?? "",
          currency: c,
          amount: owed,
          values: {
            name: first.clientName,
            owed: formatAmount(owed, c),
            overdue: formatAmount(overdue, c),
            nextDue: "",
            nextDueDate: dateLabel(list.map((i) => i.dueDate).sort()[0]),
            item: `Invoice ${list.map((i) => i.number).join(", ")}`,
            agency,
          },
        });
      }
    } else {
      if (!userCanUseModule(access.user, org, "stay")) throw new ConvexError("SyncStay is not available to you");
      const charges = (
        await Promise.all(
          (["unpaid", "part_paid"] as const).map((st) =>
            ctx.db
              .query("stayCharges")
              .withIndex("by_org_status", (q) => q.eq("orgId", access.orgId).eq("status", st))
              .collect()
          )
        )
      ).flat();
      const byLease = new Map<string, typeof charges>();
      for (const ch of charges) byLease.set(ch.leaseId, [...(byLease.get(ch.leaseId) ?? []), ch]);
      const leases = (await Promise.all([...byLease.keys()].map((id) => ctx.db.get(id as Id<"stayLeases">)))).filter((l): l is Doc<"stayLeases"> => !!l);
      const label = await leaseLabels(ctx, leases);
      for (const l of leases) {
        const list = byLease.get(l._id)!;
        const overdue = round2(list.filter((ch) => ch.dueDate <= today).reduce((s, ch) => s + outstanding(ch), 0));
        if (overdue <= 0) continue;
        const owed = round2(list.reduce((s, ch) => s + outstanding(ch), 0));
        const next = list.filter((ch) => ch.dueDate > today).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
        const lab = label(l);
        out.push({
          key: l._id,
          name: lab.tenantName,
          email: lab.tenantEmail ?? "",
          phone: lab.tenantPhone ?? "",
          currency: l.currency,
          amount: overdue,
          values: {
            name: lab.tenantName,
            owed: formatAmount(owed, l.currency),
            overdue: formatAmount(overdue, l.currency),
            nextDue: next ? formatAmount(outstanding(next), l.currency) : "",
            nextDueDate: next ? dateLabel(next.dueDate) : "",
            item: `${lab.propertyName}, ${lab.unitLabel}`,
            agency,
          },
        });
      }
    }
    return out.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0) || a.name.localeCompare(b.name));
  },
});

/** Send one message per recipient, each filled from the template. */
export const send = mutation({
  args: {
    name: v.string(),
    channel: v.union(v.literal("email"), v.literal("sms"), v.literal("preferred")),
    audience: v.string(),
    subject: v.optional(v.string()),
    template: v.string(),
    recipients: v.array(
      v.object({
        name: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        values: v.record(v.string(), v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const access = await requireNotify(ctx);
    const template = args.template.trim();
    if (!template) throw new ConvexError("Write the message");
    if (!args.recipients.length) throw new ConvexError("Pick at least one recipient");
    if (args.recipients.length > 1000) throw new ConvexError("Send to at most 1,000 people at a time");
    if (args.channel !== "sms" && !args.subject?.trim() && args.channel === "email") throw new ConvexError("Add a subject for the email");
    const campaignId = await ctx.db.insert("notifyCampaigns", {
      orgId: access.orgId,
      name: args.name.trim() || `${args.audience} ${new Date().toISOString().slice(0, 10)}`,
      channel: args.channel === "sms" ? "sms" : "email",
      audience: args.audience,
      subject: args.subject?.trim() || undefined,
      template,
      total: args.recipients.length,
      createdByUserId: access.user._id,
      createdAt: Date.now(),
    });
    const res = await queueMessages(
      ctx,
      access.orgId,
      args.recipients.map((r) => {
        const values = { agency: access.org.name, ...r.values, name: r.values.name ?? r.name };
        return {
          channel: args.channel,
          name: r.name,
          email: r.email,
          phone: r.phone,
          subject: args.subject ? fillTemplate(args.subject.trim(), values) : undefined,
          body: fillTemplate(template, values),
          source: "notify",
          kind: "campaign",
          campaignId,
          createdByUserId: access.user._id,
        };
      })
    );
    return { campaignId, ...res };
  },
});

/** Bulk sends with how each went. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireNotify(ctx);
    const rows = await ctx.db
      .query("notifyCampaigns")
      .withIndex("by_org", (q) => q.eq("orgId", access.orgId))
      .order("desc")
      .take(50);
    const names = await nameMaps(ctx, { users: rows.map((r) => r.createdByUserId) });
    const out = [];
    for (const c of rows) {
      const msgs = await ctx.db
        .query("notifyMessages")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect();
      const count = (s: string) => msgs.filter((m) => m.status === s).length;
      out.push({ ...c, by: userLabel(names.user(c.createdByUserId)), sent: count("sent"), logged: count("logged"), queued: count("queued"), failed: count("failed"), sms: msgs.filter((m) => m.channel === "sms").length });
    }
    return out;
  },
});

/**
 * The correspondence log: SyncNotify messages and the emails modules send
 * themselves (receipts, statements, reminders), newest first.
 */
export const log = query({
  args: {
    channel: v.optional(v.union(v.literal("email"), v.literal("sms"))),
    status: v.optional(v.union(v.literal("ok"), v.literal("failed"), v.literal("queued"))),
    campaignId: v.optional(v.id("notifyCampaigns")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireNotify(ctx);
    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
    const msgs = args.campaignId
      ? await ctx.db
          .query("notifyMessages")
          .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
          .collect()
      : await ctx.db
          .query("notifyMessages")
          .withIndex("by_org_created", (q) => q.eq("orgId", access.orgId))
          .order("desc")
          .take(limit);
    const rows = msgs
      .filter((m) => m.orgId === access.orgId)
      .map((m) => ({
        _id: m._id as string,
        at: m.createdAt,
        channel: m.channel,
        to: m.to,
        name: m.name,
        subject: m.subject ?? "",
        body: m.body,
        status: m.status,
        error: m.error ?? "",
        source: m.source,
        kind: m.kind,
      }));
    if (!args.campaignId && args.channel !== "sms") {
      const emails = await ctx.db
        .query("emailLogs")
        .withIndex("by_org_created", (q) => q.eq("orgId", access.orgId))
        .order("desc")
        .take(limit);
      for (const e of emails) {
        // SyncNotify emails are already listed from their own rows.
        if (e.kind.startsWith("notify_")) continue;
        rows.push({
          _id: e._id,
          at: e.createdAt,
          channel: "email",
          to: e.to,
          name: "",
          subject: e.subject,
          body: "",
          status: e.status === "dev_logged" ? "logged" : e.status,
          error: e.error ?? "",
          source: e.kind.split("_")[0] || "system",
          kind: e.kind,
        });
      }
    }
    return rows
      .filter((r) => !args.channel || r.channel === args.channel)
      .filter((r) => !args.status || (args.status === "ok" ? r.status === "sent" || r.status === "logged" : r.status === args.status))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  },
});

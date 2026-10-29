/**
 * Hub global search (HB-21): contacts and properties across the agency, for
 * the command palette. Visibility matches the CRM lists exactly: agents see
 * the contacts they own (contacts.list) and every non-draft property, which
 * is org-shared; an admin in Agent Mode narrows both to their own
 * (properties.list).
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { getCurrentUserWithOrg, isEffectiveAdmin } from "./helpers";
import { normalizePhone } from "./contacts";
import { isBuyerTenantContact } from "./lib/contactRoles";
import { ownsPropertyForAgentMode } from "./viewingFormLib";

const LIMIT = 8;
// Search results are relevance-ordered and then filtered for visibility, so
// read past the limit to leave room for rows the caller cannot see.
const SCAN = 50;

export const global = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const q = args.q.trim();
    if (q.length < 2) return { contacts: [], properties: [] };

    const isAdmin = isEffectiveAdmin(user);
    const canSeeContact = (c: Doc<"contacts">) => isAdmin || c.ownerUserIds.includes(user._id);

    const contacts = new Map<string, Doc<"contacts">>();
    // A query that is mostly digits is a phone number: match it exactly first.
    const digits = normalizePhone(q);
    if (digits.length >= 7 && /^[\d\s()+-]+$/.test(q)) {
      const byPhone = await ctx.db
        .query("contacts")
        .withIndex("by_normalized_phone", (ix) => ix.eq("normalizedPhone", digits))
        .take(SCAN);
      for (const c of byPhone) {
        if (c.orgId === user.orgId && canSeeContact(c)) contacts.set(c._id, c);
      }
    }
    const byName = await ctx.db
      .query("contacts")
      .withSearchIndex("search_name", (s) => s.search("name", q).eq("orgId", user.orgId))
      .take(SCAN);
    for (const c of byName) {
      if (contacts.size >= LIMIT) break;
      if (canSeeContact(c)) contacts.set(c._id, c);
    }

    const restrictToOwn = user.role === "admin" && !!user.agentMode;
    const canSeeProperty = (p: Doc<"properties">) =>
      !p.isDraft && (!restrictToOwn || ownsPropertyForAgentMode(p, user._id));
    const properties = new Map<string, Doc<"properties">>();
    for (const index of ["search_title", "search_location"] as const) {
      if (properties.size >= LIMIT) break;
      const rows = await ctx.db
        .query("properties")
        .withSearchIndex(index, (s) =>
          (index === "search_title" ? s.search("title", q) : s.search("location", q)).eq("orgId", user.orgId)
        )
        .take(SCAN);
      for (const p of rows) {
        if (properties.size >= LIMIT) break;
        if (canSeeProperty(p)) properties.set(p._id, p);
      }
    }

    return {
      contacts: [...contacts.values()].slice(0, LIMIT).map((c) => ({
        _id: c._id,
        name: c.name,
        detail: [c.phone, c.email, c.company].filter(Boolean).join(" · "),
        // Owner-only contacts live under Owners; everyone else under Contacts.
        href: isBuyerTenantContact(c) ? `/app/contacts/${c._id}` : `/app/owners/${c._id}`,
      })),
      properties: [...properties.values()].map((p) => ({
        _id: p._id,
        title: p.title,
        detail: p.location,
        href: `/app/properties?property=${p._id}`,
      })),
    };
  },
});

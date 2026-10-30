/**
 * Portal logins for landlords and tenants (BRD Hub HB-13, Stay §3).
 *
 * The agency invites; there is no public sign-up. An invite creates (or
 * re-issues) a portal account with a one-off random password, forced to
 * change on first sign-in, and emails it with the login link. One email is
 * one login across Sync Estate, so an address already used by a staff
 * account or another portal account is refused.
 */
import { action, internalMutation, mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { Scrypt } from "lucia";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { recordAudit } from "../logs";
import { randomPassword, rebuildPasswordAccount } from "../lib/authReconcile";
import { canSeeStayProperty, requireStay, StayAccess } from "../stay/access";
import { sendEmail } from "../email";
import {
  ACCENTS,
  detailCard,
  emailButton,
  emailEyebrow,
  emailHeading,
  emailText,
  escapeHtml,
  renderEmailShell,
} from "../emailLayout";

const portalKindValidator = v.union(v.literal("landlord"), v.literal("tenant"));
type PortalKind = "landlord" | "tenant";

/** The contact must be a landlord or tenant on a property the caller can see. */
async function assertContactInScope(
  ctx: QueryCtx | MutationCtx,
  access: StayAccess,
  contact: Doc<"contacts">,
  kind: PortalKind
) {
  if (contact.orgId !== access.orgId) throw new ConvexError("Contact not found");
  if (kind === "tenant") {
    const leases = await ctx.db
      .query("stayLeases")
      .withIndex("by_tenant", (q) => q.eq("tenantContactId", contact._id))
      .take(50);
    const visible = leases.some(
      (l) => l.orgId === access.orgId && (access.seesAll || l.managerUserId === access.user._id)
    );
    if (!visible) throw new ConvexError("This contact has no lease you manage");
  } else {
    const props = await ctx.db
      .query("stayProperties")
      .withIndex("by_landlord", (q) => q.eq("landlordContactId", contact._id))
      .take(50);
    if (!props.some((p) => canSeeStayProperty(access, p))) {
      throw new ConvexError("This contact owns no property you manage");
    }
  }
}

async function portalUserFor(ctx: QueryCtx | MutationCtx, contactId: Id<"contacts">) {
  return await ctx.db
    .query("users")
    .withIndex("by_portal_contact", (q) => q.eq("portalContactId", contactId))
    .first();
}

/** Portal login status for a contact, for the staff screens. */
export const getForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.orgId !== access.orgId) return null;
    const u = await portalUserFor(ctx, contact._id);
    if (!u) return { status: "none" as const, email: contact.email ?? null };
    return {
      status: !u.isActive
        ? ("deactivated" as const)
        : u.resetPasswordOnNextLogin
          ? ("invited" as const)
          : ("active" as const),
      email: u.email ?? null,
      kind: u.portalKind,
      userId: u._id,
    };
  },
});

export const createInviteInternal = internalMutation({
  args: { contactId: v.id("contacts"), kind: portalKindValidator, passwordHash: v.string() },
  handler: async (ctx, args) => {
    // Runs with the inviting staff member's identity (propagated from the action).
    const access = await requireStay(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new ConvexError("Contact not found");
    await assertContactInScope(ctx, access, contact, args.kind);
    const email = contact.email?.trim().toLowerCase();
    if (!email) throw new ConvexError("Add an email address to this contact first");

    const now = Date.now();
    // One portal login per contact: re-inviting reuses it, even if the
    // contact's email has changed since the last invite.
    const byContact = await portalUserFor(ctx, contact._id);
    if (byContact && (byContact.portalOrgId !== access.orgId || byContact.portalKind !== args.kind)) {
      throw new ConvexError(`This contact already has a ${byContact.portalKind} portal login`);
    }
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (byEmail && byEmail._id !== byContact?._id) {
      throw new ConvexError("This email already has a Sync Estate login");
    }
    const existing = byContact;
    let userId: Id<"users">;
    if (existing) {
      userId = existing._id;
      if (existing.email && existing.email !== email) {
        // The old address must stop working: drop its password sign-in.
        const old = await ctx.db
          .query("authAccounts")
          .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
          .take(10);
        for (const a of old) {
          if (a.providerAccountId !== email) await ctx.db.delete(a._id);
        }
      }
      await ctx.db.patch(userId, { email, isActive: true, resetPasswordOnNextLogin: true, updatedAt: now });
    } else {
      userId = await ctx.db.insert("users", {
        email,
        fullName: contact.name,
        name: contact.name,
        // Required by the schema; meaningless for a portal account, which has
        // no orgId and so never passes a staff role check.
        role: "agent",
        isActive: true,
        portalKind: args.kind,
        portalContactId: contact._id,
        portalOrgId: access.orgId,
        resetPasswordOnNextLogin: true,
        showOnboardingInterface: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    await rebuildPasswordAccount(ctx, { email, liveUserId: userId, passwordHash: args.passwordHash });

    await recordAudit(ctx, {
      actorUserId: access.user._id,
      actorLabel: access.user.fullName || access.user.name || access.user.email,
      action: existing ? "portal.reinvite" : "portal.invite",
      category: "stay",
      description: `${existing ? "Re-sent" : "Sent"} ${args.kind} portal invite to ${contact.name} (${email})`,
      targetType: "contact",
      targetId: contact._id,
      targetLabel: contact.name,
      metadata: { kind: args.kind },
      orgId: access.orgId,
    });
    return { email, name: contact.name, orgName: access.org.name, userId };
  },
});

/** Invite (or re-invite) a landlord or tenant to their portal. */
export const invite = action({
  args: { contactId: v.id("contacts"), kind: portalKindValidator },
  handler: async (ctx, args): Promise<{ email: string; emailed: boolean }> => {
    const password = randomPassword();
    const passwordHash = await new Scrypt().hash(password);
    const result = await ctx.runMutation(internal.portal.accounts.createInviteInternal, {
      contactId: args.contactId,
      kind: args.kind,
      passwordHash,
    });

    const siteUrl = process.env.SITE_URL || "http://localhost:3000";
    const loginUrl = `${siteUrl}/login`;
    const { accent, tint } = ACCENTS.blue;
    const what =
      args.kind === "tenant"
        ? "your lease, balance, receipts and documents, and log maintenance requests"
        : "your properties, tenants, rent collected, maintenance and statements";
    const content =
      emailEyebrow(`${escapeHtml(result.orgName)} portal`, accent, tint) +
      emailHeading(`Hello ${escapeHtml(result.name)}`) +
      emailText(`${escapeHtml(result.orgName)} has set up a portal login for you. You can see ${what}.`) +
      detailCard([
        { label: "Email", value: escapeHtml(result.email) },
        { label: "Temporary password", value: escapeHtml(password) },
      ]) +
      emailButton({ href: loginUrl, label: "Sign in", accentColor: accent }) +
      emailText("You will be asked to choose your own password when you first sign in.");
    const sent = await sendEmail(
      {
        to: result.email,
        subject: `Your ${result.orgName} portal login`,
        html: renderEmailShell({ accentColor: accent, preheader: "Your portal login", content }),
        text: `${result.orgName} has set up a portal login for you.\n\nSign in at ${loginUrl}\nEmail: ${result.email}\nTemporary password: ${password}\n\nYou will be asked to choose your own password when you first sign in.`,
      },
      ctx,
      { kind: "portal_invite", relatedType: "contact", relatedId: args.contactId }
    );
    return { email: result.email, emailed: sent.success };
  },
});

/** Switch a portal login off. Their records stay; the login stops at once. */
export const revoke = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const access = await requireStay(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.orgId !== access.orgId) throw new ConvexError("Contact not found");
    const u = await portalUserFor(ctx, contact._id);
    if (!u || u.portalOrgId !== access.orgId) throw new ConvexError("No portal login for this contact");
    await assertContactInScope(ctx, access, contact, u.portalKind ?? "tenant");
    await ctx.db.patch(u._id, { isActive: false, updatedAt: Date.now() });
    await recordAudit(ctx, {
      actorUserId: access.user._id,
      actorLabel: access.user.fullName || access.user.name || access.user.email,
      action: "portal.revoke",
      category: "stay",
      description: `Switched off the ${u.portalKind} portal login for ${contact.name}`,
      targetType: "contact",
      targetId: contact._id,
      targetLabel: contact.name,
      orgId: access.orgId,
    });
  },
});

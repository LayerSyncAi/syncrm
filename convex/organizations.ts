import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserOptional, getCurrentUserWithOrg } from "./helpers";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

// Called after signup to create an org and assign it to the new user. Legal
// acceptance is recorded in the same mutation so it is atomic with org creation
// and enforced server-side (sign-up cannot create an org without it).
export const setupOrganization = mutation({
  args: {
    orgName: v.string(),
    acceptedLegal: v.array(
      v.object({
        documentType: v.union(v.literal("privacy"), v.literal("terms")),
        version: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    // If user already has an org, return it
    if (user.orgId) {
      const existingOrg = await ctx.db.get(user.orgId);
      if (existingOrg) {
        return { orgId: existingOrg._id, orgName: existingOrg.name };
      }
    }

    // Require acceptance of both legal documents before creating the org.
    const acceptedTypes = new Set(args.acceptedLegal.map((a) => a.documentType));
    if (!acceptedTypes.has("privacy") || !acceptedTypes.has("terms")) {
      throw new Error("Privacy Policy and Terms & Conditions must be accepted");
    }

    const trimmedName = args.orgName.trim();
    if (!trimmedName) {
      throw new Error("Organization name is required");
    }

    const timestamp = Date.now();
    let slug = generateSlug(trimmedName);

    // Ensure slug uniqueness
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Create org
    const orgId = await ctx.db.insert("organizations", {
      name: trimmedName,
      slug,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Assign org to user and make them admin
    await ctx.db.patch(user._id, {
      orgId,
      role: "admin",
      showOnboardingInterface: true,
      updatedAt: timestamp,
    });

    // Record legal acceptance atomically with org creation.
    for (const a of args.acceptedLegal) {
      await ctx.db.insert("legalAcceptances", {
        userId: user._id,
        documentType: a.documentType,
        version: a.version,
        acceptedAt: timestamp,
        orgId,
      });
    }

    return { orgId, orgName: trimmedName };
  },
});

// Get the current user's organization
export const getMyOrg = query({
  handler: async (ctx) => {
    const user = await getCurrentUserOptional(ctx);
    if (!user || !user.orgId) return null;
    const org = await ctx.db.get(user.orgId);
    return org;
  },
});

// Update organization name (admin only)
export const updateOrg = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    if (user.role !== "admin") {
      throw new Error("Admin access required");
    }

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new Error("Organization name is required");
    }

    await ctx.db.patch(user.orgId, {
      name: trimmedName,
      updatedAt: Date.now(),
    });
  },
});

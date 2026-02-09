import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId;
      } else {
        // Create new user - they become admin of their org
        // orgId is set by the setupOrganization mutation after signup
        const timestamp = Date.now();
        const email = args.profile.email as string | undefined;
        const name = (args.profile.name as string | undefined) || email?.split("@")[0] || "User";

        const newUserId = await ctx.db.insert("users", {
          email,
          name,
          fullName: name,
          role: "admin", // First user of their org is admin
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        return newUserId;
      }
    },
  },
});

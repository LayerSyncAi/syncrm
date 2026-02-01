import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // Debug logging to understand what identifiers are available
      console.log("[createOrUpdateUser] Called with args:", {
        existingUserId: args.existingUserId,
        provider: args.provider,
        profile: args.profile,
        // Log all keys in args to see what's available
        allKeys: Object.keys(args),
      });

      if (args.existingUserId) {
        // Update existing user - just return the existing ID
        console.log("[createOrUpdateUser] Returning existing user ID:", args.existingUserId);
        return args.existingUserId;
      } else {
        // Create new user with default role "agent"
        const timestamp = Date.now();
        const email = args.profile.email as string | undefined;
        const name = (args.profile.name as string | undefined) || email?.split("@")[0] || "User";

        const newUserId = await ctx.db.insert("users", {
          email,
          name,
          fullName: name,
          role: "agent", // Default role for new users
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        console.log("[createOrUpdateUser] Created new user:", {
          newUserId,
          email,
          name,
        });

        return newUserId;
      }
    },
  },
});

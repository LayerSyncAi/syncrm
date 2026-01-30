import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [Password],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        // Update existing user
        return args.existingUserId;
      } else {
        // Create new user with default role "agent"
        const timestamp = Date.now();
        const email = args.profile.email as string | undefined;
        const name = (args.profile.name as string | undefined) || email?.split("@")[0] || "User";

        return ctx.db.insert("users", {
          email,
          name,
          fullName: name,
          role: "agent", // Default role for new users
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    },
  },
});

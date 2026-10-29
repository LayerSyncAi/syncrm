import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

const HOUR_MS = 60 * 60 * 1000;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  // Sessions are long so the mobile app never asks people to sign in again:
  // a phone stays signed in while the app is opened at least every 90 days.
  // The working-day idle timeout (BRD Hub HB-10) is enforced in desktop
  // browsers only (src/hooks/useIdleSignOut.ts). Deactivating a user still
  // stops every session at once, because each request checks isActive.
  session: {
    inactiveDurationMs: 90 * 24 * HOUR_MS,
    totalDurationMs: 10 * 365 * 24 * HOUR_MS,
  },
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

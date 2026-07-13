import { v } from "convex/values";
import { internalMutation, internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Scrypt } from "lucia";
import { rebuildPasswordAccount, getTempPassword } from "./lib/authReconcile";

/**
 * One-off repair utilities for accounts whose `users` row was deleted directly
 * in the Convex dashboard.
 *
 * `@convex-dev/auth` keeps the actual password in a separate `authAccounts`
 * table (keyed by email), not on the `users` row. Deleting a user straight from
 * the `users` table leaves that `authAccounts` row — plus any `authSessions` /
 * `authRefreshTokens` — orphaned, pointing at a userId that no longer exists.
 *
 * When the same person is re-added, a SECOND `authAccounts` row is created for
 * the same email. Sign-in looks the account up by email expecting exactly one
 * match, so the duplicate makes every login fail with a generic
 * "wrong username or password" — even right after a password reset, because the
 * reset only patches one of the two rows.
 *
 * These functions purge every password account for an email and rebuild a single
 * clean one tied to the current live user, with the deployment's configured temp
 * password (AUTH_TEMP_PASSWORD; see getTempPassword) and a forced reset on next
 * login.
 *
 * Run from the Convex dashboard (Functions tab):
 *   1. `authRepair:diagnoseUserAuth` with { email } to inspect the mess.
 *   2. `authRepair:repairUserAuth` with { emails: ["a@x.com", "b@x.com", ...] }.
 */

/** Temp password issued to repaired accounts (matches admin-create flow). */
const DEFAULT_TEMP_PASSWORD = getTempPassword();

/** Inspect every password auth account tied to an email, without changing anything. */
export const diagnoseUserAuth = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    const liveUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    const accounts = await ctx.db
      .query("authAccounts")
      .filter((q) =>
        q.and(
          q.eq(q.field("provider"), "password"),
          q.eq(q.field("providerAccountId"), email)
        )
      )
      .collect();

    const accountDetails = await Promise.all(
      accounts.map(async (acct) => {
        const owner = await ctx.db.get(acct.userId);
        return {
          accountId: acct._id,
          userId: acct.userId,
          ownerExists: owner !== null,
          pointsToLiveUser: liveUser !== null && acct.userId === liveUser._id,
        };
      })
    );

    return {
      email,
      liveUser: liveUser
        ? { _id: liveUser._id, isActive: liveUser.isActive, orgId: liveUser.orgId }
        : null,
      passwordAccountCount: accounts.length,
      accounts: accountDetails,
      // The healthy state is: liveUser != null && passwordAccountCount === 1
      // && that one account points to the live user.
      healthy:
        liveUser !== null &&
        accounts.length === 1 &&
        accounts[0].userId === liveUser._id,
    };
  },
});

/** Internal: rebuild a single clean password account for one email. */
export const repairUserAuthInternal = internalMutation({
  args: { email: v.string(), passwordHash: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    // The current, live user row for this email must already exist (re-added
    // from the site). We rebuild auth around it; we never recreate the user.
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) {
      throw new Error(
        `No users row found for ${email}. Re-add the user from the site first, then run this repair.`
      );
    }

    // Purge every password account tied to this email (orphans + duplicates)
    // and their sessions, then rebuild a single clean one for the live user.
    // Shared with the admin create / reset flows so the logic never diverges.
    const { deletedAccounts, deletedSessions } = await rebuildPasswordAccount(
      ctx,
      { email, liveUserId: user._id, passwordHash: args.passwordHash }
    );

    // Force a password change on first login and clear any stale reset tokens.
    const now = Date.now();
    await ctx.db.patch(user._id, {
      resetPasswordOnNextLogin: true,
      updatedAt: now,
    });

    const staleResetTokens = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const token of staleResetTokens) {
      if (!token.usedAt) await ctx.db.patch(token._id, { usedAt: now });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      actorLabel: user.email,
      action: "user.auth_repaired",
      category: "auth",
      description: `Rebuilt password account for ${email} (removed ${deletedAccounts} stale account(s), ${deletedSessions} session(s)); temp password reissued`,
      targetType: "user",
      targetId: user._id,
      targetLabel: user.email,
      orgId: user.orgId,
      createdAt: now,
    });

    return {
      email,
      userId: user._id,
      deletedAccounts,
      deletedSessions,
      tempPassword: DEFAULT_TEMP_PASSWORD,
    };
  },
});

// One result entry per email processed by `repairUserAuth`. An explicit type
// (plus the handler's annotated return type below) is required because the
// action calls a sibling function in this same module via `internal.authRepair`,
// which would otherwise make its type infer circularly.
type RepairResult =
  | {
      ok: true;
      email: string;
      userId: string;
      deletedAccounts: number;
      deletedSessions: number;
      tempPassword: string;
    }
  | { ok: false; email: string; error: string };

/**
 * Repair one or more emails in a single run. Hashes the temp password and
 * rebuilds a clean password account for each. Safe to re-run (idempotent).
 */
export const repairUserAuth = internalAction({
  args: { emails: v.array(v.string()) },
  handler: async (ctx, args): Promise<RepairResult[]> => {
    const passwordHash = await new Scrypt().hash(DEFAULT_TEMP_PASSWORD);

    const results: RepairResult[] = [];
    for (const rawEmail of args.emails) {
      const email = rawEmail.trim().toLowerCase();
      try {
        const result = await ctx.runMutation(
          internal.authRepair.repairUserAuthInternal,
          { email, passwordHash }
        );
        results.push({ ...result, ok: true });
      } catch (error) {
        results.push({
          email,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  },
});

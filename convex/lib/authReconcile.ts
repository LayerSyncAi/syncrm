import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * A one-off temporary password for a new or reset login. Every account gets
 * its own, always paired with `resetPasswordOnNextLogin`, and it reaches the
 * person by email. There is no shared default: a fixed value would ship to
 * every browser and open every account that had not yet signed in.
 *
 * No 0/O or 1/l/I, so it can be read off an email and typed on a phone.
 */
export function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Single source of truth for reconciling a Convex Auth *password* account.
 *
 * `@convex-dev/auth` keeps the actual password in a separate `authAccounts`
 * table, keyed by email (`providerAccountId`), not on the `users` row. Deleting
 * a user straight from the `users` table therefore leaves that `authAccounts`
 * row — plus any `authSessions` / `authRefreshTokens` / `authVerificationCodes`
 * — orphaned, pointing at a userId that no longer exists.
 *
 * When the same person is re-added, a SECOND `authAccounts` row is created for
 * the same email. Sign-in looks the account up by email expecting exactly one
 * match, so the duplicate makes every login fail with a generic
 * "wrong username or password" — even right after a password reset, because a
 * naive reset only patches one of the two rows.
 *
 * `rebuildPasswordAccount` purges EVERY password account tied to `email`
 * (orphans + duplicates) and their dependent sessions / refresh tokens /
 * verification codes, then inserts exactly one clean account pointing at the
 * live user. It is idempotent: running it on an already-healthy account simply
 * reissues a single clean account with the supplied password hash.
 */
export async function rebuildPasswordAccount(
  ctx: MutationCtx,
  args: { email: string; liveUserId: Id<"users">; passwordHash: string }
): Promise<{ deletedAccounts: number; deletedSessions: number }> {
  const email = args.email.trim().toLowerCase();

  // Every password account currently tied to this email (orphans + duplicates).
  const accounts = await ctx.db
    .query("authAccounts")
    .filter((q) =>
      q.and(
        q.eq(q.field("provider"), "password"),
        q.eq(q.field("providerAccountId"), email)
      )
    )
    .collect();

  // Clean sessions for the live user AND every (possibly dead) userId those
  // accounts referenced, so no stale session survives the rebuild.
  const userIdsToClear = new Set<Id<"users">>([args.liveUserId]);
  for (const acct of accounts) userIdsToClear.add(acct.userId);

  // Delete the accounts and their dependent verification codes.
  let deletedAccounts = 0;
  for (const acct of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .filter((q) => q.eq(q.field("accountId"), acct._id))
      .collect();
    for (const code of codes) await ctx.db.delete(code._id);
    await ctx.db.delete(acct._id);
    deletedAccounts++;
  }

  // Delete sessions (and their refresh tokens) for each referenced userId.
  let deletedSessions = 0;
  for (const uid of userIdsToClear) {
    const sessions = await ctx.db
      .query("authSessions")
      .filter((q) => q.eq(q.field("userId"), uid))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .filter((q) => q.eq(q.field("sessionId"), session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
      deletedSessions++;
    }
  }

  // Recreate exactly one clean password account for the live user.
  await ctx.db.insert("authAccounts", {
    userId: args.liveUserId,
    provider: "password",
    providerAccountId: email,
    secret: args.passwordHash,
  });

  return { deletedAccounts, deletedSessions };
}

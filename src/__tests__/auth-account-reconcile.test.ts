import { describe, it, expect } from "vitest";

// ────────────────────────────────────────────────────────────
// Pure mirror of convex/lib/authReconcile.ts::rebuildPasswordAccount
//
// The real helper runs against Convex's `ctx.db`, so here we model the
// authAccounts / authSessions / authRefreshTokens / authVerificationCodes
// tables as plain arrays and reproduce the exact reconciliation steps. This
// locks in the invariant that matters for login: after a rebuild there is
// EXACTLY ONE password account for the email, pointing at the live user.
// ────────────────────────────────────────────────────────────

interface AuthAccount {
  _id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  secret?: string;
}
interface AuthSession { _id: string; userId: string }
interface AuthRefreshToken { _id: string; sessionId: string }
interface AuthVerificationCode { _id: string; accountId: string }

interface Db {
  accounts: AuthAccount[];
  sessions: AuthSession[];
  refreshTokens: AuthRefreshToken[];
  verificationCodes: AuthVerificationCode[];
}

let idCounter = 0;
const newId = (p: string) => `${p}_${++idCounter}`;

function rebuildPasswordAccount(
  db: Db,
  args: { email: string; liveUserId: string; passwordHash: string }
): { deletedAccounts: number; deletedSessions: number } {
  const email = args.email.trim().toLowerCase();

  const matching = db.accounts.filter(
    (a) => a.provider === "password" && a.providerAccountId === email
  );

  const userIdsToClear = new Set<string>([args.liveUserId]);
  for (const a of matching) userIdsToClear.add(a.userId);

  let deletedAccounts = 0;
  for (const acct of matching) {
    db.verificationCodes = db.verificationCodes.filter(
      (c) => c.accountId !== acct._id
    );
    db.accounts = db.accounts.filter((a) => a._id !== acct._id);
    deletedAccounts++;
  }

  let deletedSessions = 0;
  for (const uid of userIdsToClear) {
    const sessions = db.sessions.filter((s) => s.userId === uid);
    for (const session of sessions) {
      db.refreshTokens = db.refreshTokens.filter(
        (t) => t.sessionId !== session._id
      );
      db.sessions = db.sessions.filter((s) => s._id !== session._id);
      deletedSessions++;
    }
  }

  db.accounts.push({
    _id: newId("acct"),
    userId: args.liveUserId,
    provider: "password",
    providerAccountId: email,
    secret: args.passwordHash,
  });

  return { deletedAccounts, deletedSessions };
}

const emptyDb = (): Db => ({
  accounts: [],
  sessions: [],
  refreshTokens: [],
  verificationCodes: [],
});

describe("rebuildPasswordAccount", () => {
  it("collapses an orphan + duplicate into exactly one live account", () => {
    // Scenario: user deleted straight from `users` (orphan account left behind),
    // then re-added (a second account created) → two password rows for one email.
    const db = emptyDb();
    db.accounts.push({
      _id: "acct_orphan",
      userId: "deletedUser",
      provider: "password",
      providerAccountId: "sky@propertyshop.co.zw",
      secret: "old-hash",
    });
    db.accounts.push({
      _id: "acct_dup",
      userId: "liveUser",
      provider: "password",
      providerAccountId: "sky@propertyshop.co.zw",
      secret: "another-hash",
    });
    db.sessions.push({ _id: "sess_dead", userId: "deletedUser" });
    db.refreshTokens.push({ _id: "rt_dead", sessionId: "sess_dead" });
    db.verificationCodes.push({ _id: "vc1", accountId: "acct_orphan" });

    const res = rebuildPasswordAccount(db, {
      email: "sky@propertyshop.co.zw",
      liveUserId: "liveUser",
      passwordHash: "new-temp-hash",
    });

    const pwAccounts = db.accounts.filter(
      (a) =>
        a.provider === "password" &&
        a.providerAccountId === "sky@propertyshop.co.zw"
    );
    expect(pwAccounts).toHaveLength(1);
    expect(pwAccounts[0].userId).toBe("liveUser");
    expect(pwAccounts[0].secret).toBe("new-temp-hash");
    // Orphaned sessions / tokens / codes are gone.
    expect(db.sessions).toHaveLength(0);
    expect(db.refreshTokens).toHaveLength(0);
    expect(db.verificationCodes).toHaveLength(0);
    expect(res.deletedAccounts).toBe(2);
    expect(res.deletedSessions).toBe(1);
  });

  it("is idempotent on an already-healthy single account", () => {
    const db = emptyDb();
    db.accounts.push({
      _id: "acct_ok",
      userId: "liveUser",
      provider: "password",
      providerAccountId: "sky@propertyshop.co.zw",
      secret: "current-hash",
    });

    rebuildPasswordAccount(db, {
      email: "sky@propertyshop.co.zw",
      liveUserId: "liveUser",
      passwordHash: "reissued-hash",
    });
    const res2 = rebuildPasswordAccount(db, {
      email: "sky@propertyshop.co.zw",
      liveUserId: "liveUser",
      passwordHash: "reissued-hash",
    });

    const pwAccounts = db.accounts.filter((a) => a.provider === "password");
    expect(pwAccounts).toHaveLength(1);
    expect(pwAccounts[0].userId).toBe("liveUser");
    expect(pwAccounts[0].secret).toBe("reissued-hash");
    expect(res2.deletedAccounts).toBe(1);
  });

  it("normalizes email casing so a mixed-case orphan is still purged", () => {
    const db = emptyDb();
    db.accounts.push({
      _id: "acct_orphan",
      userId: "deletedUser",
      provider: "password",
      providerAccountId: "sky@propertyshop.co.zw",
      secret: "old",
    });

    rebuildPasswordAccount(db, {
      email: "  Sky@PropertyShop.co.zw  ",
      liveUserId: "liveUser",
      passwordHash: "new",
    });

    const pwAccounts = db.accounts.filter((a) => a.provider === "password");
    expect(pwAccounts).toHaveLength(1);
    expect(pwAccounts[0].userId).toBe("liveUser");
    expect(pwAccounts[0].providerAccountId).toBe("sky@propertyshop.co.zw");
  });
});

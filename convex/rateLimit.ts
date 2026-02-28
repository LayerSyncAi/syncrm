import { MutationCtx } from "./_generated/server";

/**
 * Token bucket rate limiter for Convex mutations.
 * Tokens refill over time. Each call consumes 1 token.
 */
interface RateLimitConfig {
  /** Maximum number of tokens (burst capacity) */
  maxTokens: number;
  /** Time window in milliseconds for full refill */
  refillIntervalMs: number;
}

export const RATE_LIMITS = {
  leadCreate: { maxTokens: 10, refillIntervalMs: 60 * 1000 } as RateLimitConfig,       // 10 per minute
  importBulk: { maxTokens: 5, refillIntervalMs: 5 * 60 * 1000 } as RateLimitConfig,    // 5 per 5 minutes
};

/**
 * Check and consume a rate limit token. Throws if rate limited.
 * @param ctx - Convex mutation context
 * @param action - The rate limit action key (e.g. "leadCreate")
 * @param identifier - Unique identifier (e.g. userId)
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  action: keyof typeof RATE_LIMITS,
  identifier: string
): Promise<void> {
  const config = RATE_LIMITS[action];
  const key = `${action}:${identifier}`;
  const now = Date.now();

  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (!existing) {
    // First request — create bucket with maxTokens - 1
    await ctx.db.insert("rateLimits", {
      key,
      tokens: config.maxTokens - 1,
      lastRefill: now,
    });
    return;
  }

  // Calculate refilled tokens based on elapsed time
  const elapsed = now - existing.lastRefill;
  const refillRate = config.maxTokens / config.refillIntervalMs;
  const refilled = Math.min(
    config.maxTokens,
    existing.tokens + elapsed * refillRate
  );

  if (refilled < 1) {
    const waitMs = Math.ceil((1 - refilled) / refillRate);
    const waitSec = Math.ceil(waitMs / 1000);
    throw new Error(
      `Rate limit exceeded for ${action}. Please try again in ${waitSec} seconds.`
    );
  }

  // Consume one token
  await ctx.db.patch(existing._id, {
    tokens: refilled - 1,
    lastRefill: now,
  });
}

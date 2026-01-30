import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendPasswordResetEmail } from "./email";

// Generate a random token (32 bytes hex)
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Simple hash function for token storage (SHA-256)
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Create password reset token (internal mutation)
export const createResetToken = internalMutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (!user) {
      // Don't reveal whether email exists
      return { success: true };
    }

    // Generate token
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const now = Date.now();
    const expiresAt = now + 60 * 60 * 1000; // 1 hour

    // Invalidate any existing tokens for this user
    const existingTokens = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const existingToken of existingTokens) {
      if (!existingToken.usedAt) {
        await ctx.db.patch(existingToken._id, { usedAt: now });
      }
    }

    // Create new token
    await ctx.db.insert("passwordResetTokens", {
      userId: user._id,
      tokenHash,
      expiresAt,
      createdAt: now,
    });

    return { success: true, token, email: user.email };
  },
});

// Request password reset (action that sends email)
export const requestPasswordReset = action({
  args: {
    email: v.string(),
    baseUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // Create token in database
    const result = await ctx.runMutation(internal.passwordReset.createResetToken, {
      email: args.email,
    });

    // Send email if token was created (user exists)
    if (result.token && result.email) {
      await sendPasswordResetEmail(result.email, result.token, args.baseUrl);
    }

    // Always return success to not reveal email existence
    return { success: true };
  },
});

// Validate a reset token
export const validateResetToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenHash = await hashToken(args.token);

    const resetToken = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    if (!resetToken) {
      return { valid: false, error: "Invalid or expired reset link" };
    }

    if (resetToken.usedAt) {
      return { valid: false, error: "This reset link has already been used" };
    }

    if (resetToken.expiresAt < Date.now()) {
      return { valid: false, error: "This reset link has expired" };
    }

    return { valid: true };
  },
});

// Hash password for storage (using bcrypt-like approach with crypto)
async function hashPassword(password: string): Promise<string> {
  // Generate salt
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Hash password with salt
  const encoder = new TextEncoder();
  const data = encoder.encode(saltHex + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return `${saltHex}:${hashHex}`;
}

// Reset password with token (internal mutation for password update)
export const resetPasswordInternal = internalMutation({
  args: {
    token: v.string(),
    newPasswordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenHash = await hashToken(args.token);

    const resetToken = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    if (!resetToken) {
      return { success: false, error: "Invalid or expired reset link" };
    }

    if (resetToken.usedAt) {
      return { success: false, error: "This reset link has already been used" };
    }

    if (resetToken.expiresAt < Date.now()) {
      return { success: false, error: "This reset link has expired" };
    }

    // Get the user
    const user = await ctx.db.get(resetToken.userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Find and update the auth account
    const account = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("userId"), user._id))
      .first();

    if (account) {
      // Update the password hash in authAccounts
      await ctx.db.patch(account._id, {
        secret: args.newPasswordHash,
      });
    }

    // Mark token as used
    await ctx.db.patch(resetToken._id, { usedAt: Date.now() });

    // Update user timestamp
    await ctx.db.patch(user._id, { updatedAt: Date.now() });

    return { success: true };
  },
});

// Reset password action
export const resetPassword = action({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.newPassword.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" };
    }

    // Hash the new password
    const newPasswordHash = await hashPassword(args.newPassword);

    // Update password in database
    const result = await ctx.runMutation(internal.passwordReset.resetPasswordInternal, {
      token: args.token,
      newPasswordHash,
    });

    return result;
  },
});

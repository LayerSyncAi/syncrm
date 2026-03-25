import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg } from "./helpers";

const MAX_CHATS = 20;
const MAX_MESSAGES = 80;

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const chats = await ctx.db
      .query("copilotChats")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    // Sort by updatedAt so recently active chats always appear at the top,
    // even when an old chat is resumed and gets new messages.
    return chats.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const upsert = mutation({
  args: {
    chatId: v.string(),
    title: v.string(),
    messages: v.array(v.any()),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const messages = args.messages.slice(-MAX_MESSAGES);

    const existing = await ctx.db
      .query("copilotChats")
      .withIndex("by_chat_id", (q) => q.eq("chatId", args.chatId))
      .first();

    if (existing) {
      if (existing.userId !== user._id) return;
      await ctx.db.patch(existing._id, {
        title: args.title,
        messages,
        updatedAt: args.updatedAt,
      });
    } else {
      await ctx.db.insert("copilotChats", {
        chatId: args.chatId,
        userId: user._id,
        orgId: user.orgId,
        title: args.title,
        messages,
        updatedAt: args.updatedAt,
      });

      // Prune oldest chats beyond the cap
      const all = await ctx.db
        .query("copilotChats")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .order("desc")
        .collect();

      if (all.length > MAX_CHATS) {
        await Promise.all(
          all.slice(MAX_CHATS).map((c) => ctx.db.delete(c._id))
        );
      }
    }
  },
});

export const remove = mutation({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserWithOrg(ctx);
    const chat = await ctx.db
      .query("copilotChats")
      .withIndex("by_chat_id", (q) => q.eq("chatId", args.chatId))
      .first();
    if (!chat || chat.userId !== user._id) return;
    await ctx.db.delete(chat._id);
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserWithOrg(ctx);
    const chats = await ctx.db
      .query("copilotChats")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    await Promise.all(chats.map((c) => ctx.db.delete(c._id)));
  },
});

// DEV AUTH (placeholder).
// Email-only sign in/up so the whole product is demoable locally. There is no
// password and the client trusts the returned userId — DO NOT ship this. Swap
// for Convex Auth / Clerk before any real deployment; only this file and
// lib.ts:getUser() need to change.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_REVSHARE_BPS } from "./lib";

const roleValidator = v.union(v.literal("EARNER"), v.literal("ADVERTISER"));

/** Create an account (+ matching profile/advertiser record) or return existing. */
export const signUp = mutation({
  args: { email: v.string(), name: v.optional(v.string()), role: roleValidator },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) return { userId: existing._id, role: existing.role };

    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      role: args.role,
    });

    if (args.role === "EARNER") {
      await ctx.db.insert("earnerProfiles", {
        userId,
        trustScore: 50,
        revshareBps: DEFAULT_REVSHARE_BPS,
        kycStatus: "NONE",
        pendingCents: 0,
        availableCents: 0,
      });
    } else {
      await ctx.db.insert("advertiserAccounts", {
        userId,
        companyName: args.name,
        balanceCents: 0,
      });
    }
    return { userId, role: args.role };
  },
});

/** Sign in: look up by email. (Dev: no password check.) */
export const signIn = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (!user) throw new Error("No account for that email. Sign up first.");
    return { userId: user._id, role: user.role };
  },
});

/** Resolve the current user from a stored userId (used by the web client). */
export const me = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return null;
    const user = await ctx.db.get(args.userId);
    return user ?? null;
  },
});

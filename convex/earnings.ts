// Earner-side functions: work sessions, dashboard, payouts.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getEarnerProfile, MIN_PAYOUT_CENTS } from "./lib";

const detectionSource = v.union(
  v.literal("HOOK"),
  v.literal("WRAPPER"),
  v.literal("HEURISTIC"),
  v.literal("MANUAL"),
);

/** Open a work session when the agent starts working. */
export const startSession = mutation({
  args: {
    userId: v.id("users"),
    agent: v.string(),
    source: detectionSource,
  },
  handler: async (ctx, args) => {
    const earner = await getEarnerProfile(ctx, args.userId);
    return await ctx.db.insert("workSessions", {
      earnerId: earner._id,
      agent: args.agent,
      source: args.source,
      startedAt: Date.now(),
      busyMs: 0,
    });
  },
});

/** Close a work session when the agent finishes. */
export const endSession = mutation({
  args: { userId: v.id("users"), sessionId: v.id("workSessions") },
  handler: async (ctx, args) => {
    const earner = await getEarnerProfile(ctx, args.userId);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.earnerId !== earner._id) throw new Error("No session");
    if (session.endedAt) return;
    await ctx.db.patch(session._id, {
      endedAt: Date.now(),
      busyMs: session.busyMs + (Date.now() - session.startedAt),
    });
  },
});

/** Everything the earner dashboard needs: balances + lifetime + recent ads. */
export const dashboard = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const earner = await ctx.db
      .query("earnerProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!earner) return null;

    const recent = await ctx.db
      .query("impressions")
      .withIndex("by_earner", (q) => q.eq("earnerId", earner._id))
      .order("desc")
      .take(25);

    const allImps = await ctx.db
      .query("impressions")
      .withIndex("by_earner", (q) => q.eq("earnerId", earner._id))
      .collect();
    const lifetimeCents = allImps.reduce((s, i) => s + i.earnedCents, 0);
    const viewableCount = allImps.filter((i) => i.viewable).length;

    const activeSession = (
      await ctx.db
        .query("workSessions")
        .withIndex("by_earner", (q) => q.eq("earnerId", earner._id))
        .order("desc")
        .take(1)
    ).find((s) => !s.endedAt);

    return {
      pendingCents: earner.pendingCents,
      availableCents: earner.availableCents,
      lifetimeCents,
      viewableCount,
      revshareBps: earner.revshareBps,
      trustScore: earner.trustScore,
      activeSessionId: activeSession?._id ?? null,
      recent: recent.map((i) => ({
        _id: i._id,
        servedAt: i.servedAt,
        viewable: i.viewable,
        earnedCents: i.earnedCents,
      })),
    };
  },
});

/** Withdraw available balance (dev: marks PAID immediately). */
export const requestPayout = mutation({
  args: {
    userId: v.id("users"),
    method: v.union(
      v.literal("STRIPE_CONNECT"),
      v.literal("PAYPAL"),
      v.literal("TREMENDOUS"),
    ),
  },
  handler: async (ctx, args) => {
    const earner = await getEarnerProfile(ctx, args.userId);
    if (earner.availableCents < MIN_PAYOUT_CENTS) {
      throw new Error(`Minimum payout is ${MIN_PAYOUT_CENTS / 100} USD`);
    }
    const amount = earner.availableCents;
    const payoutId = await ctx.db.insert("payouts", {
      earnerId: earner._id,
      amountCents: amount,
      method: args.method,
      status: "PAID", // DEV: real payouts go through Stripe Connect / PayPal action
      holdUntil: Date.now(),
      paidAt: Date.now(),
    });
    await ctx.db.patch(earner._id, { availableCents: 0 });
    await ctx.db.insert("ledgerEntries", {
      type: "PAYOUT",
      amountCents: -amount,
      currency: "USD",
      earnerId: earner._id,
      payoutId,
    });
    return { amountCents: amount };
  },
});

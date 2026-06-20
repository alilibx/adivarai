// Advertiser-side functions: balance, funding (dev top-up), reporting.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAdvertiser } from "./lib";

/** Advertiser account + balance for the dashboard header. */
export const account = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const acct = await ctx.db
      .query("advertiserAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    return acct;
  },
});

/**
 * DEV top-up: credit the prepaid balance directly. In production this becomes a
 * Convex action that creates a Stripe PaymentIntent and only credits on the
 * webhook confirming `succeeded`.
 */
export const topUp = mutation({
  args: { userId: v.id("users"), amountCents: v.number() },
  handler: async (ctx, args) => {
    if (args.amountCents <= 0) throw new Error("Amount must be positive");
    const acct = await getAdvertiser(ctx, args.userId);

    const topUpId = await ctx.db.insert("topUps", {
      advertiserId: acct._id,
      amountCents: args.amountCents,
      status: "SUCCEEDED",
    });
    await ctx.db.patch(acct._id, {
      balanceCents: acct.balanceCents + args.amountCents,
    });
    await ctx.db.insert("ledgerEntries", {
      type: "TOPUP",
      amountCents: args.amountCents,
      currency: "USD",
      advertiserId: acct._id,
      topUpId,
    });
    return { balanceCents: acct.balanceCents + args.amountCents };
  },
});

/** Aggregate campaign performance for the advertiser dashboard. */
export const reporting = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const acct = await ctx.db
      .query("advertiserAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!acct) return null;

    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_advertiser", (q) => q.eq("advertiserId", acct._id))
      .collect();

    let impressions = 0;
    let clicks = 0;
    let spentCents = 0;
    const perCampaign: Array<{
      campaign: (typeof campaigns)[number];
      impressions: number;
      clicks: number;
      ctr: number;
    }> = [];
    for (const c of campaigns) {
      const imps = await ctx.db
        .query("impressions")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect();
      const cls = await ctx.db
        .query("clicks")
        .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
        .collect();
      const viewable = imps.filter((i) => i.viewable);
      impressions += viewable.length;
      clicks += cls.length;
      spentCents += c.spentCents;
      perCampaign.push({
        campaign: c,
        impressions: viewable.length,
        clicks: cls.length,
        ctr: viewable.length ? cls.length / viewable.length : 0,
      });
    }

    return {
      balanceCents: acct.balanceCents,
      totals: { impressions, clicks, spentCents },
      perCampaign,
    };
  },
});

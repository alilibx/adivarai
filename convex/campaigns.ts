// Campaign + creative CRUD for advertisers.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAdvertiser, DEFAULT_PREDICTED_CTR_BPS } from "./lib";

const bidType = v.union(v.literal("CPM"), v.literal("CPC"));

export const create = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    bidType,
    bidCents: v.number(),
    budgetCents: v.number(),
    dailyCapCents: v.optional(v.number()),
    predictedCtrBps: v.optional(v.number()),
    targetCountries: v.optional(v.array(v.string())),
    targetLanguages: v.optional(v.array(v.string())),
    targetTags: v.optional(v.array(v.string())),
    frequencyCapPerDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const acct = await getAdvertiser(ctx, args.userId);
    if (args.bidCents <= 0 || args.budgetCents <= 0) {
      throw new Error("Bid and budget must be positive");
    }
    return await ctx.db.insert("campaigns", {
      advertiserId: acct._id,
      name: args.name,
      status: "DRAFT",
      bidType: args.bidType,
      bidCents: args.bidCents,
      predictedCtrBps:
        args.bidType === "CPC"
          ? args.predictedCtrBps ?? DEFAULT_PREDICTED_CTR_BPS
          : undefined,
      budgetCents: args.budgetCents,
      dailyCapCents: args.dailyCapCents,
      spentCents: 0,
      spentTodayCents: 0,
      targetCountries: args.targetCountries ?? [],
      targetLanguages: args.targetLanguages ?? [],
      targetTags: args.targetTags ?? [],
      frequencyCapPerDay: args.frequencyCapPerDay,
    });
  },
});

export const setStatus = mutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("PAUSED"),
      v.literal("DRAFT"),
    ),
  },
  handler: async (ctx, args) => {
    const acct = await getAdvertiser(ctx, args.userId);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.advertiserId !== acct._id) {
      throw new Error("Campaign not found");
    }
    // Block going ACTIVE without at least one approved creative.
    if (args.status === "ACTIVE") {
      const creative = await ctx.db
        .query("creatives")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
        .first();
      if (!creative) throw new Error("Add a creative before activating");
    }
    await ctx.db.patch(campaign._id, { status: args.status });
  },
});

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const acct = await ctx.db
      .query("advertiserAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!acct) return [];
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_advertiser", (q) => q.eq("advertiserId", acct._id))
      .order("desc")
      .collect();
    return Promise.all(
      campaigns.map(async (c) => ({
        ...c,
        creatives: await ctx.db
          .query("creatives")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .collect(),
      })),
    );
  },
});

// --- Creatives ---

/** Get a short-lived upload URL for posting a creative asset to Convex storage. */
export const generateUploadUrl = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await getAdvertiser(ctx, args.userId); // authz
    return await ctx.storage.generateUploadUrl();
  },
});

export const addCreative = mutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    type: v.union(v.literal("IMAGE"), v.literal("HTML"), v.literal("VIDEO")),
    storageId: v.optional(v.id("_storage")),
    assetUrl: v.optional(v.string()),
    clickUrl: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const acct = await getAdvertiser(ctx, args.userId);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.advertiserId !== acct._id) {
      throw new Error("Campaign not found");
    }
    return await ctx.db.insert("creatives", {
      campaignId: args.campaignId,
      type: args.type,
      assetId: args.storageId,
      assetUrl: args.assetUrl,
      clickUrl: args.clickUrl,
      width: args.width,
      height: args.height,
      // Auto-approve in dev; production routes through moderation.
      moderation: "APPROVED",
    });
  },
});

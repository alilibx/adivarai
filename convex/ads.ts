// Ad serving: the auction, impression recording (CPM billing), and clicks
// (CPC billing). See SPEC.md §6 and PAYMENTS.md.

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import {
  billAndAccrue,
  getEarnerProfile,
  impressionValueCents,
  newToken,
  MIN_VIEWABLE_MS,
} from "./lib";

/**
 * Select the highest-value eligible ad for an earner and create a pending
 * impression. Returns the creative + a single-use token used to confirm the
 * view (and any click).
 */
export const selectAd = mutation({
  args: { userId: v.id("users"), sessionId: v.id("workSessions") },
  handler: async (ctx, args) => {
    const earner = await getEarnerProfile(ctx, args.userId);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.earnerId !== earner._id || session.endedAt) {
      throw new Error("No active work session");
    }

    const active = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();

    // Eligibility: budget + daily cap remaining, and advertiser can afford it.
    let best: { campaign: Doc<"campaigns">; value: number } | null = null;
    for (const c of active) {
      const value = impressionValueCents(c);
      if (c.spentCents >= c.budgetCents) continue;
      if (c.dailyCapCents && c.spentTodayCents >= c.dailyCapCents) continue;
      const adv = await ctx.db.get(c.advertiserId);
      if (!adv || adv.balanceCents < value) continue;
      if (!best || value > best.value) best = { campaign: c, value };
    }
    if (!best) return null; // no fill

    const creative = await ctx.db
      .query("creatives")
      .withIndex("by_campaign", (q) => q.eq("campaignId", best!.campaign._id))
      .filter((q) => q.eq(q.field("moderation"), "APPROVED"))
      .first();
    if (!creative) return null;

    const token = newToken();
    const impressionId = await ctx.db.insert("impressions", {
      campaignId: best.campaign._id,
      creativeId: creative._id,
      earnerId: earner._id,
      sessionId: session._id,
      token,
      servedAt: Date.now(),
      viewable: false,
      billedCents: 0,
      earnedCents: 0,
      settled: false,
    });

    const assetUrl = creative.assetId
      ? await ctx.storage.getUrl(creative.assetId)
      : creative.assetUrl;

    return {
      token,
      impressionId,
      bidType: best.campaign.bidType,
      creative: {
        type: creative.type,
        assetUrl,
        clickUrl: creative.clickUrl,
        title: creative.title ?? null,
        body: creative.body ?? null,
        ctaLabel: creative.ctaLabel ?? null,
        brandName: creative.brandName ?? null,
        width: creative.width,
        height: creative.height,
      },
    };
  },
});

/**
 * Confirm an ad was viewable. Idempotent on the token. For CPM campaigns this is
 * the billing event (advertiser charged, earner accrues).
 */
export const recordImpression = mutation({
  args: { userId: v.id("users"), token: v.string() },
  handler: async (ctx, args) => {
    const earner = await getEarnerProfile(ctx, args.userId);
    const imp = await ctx.db
      .query("impressions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!imp || imp.earnerId !== earner._id) throw new Error("Bad token");
    if (imp.viewable) return { earnedCents: imp.earnedCents }; // idempotent

    // Server backstop: reject confirmations that arrive implausibly fast.
    if (Date.now() - imp.servedAt < MIN_VIEWABLE_MS) {
      await ctx.db.patch(imp._id, { ivtReason: "too_fast" });
      return { earnedCents: 0 };
    }

    const campaign = await ctx.db.get(imp.campaignId);
    const session = imp.sessionId ? await ctx.db.get(imp.sessionId) : null;
    if (!campaign) throw new Error("Campaign gone");

    await ctx.db.patch(imp._id, { viewable: true, viewableAt: Date.now() });

    if (campaign.bidType !== "CPM") return { earnedCents: 0 }; // CPC bills on click

    const adv = await ctx.db.get(campaign.advertiserId);
    const billedCents = impressionValueCents(campaign);
    if (!adv || adv.balanceCents < billedCents) return { earnedCents: 0 };

    const { earnedCents } = await billAndAccrue(ctx, {
      campaign,
      advertiser: adv,
      earner,
      billedCents,
      source: session?.source ?? "MANUAL",
      impressionId: imp._id,
    });
    await ctx.db.patch(imp._id, { billedCents, earnedCents });
    return { earnedCents };
  },
});

/**
 * Record a click. For CPC campaigns this is the billing event. Returns the
 * landing URL for the client to open.
 */
export const recordClick = mutation({
  args: { userId: v.id("users"), token: v.string() },
  handler: async (ctx, args) => {
    const earner = await getEarnerProfile(ctx, args.userId);
    const imp = await ctx.db
      .query("impressions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!imp || imp.earnerId !== earner._id) throw new Error("Bad token");

    const existing = await ctx.db
      .query("clicks")
      .withIndex("by_impression", (q) => q.eq("impressionId", imp._id))
      .unique();
    const campaign = await ctx.db.get(imp.campaignId);
    if (!campaign) throw new Error("Campaign gone");
    const creative = await ctx.db.get(imp.creativeId);
    const clickUrl = creative?.clickUrl ?? null;
    if (existing) return { clickUrl }; // one billable click per impression

    const session = imp.sessionId ? await ctx.db.get(imp.sessionId) : null;
    const isCpc = campaign.bidType === "CPC";
    const billedCents = isCpc ? campaign.bidCents : 0;
    const adv = await ctx.db.get(campaign.advertiserId);
    const affordable = !!adv && adv.balanceCents >= billedCents;

    const clickId = await ctx.db.insert("clicks", {
      impressionId: imp._id,
      campaignId: campaign._id,
      creativeId: imp.creativeId,
      earnerId: earner._id,
      clickedAt: Date.now(),
      valid: affordable,
      billedCents: 0,
      earnedCents: 0,
      settled: false,
    });

    if (isCpc && affordable) {
      const { earnedCents } = await billAndAccrue(ctx, {
        campaign,
        advertiser: adv!,
        earner,
        billedCents,
        source: session?.source ?? "MANUAL",
        clickId,
      });
      await ctx.db.patch(clickId, { billedCents, earnedCents });
    }
    return { clickUrl };
  },
});

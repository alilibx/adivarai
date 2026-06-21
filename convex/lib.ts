// Shared backend constants + helpers for Adivari.
// Money is always integer cents. See PAYMENTS.md for the model.

import { MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// --- Economic config (tunable) ---------------------------------------------

/** Earner's share of realized revenue, in basis points. 6000 = 60%. */
export const DEFAULT_REVSHARE_BPS = 6000;

/** Default predicted CTR for CPC campaigns, in basis points. 100 = 1%. */
export const DEFAULT_PREDICTED_CTR_BPS = 100;

/** Minimum time between serving an ad and a valid viewable confirmation. */
export const MIN_VIEWABLE_MS = 1500;

/** Days an accrual stays "pending" before becoming withdrawable. */
export const HOLD_DAYS = 7;

/** Minimum withdrawable balance before a payout can be requested. */
export const MIN_PAYOUT_CENTS = 1000; // $10

/** Trust multiplier by detection source (applied to earner accrual), in bps. */
export const SOURCE_TRUST_BPS: Record<string, number> = {
  HOOK: 10000, // 100%
  WRAPPER: 9000, // 90%
  HEURISTIC: 7000, // 70%
  MANUAL: 5000, // 50%
};

export const DAY_MS = 24 * 60 * 60 * 1000;

// --- Money helpers ----------------------------------------------------------

/**
 * Apply a basis-points fraction to a cent amount. Kept fractional (not rounded)
 * so sub-penny per-impression amounts accumulate correctly; the UI formats to
 * 2 decimals. Conservation holds because platform = billed - earned.
 */
export function applyBps(cents: number, bps: number): number {
  return (cents * bps) / 10000;
}

/** Per-impression value in cents for a campaign (the auction ranking score). */
export function impressionValueCents(campaign: Doc<"campaigns">): number {
  if (campaign.bidType === "CPM") {
    // bidCents is per 1,000 impressions.
    return campaign.bidCents / 1000;
  }
  // CPC: expected value per impression = CPC * predicted CTR.
  const ctrBps = campaign.predictedCtrBps ?? DEFAULT_PREDICTED_CTR_BPS;
  return (campaign.bidCents * ctrBps) / 10000;
}

/** A short, unique-ish token for an impression (dedupe key). */
export function newToken(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 12)
  );
}

// --- Auth (DEV) -------------------------------------------------------------
// NOTE: This is a lightweight dev identity: the client passes its userId.
// Replace with Convex Auth / Clerk before any real deployment — every function
// that needs identity funnels through getUser() so the swap is localized.

export async function getUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  return user;
}

export async function getEarnerProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"earnerProfiles">> {
  const profile = await ctx.db
    .query("earnerProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile) throw new Error("Earner profile not found");
  return profile;
}

export async function getAdvertiser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"advertiserAccounts">> {
  const acct = await ctx.db
    .query("advertiserAccounts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!acct) throw new Error("Advertiser account not found");
  return acct;
}

// --- Ledger -----------------------------------------------------------------

/**
 * Record the three ledger entries for an ad-billing event and update the
 * advertiser balance, campaign spend, and earner pending balance atomically.
 * Returns { billedCents, earnedCents, platformCents }.
 */
export async function billAndAccrue(
  ctx: MutationCtx,
  opts: {
    campaign: Doc<"campaigns">;
    advertiser: Doc<"advertiserAccounts">;
    earner: Doc<"earnerProfiles">;
    billedCents: number;
    source: string;
    impressionId?: Id<"impressions">;
    clickId?: Id<"clicks">;
  },
): Promise<{ billedCents: number; earnedCents: number; platformCents: number }> {
  const { campaign, advertiser, earner, billedCents } = opts;

  // Earner accrual = revshare, scaled by the source trust multiplier.
  const trustBps = SOURCE_TRUST_BPS[opts.source] ?? SOURCE_TRUST_BPS.MANUAL;
  const grossEarn = applyBps(billedCents, earner.revshareBps);
  const earnedCents = applyBps(grossEarn, trustBps);
  const platformCents = billedCents - earnedCents;

  // Advertiser pays.
  await ctx.db.patch(advertiser._id, {
    balanceCents: advertiser.balanceCents - billedCents,
  });
  const newSpent = campaign.spentCents + billedCents;
  await ctx.db.patch(campaign._id, {
    spentCents: newSpent,
    spentTodayCents: campaign.spentTodayCents + billedCents,
    // Auto-pause when the lifetime budget is exhausted.
    status: newSpent >= campaign.budgetCents ? "OUT_OF_BUDGET" : campaign.status,
  });

  // Earner accrues into pending.
  await ctx.db.patch(earner._id, {
    pendingCents: earner.pendingCents + earnedCents,
  });

  // Double-entry: -billed (advertiser) + earned (earner) + platform = 0.
  await ctx.db.insert("ledgerEntries", {
    type: "AD_SPEND",
    amountCents: -billedCents,
    currency: "USD",
    advertiserId: advertiser._id,
    impressionId: opts.impressionId,
    clickId: opts.clickId,
  });
  await ctx.db.insert("ledgerEntries", {
    type: "EARNER_ACCRUAL",
    amountCents: earnedCents,
    currency: "USD",
    earnerId: earner._id,
    impressionId: opts.impressionId,
    clickId: opts.clickId,
  });
  await ctx.db.insert("ledgerEntries", {
    type: "PLATFORM_REVENUE",
    amountCents: platformCents,
    currency: "USD",
    impressionId: opts.impressionId,
    clickId: opts.clickId,
  });

  return { billedCents, earnedCents, platformCents };
}

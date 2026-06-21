// Adivari AI — Convex database schema
// Source of truth: SPEC.md. Models accounts, campaigns, ad delivery, work
// sessions, the double-entry ledger, and payouts.
//
// Conventions:
// - Money is stored in integer minor units (cents) to avoid float drift.
// - All amounts are USD for v0.1.
// - Relations are modeled as `v.id("table")` references; we index every field
//   we filter or join on (Convex requires explicit indexes for efficient reads).
// - Enum-like fields use `v.union(v.literal(...))`.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Reusable literal unions ----------------------------------------------------

const userRole = v.union(
  v.literal("EARNER"),
  v.literal("ADVERTISER"),
  v.literal("ADMIN"),
);

const kycStatus = v.union(
  v.literal("NONE"),
  v.literal("PENDING"),
  v.literal("VERIFIED"),
  v.literal("REJECTED"),
);

const payoutMethod = v.union(
  v.literal("STRIPE_CONNECT"),
  v.literal("PAYPAL"),
  v.literal("TREMENDOUS"),
);

const bidType = v.union(
  v.literal("CPM"), // cost per 1,000 viewable impressions
  v.literal("CPC"), // cost per click
);

const campaignStatus = v.union(
  v.literal("DRAFT"),
  v.literal("ACTIVE"),
  v.literal("PAUSED"),
  v.literal("OUT_OF_BUDGET"),
  v.literal("COMPLETED"),
  v.literal("REJECTED"),
);

const creativeType = v.union(
  v.literal("IMAGE"),
  v.literal("HTML"),
  v.literal("VIDEO"), // VAST, Phase 4
);

const moderationStatus = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
);

const detectionSource = v.union(
  v.literal("HOOK"), // official agent hook (highest trust)
  v.literal("WRAPPER"), // `adivari run <cmd>`
  v.literal("HEURISTIC"),
  v.literal("MANUAL"), // lowest trust
);

const ledgerEntryType = v.union(
  v.literal("TOPUP"), // advertiser adds funds
  v.literal("AD_SPEND"), // advertiser charged for impression/click
  v.literal("EARNER_ACCRUAL"), // earner credited revshare
  v.literal("PLATFORM_REVENUE"), // platform margin
  v.literal("PAYOUT"), // earner withdrawal
  v.literal("REFUND"), // IVT refund to advertiser
  v.literal("ADJUSTMENT"), // manual correction
);

const paymentStatus = v.union(
  v.literal("PENDING"),
  v.literal("SUCCEEDED"),
  v.literal("FAILED"),
);

const payoutStatus = v.union(
  v.literal("PENDING"), // accrued, inside hold window
  v.literal("AVAILABLE"), // cleared hold + review, withdrawable
  v.literal("REQUESTED"),
  v.literal("PROCESSING"),
  v.literal("PAID"),
  v.literal("FAILED"),
);

// Schema ---------------------------------------------------------------------

export default defineSchema({
  // --- Identity & accounts ---

  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    role: userRole,
    // Auth identity link (Convex Auth / Clerk subject). passwordHash only if we
    // ever run our own credentials.
    authSubject: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_authSubject", ["authSubject"]),

  earnerProfiles: defineTable({
    userId: v.id("users"),
    trustScore: v.number(), // 0..100, drives hold length / caps / review
    revshareBps: v.number(), // earner share in basis points (6000 = 60%)
    payoutMethod: v.optional(payoutMethod),
    payoutAccountId: v.optional(v.string()), // external provider id
    kycStatus: kycStatus,
    countryCode: v.optional(v.string()),
    // Running balances in cents, maintained transactionally alongside ledger.
    pendingCents: v.number(),
    availableCents: v.number(),
  }).index("by_userId", ["userId"]),

  devices: defineTable({
    earnerId: v.id("earnerProfiles"),
    fingerprint: v.string(), // hashed device fingerprint
    os: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_earner", ["earnerId"])
    .index("by_fingerprint", ["fingerprint"])
    .index("by_earner_fingerprint", ["earnerId", "fingerprint"]),

  advertiserAccounts: defineTable({
    userId: v.id("users"),
    companyName: v.optional(v.string()),
    balanceCents: v.number(), // prepaid balance; campaign spend draws down
    stripeCustomerId: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  // --- Campaigns & creatives ---

  campaigns: defineTable({
    advertiserId: v.id("advertiserAccounts"),
    name: v.string(),
    status: campaignStatus,
    bidType: bidType,
    bidCents: v.number(), // per-1000-impressions (CPM) or per-click (CPC)
    // For CPC auctions: predicted click-through rate in basis points (100 = 1%).
    // Used to compute an effective per-impression value for ranking.
    predictedCtrBps: v.optional(v.number()),
    budgetCents: v.number(), // lifetime budget
    dailyCapCents: v.optional(v.number()),
    spentCents: v.number(),
    spentTodayCents: v.number(), // reset by daily cron
    // Targeting (v1: simple). Empty array = no restriction.
    targetCountries: v.array(v.string()),
    targetLanguages: v.array(v.string()),
    targetTags: v.array(v.string()),
    frequencyCapPerDay: v.optional(v.number()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
  })
    .index("by_advertiser", ["advertiserId"])
    .index("by_status", ["status"]),

  creatives: defineTable({
    campaignId: v.id("campaigns"),
    type: creativeType,
    assetId: v.optional(v.id("_storage")), // Convex file storage handle
    assetUrl: v.optional(v.string()), // or external CDN url / hosted HTML
    clickUrl: v.string(), // advertiser landing page
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    moderation: moderationStatus,
  }).index("by_campaign", ["campaignId"]),

  // --- Work sessions (agent busy time) ---

  workSessions: defineTable({
    earnerId: v.id("earnerProfiles"),
    deviceId: v.optional(v.id("devices")),
    agent: v.string(), // "claude-code", "codex", ...
    source: detectionSource,
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    busyMs: v.number(), // total verified busy ms within session
  }).index("by_earner", ["earnerId", "startedAt"]),

  busyIntervals: defineTable({
    sessionId: v.id("workSessions"),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    livenessIssued: v.number(),
    livenessPassed: v.number(),
  }).index("by_session", ["sessionId"]),

  // --- Ad delivery events ---

  impressions: defineTable({
    campaignId: v.id("campaigns"),
    creativeId: v.id("creatives"),
    earnerId: v.id("earnerProfiles"),
    sessionId: v.optional(v.id("workSessions")),
    token: v.string(), // single-use signed token; enforces dedupe
    servedAt: v.number(),
    viewableAt: v.optional(v.number()),
    viewable: v.boolean(),
    billedCents: v.number(), // snapshot charged to advertiser
    earnedCents: v.number(), // snapshot accrued to earner
    ivtReason: v.optional(v.string()), // non-null => excluded from billing
    // Hold lifecycle: earned money is pending until settled (moved to available).
    settled: v.boolean(),
  })
    .index("by_token", ["token"])
    .index("by_earner_settled", ["earnerId", "settled"])
    .index("by_campaign", ["campaignId", "servedAt"])
    .index("by_earner", ["earnerId", "servedAt"]),

  clicks: defineTable({
    impressionId: v.id("impressions"),
    campaignId: v.id("campaigns"),
    creativeId: v.id("creatives"),
    earnerId: v.id("earnerProfiles"),
    clickedAt: v.number(),
    valid: v.boolean(),
    billedCents: v.number(),
    earnedCents: v.number(),
    ivtReason: v.optional(v.string()),
    settled: v.boolean(),
  })
    .index("by_impression", ["impressionId"])
    .index("by_campaign", ["campaignId", "clickedAt"])
    .index("by_earner_settled", ["earnerId", "settled"]),

  // --- Ledger, balances, payments ---

  // Double-entry-style ledger. Each economic event produces entries that net to
  // zero across accounts. `amountCents` is signed relative to the named account.
  ledgerEntries: defineTable({
    type: ledgerEntryType,
    amountCents: v.number(), // signed
    currency: v.string(), // "USD"
    advertiserId: v.optional(v.id("advertiserAccounts")),
    earnerId: v.optional(v.id("earnerProfiles")),
    // Optional links to the originating event, for auditability.
    impressionId: v.optional(v.id("impressions")),
    clickId: v.optional(v.id("clicks")),
    payoutId: v.optional(v.id("payouts")),
    topUpId: v.optional(v.id("topUps")),
  })
    .index("by_advertiser", ["advertiserId"])
    .index("by_earner", ["earnerId"])
    .index("by_type", ["type"]),

  topUps: defineTable({
    advertiserId: v.id("advertiserAccounts"),
    amountCents: v.number(),
    stripePaymentIntentId: v.optional(v.string()),
    status: paymentStatus,
  }).index("by_advertiser", ["advertiserId"]),

  payouts: defineTable({
    earnerId: v.id("earnerProfiles"),
    amountCents: v.number(),
    method: payoutMethod,
    status: payoutStatus,
    holdUntil: v.optional(v.number()), // becomes AVAILABLE after this + review
    externalRef: v.optional(v.string()), // provider transfer id
    paidAt: v.optional(v.number()),
  }).index("by_earner_status", ["earnerId", "status"]),
});

// Scheduled jobs: daily budget reset and hold release.

import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { HOLD_DAYS, DAY_MS } from "./lib";

/** Reset each campaign's daily spend counter. */
export const resetDailySpend = internalMutation({
  args: {},
  handler: async (ctx) => {
    const campaigns = await ctx.db.query("campaigns").collect();
    for (const c of campaigns) {
      if (c.spentTodayCents !== 0) {
        await ctx.db.patch(c._id, { spentTodayCents: 0 });
      }
    }
  },
});

/**
 * Move earner accruals past the hold window from pending -> available.
 * Settles viewable impressions and clicks older than HOLD_DAYS.
 */
export const releaseHolds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - HOLD_DAYS * DAY_MS;
    const profiles = await ctx.db.query("earnerProfiles").collect();

    for (const earner of profiles) {
      let release = 0;

      const imps = await ctx.db
        .query("impressions")
        .withIndex("by_earner_settled", (q) =>
          q.eq("earnerId", earner._id).eq("settled", false),
        )
        .collect();
      for (const i of imps) {
        if (i.viewable && i.viewableAt && i.viewableAt < cutoff) {
          release += i.earnedCents;
          await ctx.db.patch(i._id, { settled: true });
        }
      }

      const clicks = await ctx.db
        .query("clicks")
        .withIndex("by_earner_settled", (q) =>
          q.eq("earnerId", earner._id).eq("settled", false),
        )
        .collect();
      for (const c of clicks) {
        if (c.clickedAt < cutoff) {
          release += c.earnedCents;
          await ctx.db.patch(c._id, { settled: true });
        }
      }

      if (release > 0) {
        await ctx.db.patch(earner._id, {
          pendingCents: Math.max(0, earner.pendingCents - release),
          availableCents: earner.availableCents + release,
        });
      }
    }
  },
});

const crons = cronJobs();
crons.daily(
  "reset daily spend",
  { hourUTC: 0, minuteUTC: 0 },
  internal.crons.resetDailySpend,
);
crons.hourly(
  "release holds",
  { minuteUTC: 0 },
  internal.crons.releaseHolds,
);
export default crons;

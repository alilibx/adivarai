"use client";

import { usd } from "@/lib/format";

// The hero of the whole experience: a live financial readout of what you're
// earning right now. Mono + tabular figures = an instrument, not a label.
export function EarningsMeter({
  ratePerHr,
  sessionCents,
  views,
  pulseKey,
  lastDelta,
  live,
}: {
  ratePerHr: number;
  sessionCents: number;
  views: number;
  pulseKey: number;
  lastDelta: number;
  live: boolean;
}) {
  return (
    <div className="relative flex items-end justify-between px-1 pt-1">
      <div>
        <div className="flex items-center gap-2">
          <span className="eyebrow">Earning / hr</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              live ? "bg-gold animate-breathe" : "bg-edge"
            }`}
          />
        </div>
        <div
          className="font-mono text-4xl font-bold tabular-nums text-gold"
          style={{ textShadow: "0 0 24px rgba(244,183,64,0.35)" }}
        >
          {usd(ratePerHr)}
        </div>
      </div>

      <div className="text-right font-mono text-xs text-muted">
        <div className="tabular-nums text-ink">{usd(sessionCents)}</div>
        <div>this session · {views} ads</div>
      </div>

      {/* +¢ fly-up each time an ad pays out */}
      {pulseKey > 0 && (
        <span
          key={pulseKey}
          className="animate-flyup pointer-events-none absolute -top-1 left-0 font-mono text-sm font-bold text-gold"
        >
          +{usd(lastDelta)}
        </span>
      )}
    </div>
  );
}

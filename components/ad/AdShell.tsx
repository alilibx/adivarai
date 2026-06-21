"use client";

import { usd } from "@/lib/format";
import { AdStage } from "./AdStage";

type Bridge = {
  connected: boolean;
  busy: boolean;
  agent: string | null;
  source: string | null;
};

function Mark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-brand to-gold text-xs font-bold text-black">
        A
      </span>
      <span className="font-display text-sm font-semibold tracking-tight">
        Adivari
      </span>
    </span>
  );
}

export function AdShell({
  userId,
  sessionId,
  bridge,
  manual,
  availableCents,
  lifetimeCents,
  onStartManual,
  onStop,
}: {
  userId: any;
  sessionId: any;
  bridge: Bridge;
  manual: boolean;
  availableCents: number;
  lifetimeCents: number;
  onStartManual: () => void;
  onStop: () => void;
}) {
  // FULL: a session is running — show the ad experience.
  if (sessionId) {
    const status = manual
      ? "Manual session"
      : bridge.busy
        ? `${bridge.agent ?? "agent"} · working`
        : "Live";
    return (
      <div className="glass animate-expand w-full max-w-md space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Mark />
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-breathe" />
              {status}
            </span>
            <button
              onClick={onStop}
              className="rounded-lg border border-edge px-2.5 py-1 text-xs text-muted transition hover:text-ink"
            >
              Stop
            </button>
          </div>
        </div>

        <AdStage userId={userId} sessionId={sessionId} />

        <div className="flex items-center justify-between border-t border-white/5 pt-2 font-mono text-[11px] text-muted">
          <span>
            Available <span className="text-gold">{usd(availableCents)}</span>
          </span>
          <span>Lifetime {usd(lifetimeCents)}</span>
        </div>
      </div>
    );
  }

  // MINI: idle — a glanceable pill.
  const idleStatus = !bridge.connected
    ? "bridge offline"
    : bridge.busy
      ? "starting…"
      : "agent idle";
  return (
    <div className="glass flex w-full max-w-sm items-center gap-3 px-4 py-3">
      <Mark />
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            bridge.connected ? "bg-ok" : "bg-edge"
          }`}
        />
        {idleStatus}
      </span>
      <span className="ml-auto font-mono text-sm tabular-nums text-gold">
        {usd(availableCents)}
      </span>
      <button onClick={onStartManual} className="btn-gold px-3 py-1.5 text-xs">
        Start ▸
      </button>
    </div>
  );
}

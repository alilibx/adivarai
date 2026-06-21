"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/app/providers";
import { usd, num, timeAgo } from "@/lib/format";
import { AdStage } from "@/components/ad/AdStage";
import { useAgentBridge } from "@/lib/useAgentBridge";

type Source = "HOOK" | "WRAPPER" | "HEURISTIC" | "MANUAL";

export default function EarnerPage() {
  const { session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session === null) router.replace("/login?role=EARNER");
    else if (session.role !== "EARNER") router.replace("/advertiser");
  }, [session, router]);
  if (!session || session.role !== "EARNER") return null;
  return <Dashboard userId={session.userId} />;
}

const AGENTS = ["claude-code", "codex", "cursor", "gemini-cli"];
const SOURCES = ["HOOK", "WRAPPER", "HEURISTIC", "MANUAL"] as const;

function Dashboard({ userId }: { userId: any }) {
  const data = useQuery(api.earnings.dashboard, { userId });
  const startSession = useMutation(api.earnings.startSession);
  const endSession = useMutation(api.earnings.endSession);
  const requestPayout = useMutation(api.earnings.requestPayout);

  const [agent, setAgent] = useState(AGENTS[0]);
  const [source, setSource] = useState<Source>("HOOK");
  const [sessionId, setSessionId] = useState<any>(null);
  const [autoMode, setAutoMode] = useState(false);
  const transitioning = useRef(false);

  // Auto mode: subscribe to the local agent bridge (`adivari daemon`).
  const bridge = useAgentBridge(autoMode);

  // Resume an existing active session after reload.
  useEffect(() => {
    if (data?.activeSessionId && !sessionId) setSessionId(data.activeSessionId);
  }, [data?.activeSessionId, sessionId]);

  async function start(a: string = agent, s: Source = source) {
    if (transitioning.current || sessionId) return;
    transitioning.current = true;
    try {
      const id = await startSession({ userId, agent: a, source: s });
      setSessionId(id);
    } finally {
      transitioning.current = false;
    }
  }
  async function stop() {
    if (sessionId) await endSession({ userId, sessionId });
    setSessionId(null);
  }

  // Drive sessions from the real agent's busy/idle when auto mode is on.
  useEffect(() => {
    if (!autoMode || !bridge.connected) return;
    if (bridge.busy && !sessionId) {
      void start(bridge.agent ?? "agent", bridge.source ?? "WRAPPER");
    } else if (!bridge.busy && sessionId) {
      void stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, bridge.connected, bridge.busy, sessionId]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Earn dashboard</h1>
        <p className="text-sm text-zinc-400">
          Start a work session when your agent runs. You earn{" "}
          {((data?.revshareBps ?? 6000) / 100).toFixed(0)}% of what advertisers
          pay for the ads you view.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Available" value={usd(data?.availableCents ?? 0)} accent />
        <Stat label="Pending (in hold)" value={usd(data?.pendingCents ?? 0)} />
        <Stat label="Lifetime earned" value={usd(data?.lifetimeCents ?? 0)} />
        <Stat label="Ads viewed" value={num(data?.viewableCount ?? 0)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <div className="panel space-y-4 p-5">
            <h2 className="text-lg font-semibold">Work session</h2>

            {/* Auto mode: connect to the real local coding agent. */}
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-edge px-3 py-2">
              <span className="text-sm">
                Auto mode
                <span className="block text-xs text-zinc-500">
                  Detect my agent via <code>adivari daemon</code>
                </span>
              </span>
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
            </label>

            {autoMode ? (
              <div className="rounded-lg bg-black/30 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      bridge.connected ? "bg-ok" : "bg-zinc-600"
                    }`}
                  />
                  {bridge.connected ? "Bridge connected" : "Waiting for bridge…"}
                </div>
                {!bridge.connected && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Run <code className="text-brand2">adivari daemon</code> and{" "}
                    <code className="text-brand2">adivari hooks install</code>,
                    then use your agent.
                  </p>
                )}
                {bridge.connected && (
                  <p className="mt-2 text-xs text-zinc-400">
                    {bridge.busy
                      ? `● ${bridge.agent} working (${bridge.source}) — ads playing`
                      : "○ agent idle — ads paused"}
                  </p>
                )}
              </div>
            ) : !sessionId ? (
              <>
                <div>
                  <label className="label">Agent</label>
                  <select
                    className="input"
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                  >
                    {AGENTS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Detection source</label>
                  <select
                    className="input"
                    value={source}
                    onChange={(e) => setSource(e.target.value as Source)}
                  >
                    {SOURCES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">
                    Higher-trust sources (HOOK) earn the full share; MANUAL is
                    discounted.
                  </p>
                </div>
                <button className="btn-brand w-full" onClick={() => start()}>
                  ▶ Start working (play ads)
                </button>
              </>
            ) : (
              <button className="btn-ghost w-full" onClick={stop}>
                ⏹ Stop session
              </button>
            )}
          </div>

          <div className="panel space-y-3 p-5">
            <h2 className="text-lg font-semibold">Cash out</h2>
            <p className="text-sm text-zinc-400">
              Available balance becomes withdrawable after a 7-day hold.
            </p>
            <button
              className="btn-brand w-full"
              disabled={(data?.availableCents ?? 0) < 1000}
              onClick={() => requestPayout({ userId, method: "PAYPAL" })}
            >
              Withdraw {usd(data?.availableCents ?? 0)}
            </button>
            {(data?.availableCents ?? 0) < 1000 && (
              <p className="text-xs text-zinc-500">$10.00 minimum.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {sessionId ? (
            <div className="glass p-4">
              <AdStage userId={userId} sessionId={sessionId} />
            </div>
          ) : (
            <div className="panel grid place-items-center p-10 text-center text-sm text-zinc-500">
              Start a work session to begin earning.
            </div>
          )}

          <div className="panel p-5">
            <h3 className="mb-3 font-semibold">Recent ads</h3>
            <div className="space-y-1 text-sm">
              {data?.recent.length === 0 && (
                <p className="text-zinc-500">Nothing yet.</p>
              )}
              {data?.recent.map((r) => (
                <div
                  key={r._id}
                  className="flex justify-between border-b border-edge/50 py-1 last:border-0"
                >
                  <span className="text-zinc-400">
                    {r.viewable ? "✓ viewed" : "served"} · {timeAgo(r.servedAt)}
                  </span>
                  <span className="text-ok">{usd(r.earnedCents)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="stat">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? "text-ok" : ""}`}>
        {value}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/app/providers";
import { usd, num, timeAgo } from "@/lib/format";
import { AdPlayer } from "@/components/AdPlayer";

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
  const [source, setSource] = useState<(typeof SOURCES)[number]>("HOOK");
  const [sessionId, setSessionId] = useState<any>(null);

  // Resume an existing active session after reload.
  useEffect(() => {
    if (data?.activeSessionId && !sessionId) setSessionId(data.activeSessionId);
  }, [data?.activeSessionId, sessionId]);

  async function start() {
    const id = await startSession({ userId, agent, source });
    setSessionId(id);
  }
  async function stop() {
    if (sessionId) await endSession({ userId, sessionId });
    setSessionId(null);
  }

  return (
    <div className="space-y-8">
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
            {!sessionId ? (
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
                    onChange={(e) => setSource(e.target.value as any)}
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
                <button className="btn-brand w-full" onClick={start}>
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
            <AdPlayer userId={userId} sessionId={sessionId} />
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

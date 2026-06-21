"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/app/providers";
import { useAgentBridge } from "@/lib/useAgentBridge";
import { AdPlayer } from "@/components/AdPlayer";
import { usd } from "@/lib/format";
import { showWindow, hideWindow } from "@/lib/desktop";

type Source = "HOOK" | "WRAPPER" | "HEURISTIC" | "MANUAL";

// Compact ad surface for the desktop companion window: no dashboard chrome,
// always in auto mode (driven by the local agent bridge).
export default function SurfacePage() {
  const { session } = useSession();
  if (!session) return <SignIn />;
  if (session.role !== "EARNER")
    return (
      <p className="p-6 text-center text-sm text-zinc-400">
        Sign in as a developer to earn here.
      </p>
    );
  return <Surface userId={session.userId} />;
}

function SignIn() {
  const { setSession } = useSession();
  const signUp = useMutation(api.auth.signUp);
  const signIn = useMutation(api.auth.signIn);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Make sure the window is visible so the user can sign in.
  useEffect(() => {
    void showWindow();
  }, []);

  async function go(mode: "signup" | "signin") {
    setErr(null);
    try {
      const res =
        mode === "signup"
          ? await signUp({ email, role: "EARNER" })
          : await signIn({ email });
      setSession({ userId: res.userId, role: res.role as any, email });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="mx-auto max-w-sm p-4">
      <h1 className="text-lg font-semibold">Adivari</h1>
      <p className="mb-3 text-sm text-zinc-400">Sign in to start earning.</p>
      <input
        className="input mb-2"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {err && <p className="mb-2 text-sm text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-brand flex-1" onClick={() => go("signup")}>
          Create account
        </button>
        <button className="btn-ghost" onClick={() => go("signin")}>
          Sign in
        </button>
      </div>
    </div>
  );
}

function Surface({ userId }: { userId: any }) {
  const data = useQuery(api.earnings.dashboard, { userId });
  const startSession = useMutation(api.earnings.startSession);
  const endSession = useMutation(api.earnings.endSession);
  const bridge = useAgentBridge(true); // auto-detect the local agent if present
  const [sessionId, setSessionId] = useState<any>(null);
  const [manual, setManual] = useState(false); // true => user started it by hand
  const transitioning = useRef(false);

  useEffect(() => {
    if (data?.activeSessionId && !sessionId) setSessionId(data.activeSessionId);
  }, [data?.activeSessionId, sessionId]);

  // Auto mode drives sessions from the bridge, but never stops a manual session.
  useEffect(() => {
    if (!bridge.connected || manual) return;
    (async () => {
      if (bridge.busy && !sessionId && !transitioning.current) {
        transitioning.current = true;
        try {
          const id = await startSession({
            userId,
            agent: bridge.agent ?? "agent",
            source: (bridge.source ?? "WRAPPER") as Source,
          });
          setSessionId(id);
        } finally {
          transitioning.current = false;
        }
      } else if (!bridge.busy && sessionId) {
        await endSession({ userId, sessionId });
        setSessionId(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge.connected, bridge.busy, sessionId, manual]);

  async function startManual() {
    if (transitioning.current || sessionId) return;
    transitioning.current = true;
    try {
      const id = await startSession({ userId, agent: "manual", source: "MANUAL" });
      setManual(true);
      setSessionId(id);
    } finally {
      transitioning.current = false;
    }
  }
  async function stop() {
    if (sessionId) await endSession({ userId, sessionId });
    setSessionId(null);
    setManual(false);
  }

  // Desktop: pop the window up when the agent starts working, hide it when the
  // agent goes idle (but never while a manual session is running).
  useEffect(() => {
    if (!bridge.connected) return;
    if (bridge.busy) void showWindow();
    else if (!manual) void hideWindow();
  }, [bridge.connected, bridge.busy, manual]);

  return (
    <div className="mx-auto max-w-md space-y-3 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <span className="grid h-5 w-5 place-items-center rounded bg-brand text-xs text-white">
            A
          </span>
          Adivari
        </span>
        <span className="text-zinc-400">
          {usd(data?.availableCents ?? 0)} available
        </span>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-edge bg-black/30 px-3 py-1.5 text-xs">
        <span
          className={`h-2 w-2 rounded-full ${
            bridge.connected ? (bridge.busy ? "bg-ok" : "bg-zinc-500") : "bg-zinc-700"
          }`}
        />
        {!bridge.connected
          ? "Bridge offline — run `adivari daemon`"
          : bridge.busy
            ? `${bridge.agent} working (${bridge.source})`
            : "Agent idle — waiting"}
      </div>

      {sessionId ? (
        <AdPlayer userId={userId} sessionId={sessionId} />
      ) : (
        <div className="panel grid place-items-center gap-3 p-6 text-center text-sm text-zinc-500">
          <span>Ads play here while your agent works.</span>
          <span className="text-xs">
            Using a desktop/GUI agent? Start a session manually:
          </span>
        </div>
      )}

      {/* Manual control — for GUI agents that can't be auto-detected. */}
      {sessionId ? (
        <button className="btn-ghost w-full" onClick={stop}>
          ⏹ Stop session
        </button>
      ) : (
        <button className="btn-brand w-full" onClick={startManual}>
          ▶ Start working manually
        </button>
      )}

      <p className="text-center text-[11px] text-zinc-600">
        Lifetime {usd(data?.lifetimeCents ?? 0)} · {data?.viewableCount ?? 0} ads
      </p>
    </div>
  );
}

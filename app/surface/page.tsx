"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/app/providers";
import { useAgentBridge } from "@/lib/useAgentBridge";
import { AdShell } from "@/components/ad/AdShell";
import { showWindow, hideWindow } from "@/lib/desktop";

type Source = "HOOK" | "WRAPPER" | "HEURISTIC" | "MANUAL";

// Compact, premium ad surface for the desktop companion window (and the web).
export default function SurfacePage() {
  const { session } = useSession();
  if (!session) return <SignIn />;
  if (session.role !== "EARNER")
    return (
      <div className="grid min-h-[60vh] place-items-center px-4 text-center text-sm text-muted">
        Sign in as a developer to earn here.
      </div>
    );
  return <Surface userId={session.userId} />;
}

function SignIn() {
  const { setSession } = useSession();
  const signUp = useMutation(api.auth.signUp);
  const signIn = useMutation(api.auth.signIn);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

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
    <div className="mx-auto max-w-sm px-4 py-10">
      <div className="glass p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-brand to-gold text-xs font-bold text-black">
            A
          </span>
          <h1 className="font-display text-lg font-semibold">Adivari</h1>
        </div>
        <p className="mb-4 text-sm text-muted">Sign in to start earning.</p>
        <input
          className="input mb-2"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {err && <p className="mb-2 text-sm text-red-400">{err}</p>}
        <div className="flex gap-2">
          <button className="btn-gold flex-1" onClick={() => go("signup")}>
            Create account
          </button>
          <button className="btn-ghost" onClick={() => go("signin")}>
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

function Surface({ userId }: { userId: any }) {
  const data = useQuery(api.earnings.dashboard, { userId });
  const startSession = useMutation(api.earnings.startSession);
  const endSession = useMutation(api.earnings.endSession);
  const bridge = useAgentBridge(true);
  const [sessionId, setSessionId] = useState<any>(null);
  const [manual, setManual] = useState(false);
  const transitioning = useRef(false);

  useEffect(() => {
    if (data?.activeSessionId && !sessionId) setSessionId(data.activeSessionId);
  }, [data?.activeSessionId, sessionId]);

  // Auto mode drives sessions from the bridge; never stops a manual session.
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

  // Desktop: pop up when working, hide when idle (never during a manual session).
  useEffect(() => {
    if (!bridge.connected) return;
    if (bridge.busy) void showWindow();
    else if (!manual) void hideWindow();
  }, [bridge.connected, bridge.busy, manual]);

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

  return (
    <div className="grid min-h-[70vh] place-items-center px-4 py-6">
      <AdShell
        userId={userId}
        sessionId={sessionId}
        bridge={bridge}
        manual={manual}
        availableCents={data?.availableCents ?? 0}
        lifetimeCents={data?.lifetimeCents ?? 0}
        onStartManual={startManual}
        onStop={stop}
      />
    </div>
  );
}

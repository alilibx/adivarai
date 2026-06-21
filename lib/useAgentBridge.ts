"use client";

import { useEffect, useRef, useState } from "react";

// Connects to the local Adivari agent bridge (started by `adivari daemon`) and
// streams busy/idle state via Server-Sent Events. Used to drive the ad surface
// automatically from the real coding agent.

const BRIDGE_URL =
  process.env.NEXT_PUBLIC_ADIVARI_BRIDGE ?? "http://127.0.0.1:8787";

export type BridgeState = {
  connected: boolean;
  busy: boolean;
  agent: string | null;
  source: "HOOK" | "WRAPPER" | "HEURISTIC" | "MANUAL" | null;
};

const initial: BridgeState = {
  connected: false,
  busy: false,
  agent: null,
  source: null,
};

export function useAgentBridge(enabled: boolean): BridgeState {
  const [state, setState] = useState<BridgeState>(initial);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      esRef.current?.close();
      esRef.current = null;
      setState(initial);
      return;
    }

    let cancelled = false;
    const es = new EventSource(`${BRIDGE_URL}/stream`);
    esRef.current = es;

    es.onopen = () => !cancelled && setState((s) => ({ ...s, connected: true }));
    es.onmessage = (e) => {
      if (cancelled) return;
      try {
        const d = JSON.parse(e.data);
        setState({
          connected: true,
          busy: !!d.busy,
          agent: d.agent ?? null,
          source: d.source ?? null,
        });
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; reflect the dropped connection meanwhile.
      if (!cancelled) setState((s) => ({ ...s, connected: false }));
    };

    return () => {
      cancelled = true;
      es.close();
      esRef.current = null;
    };
  }, [enabled]);

  return state;
}

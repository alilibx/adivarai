// Shared config for the Adivari agent bridge.

export const BRIDGE_PORT = Number(process.env.ADIVARI_PORT ?? 8787);
export const BRIDGE_HOST = "127.0.0.1";
export const BRIDGE_URL = `http://${BRIDGE_HOST}:${BRIDGE_PORT}`;

/** A busy state auto-expires if no heartbeat arrives within this window. */
export const BUSY_TTL_MS = 5 * 60 * 1000;

/** Wrapper: mark idle after this much output silence. */
export const WRAPPER_IDLE_AFTER_MS = 4000;

export type Source = "HOOK" | "WRAPPER" | "HEURISTIC" | "MANUAL";

export type AgentEvent = {
  type: "busy" | "idle";
  agent?: string;
  source?: Source;
};

export type BridgeStatus = {
  busy: boolean;
  agent: string | null;
  source: Source | null;
  since: number; // ms epoch of last state change
};

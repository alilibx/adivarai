// Pure busy/idle state machine. No I/O so it is easy to unit test.
// Events come from Claude Code hooks (precise) or the CLI wrapper (heuristic);
// a watchdog forces idle if a busy state is never closed (e.g. agent crashed).

import { AgentEvent, BridgeStatus, BUSY_TTL_MS, Source } from "./config";

export class Detector {
  private busy = false;
  private agent: string | null = null;
  private source: Source | null = null;
  private since = Date.now();
  private lastHeartbeat = 0;

  constructor(private readonly busyTtlMs: number = BUSY_TTL_MS) {}

  status(): BridgeStatus {
    return { busy: this.busy, agent: this.agent, source: this.source, since: this.since };
  }

  /** Apply an event. Returns true if the externally-visible state changed. */
  apply(event: AgentEvent, now: number = Date.now()): boolean {
    if (event.type === "busy") {
      this.lastHeartbeat = now;
      const changed = !this.busy;
      this.busy = true;
      // Always refresh attribution; only bump `since` on a real transition.
      this.agent = event.agent ?? this.agent;
      this.source = event.source ?? this.source;
      if (changed) this.since = now;
      return changed;
    }
    // idle
    if (!this.busy) return false;
    this.busy = false;
    this.since = now;
    return true;
  }

  /** Watchdog: expire a stale busy state. Returns true if it flipped to idle. */
  tick(now: number = Date.now()): boolean {
    if (this.busy && now - this.lastHeartbeat > this.busyTtlMs) {
      this.busy = false;
      this.since = now;
      return true;
    }
    return false;
  }
}

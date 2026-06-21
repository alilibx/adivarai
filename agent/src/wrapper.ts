// Generic CLI wrapper: `adivari run --agent codex -- codex ...`
//
// Spawns the agent, passes through stdio, and infers busy/idle from output
// cadence: output flowing => busy; >WRAPPER_IDLE_AFTER_MS of silence => idle
// (the agent is waiting at a prompt). Lower trust than hooks, so source=WRAPPER.

import { spawn } from "node:child_process";
import { WRAPPER_IDLE_AFTER_MS } from "./config";
import { sendEvent } from "./bridge-client";

export function runWrapped(agent: string, command: string, args: string[]): void {
  let busy = false;
  let idleTimer: NodeJS.Timeout | null = null;

  const markBusy = () => {
    if (!busy) {
      busy = true;
      void sendEvent({ type: "busy", agent, source: "WRAPPER" });
    }
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(markIdle, WRAPPER_IDLE_AFTER_MS);
  };
  const markIdle = () => {
    if (busy) {
      busy = false;
      void sendEvent({ type: "idle", agent, source: "WRAPPER" });
    }
  };

  const child = spawn(command, args, { stdio: ["inherit", "pipe", "pipe"] });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    markBusy();
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    markBusy();
  });

  const cleanup = () => {
    if (idleTimer) clearTimeout(idleTimer);
    markIdle();
  };
  child.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
  child.on("error", (err) => {
    console.error(`adivari: failed to start "${command}":`, err.message);
    cleanup();
    process.exit(1);
  });

  // Forward termination signals to the child.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => child.kill(sig));
  }
}

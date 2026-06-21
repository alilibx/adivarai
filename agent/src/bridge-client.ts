// Tiny client for talking to the local bridge daemon. Used by the `hook` and
// `run` commands. Fire-and-forget with a short timeout so we never block the
// coding agent.

import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { BRIDGE_HOST, BRIDGE_PORT, AgentEvent, BridgeStatus } from "./config";

export function sendEvent(event: AgentEvent, timeoutMs = 800): Promise<void> {
  return new Promise((resolve) => {
    const body = JSON.stringify(event);
    const req = http.request(
      {
        host: BRIDGE_HOST,
        port: BRIDGE_PORT,
        path: "/event",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve());
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on("error", () => resolve()); // daemon not running -> ignore
    req.end(body);
  });
}

/**
 * Make sure the bridge is running. If nothing answers /health, spawn a detached
 * daemon that outlives this short-lived process. Lets hooks "just work" without
 * the user starting `adivari daemon` by hand.
 */
export async function ensureDaemon(): Promise<void> {
  if (await getHealth(400)) return;
  const cli = path.resolve(__dirname, "cli.js");
  const child = spawn(process.execPath, [cli, "daemon"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  // Give it a moment to bind the port before we POST.
  await new Promise((r) => setTimeout(r, 500));
}

export function getHealth(timeoutMs = 800): Promise<BridgeStatus | null> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: BRIDGE_HOST, port: BRIDGE_PORT, path: "/health", method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

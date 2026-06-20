// Tiny client for talking to the local bridge daemon. Used by the `hook` and
// `run` commands. Fire-and-forget with a short timeout so we never block the
// coding agent.

import http from "node:http";
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

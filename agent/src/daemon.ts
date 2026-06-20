// Local bridge daemon.
//
// - POST /event   { type, agent?, source? }   ingest from hooks / wrapper
// - GET  /stream  Server-Sent Events of BridgeStatus, for the ad surface
// - GET  /health  current status as JSON
//
// Runs on 127.0.0.1 only. No auth: it is a localhost-only event relay; the ad
// surface (which IS authenticated to Convex) decides what to do with events.

import http from "node:http";
import { BRIDGE_HOST, BRIDGE_PORT, AgentEvent } from "./config";
import { Detector } from "./detector";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function startDaemon(port = BRIDGE_PORT): http.Server {
  const detector = new Detector();
  const clients = new Set<http.ServerResponse>();

  function broadcast() {
    const payload = `data: ${JSON.stringify(detector.status())}\n\n`;
    for (const res of clients) res.write(payload);
  }

  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json", ...CORS });
      return res.end(JSON.stringify(detector.status()));
    }

    if (req.method === "GET" && req.url === "/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...CORS,
      });
      res.write(`data: ${JSON.stringify(detector.status())}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (req.method === "POST" && req.url === "/event") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const event = JSON.parse(body || "{}") as AgentEvent;
          if (event.type === "busy" || event.type === "idle") {
            if (detector.apply(event)) broadcast();
          }
          res.writeHead(200, { "Content-Type": "application/json", ...CORS });
          res.end(JSON.stringify(detector.status()));
        } catch {
          res.writeHead(400, CORS);
          res.end("bad event");
        }
      });
      return;
    }

    res.writeHead(404, CORS);
    res.end("not found");
  });

  // Watchdog: expire stale busy states and keep SSE connections warm.
  const timer = setInterval(() => {
    if (detector.tick()) broadcast();
    for (const res of clients) res.write(": ping\n\n");
  }, 15000);
  server.on("close", () => clearInterval(timer));

  server.listen(port, BRIDGE_HOST);
  return server;
}

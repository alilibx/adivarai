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

    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...CORS });
      return res.end(rootPage());
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

const APP_URL = process.env.ADIVARI_APP_URL ?? "http://localhost:3000/earner";

/** A small status/landing page so opening the bridge in a browser isn't a 404. */
function rootPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Adivari bridge</title>
<style>
  body { font: 15px/1.6 system-ui, sans-serif; background:#0a0a0f; color:#e4e4e7;
         max-width:640px; margin:8vh auto; padding:0 20px; }
  .logo { display:inline-grid; place-items:center; width:32px; height:32px;
          border-radius:8px; background:#7c5cff; color:#fff; font-weight:700; }
  .card { border:1px solid #262633; background:#13131c; border-radius:12px; padding:18px; margin-top:18px; }
  code { background:#000; padding:2px 6px; border-radius:5px; color:#22d3ee; }
  a { color:#7c5cff; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px; }
  .ok { background:#34d399 } .off { background:#52525b }
  .muted { color:#a1a1aa; font-size:13px }
</style>
</head>
<body>
  <p><span class="logo">A</span> &nbsp;<strong>Adivari bridge</strong></p>
  <p class="muted">This is the local agent bridge — not the ad page. It relays your
  coding agent's busy/idle state to the Adivari ad surface.</p>

  <div class="card">
    <div id="status"><span class="dot off"></span> connecting…</div>
  </div>

  <div class="card">
    <strong>The ad surface is the web app, not this page:</strong>
    <p>Open <a href="${APP_URL}">${APP_URL}</a>, sign in as a developer, and turn on
    <strong>Auto mode</strong>.</p>
    <p class="muted">Not running yet? In the repo root: <code>npx convex dev</code> then
    <code>npm run dev</code>.</p>
  </div>

  <script>
    async function tick() {
      try {
        const s = await (await fetch('/health')).json();
        document.getElementById('status').innerHTML = s.busy
          ? '<span class="dot ok"></span> ● ' + (s.agent||'agent') + ' working (' + s.source + ') — ads should be playing'
          : '<span class="dot off"></span> ○ agent idle — ads paused';
      } catch (e) {
        document.getElementById('status').innerHTML = '<span class="dot off"></span> bridge unreachable';
      }
    }
    tick(); setInterval(tick, 2000);
  </script>
</body>
</html>`;
}


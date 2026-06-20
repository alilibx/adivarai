import { test } from "node:test";
import assert from "node:assert/strict";
import { Detector } from "./detector";

test("busy then idle transitions are reported once", () => {
  const d = new Detector(1000);
  assert.equal(d.apply({ type: "busy", agent: "claude-code", source: "HOOK" }, 0), true);
  assert.equal(d.status().busy, true);
  assert.equal(d.status().agent, "claude-code");
  // repeated busy heartbeat is not a new transition
  assert.equal(d.apply({ type: "busy", source: "HOOK" }, 100), false);
  assert.equal(d.apply({ type: "idle" }, 200), true);
  assert.equal(d.status().busy, false);
  // idle when already idle is a no-op
  assert.equal(d.apply({ type: "idle" }, 300), false);
});

test("watchdog expires a stale busy state", () => {
  const d = new Detector(1000);
  d.apply({ type: "busy", source: "WRAPPER" }, 0);
  assert.equal(d.tick(500), false); // within TTL
  assert.equal(d.tick(2000), true); // past TTL -> idle
  assert.equal(d.status().busy, false);
});

test("heartbeat refreshes the watchdog", () => {
  const d = new Detector(1000);
  d.apply({ type: "busy", source: "HOOK" }, 0);
  d.apply({ type: "busy", source: "HOOK" }, 800); // heartbeat
  assert.equal(d.tick(1500), false); // 700ms since heartbeat, still busy
  assert.equal(d.tick(2000), true); // now stale
});

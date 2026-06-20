#!/usr/bin/env node
// Adivari agent CLI — connects your coding agent's busy/idle state to the
// Adivari ad surface.

import { startDaemon } from "./daemon";
import { sendEvent, getHealth } from "./bridge-client";
import { installHooks, uninstallHooks, settingsPath } from "./hooks";
import { runWrapped } from "./wrapper";
import { BRIDGE_URL, Source } from "./config";

function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}
function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "daemon": {
      startDaemon();
      const appUrl = process.env.ADIVARI_APP_URL ?? "http://localhost:3000/earner";
      console.log(`adivari bridge listening on ${BRIDGE_URL} (this is the bridge, not the ad page)`);
      console.log(`→ Open the ad surface at ${appUrl} and turn on "Auto mode".`);
      console.log(`  (If it's not running: in the repo root run \`npx convex dev\` then \`npm run dev\`.)`);
      console.log("Leave this running.");
      break;
    }

    case "hook": {
      // Called by Claude Code hooks. Must be fast + silent.
      const state = rest[0];
      if (state !== "busy" && state !== "idle") process.exit(0);
      await sendEvent({
        type: state,
        agent: opt(rest, "agent") ?? "claude-code",
        source: "HOOK",
      });
      process.exit(0);
      break;
    }

    case "hooks": {
      const sub = rest[0];
      const scope = flag(rest, "project") ? "project" : "global";
      if (sub === "install") {
        const file = installHooks(scope);
        console.log(`✓ Installed Claude Code hooks (${scope}) -> ${file}`);
        console.log("Run `adivari daemon` and open the ad surface. Then use Claude Code normally.");
      } else if (sub === "uninstall") {
        const file = uninstallHooks(scope);
        console.log(`✓ Removed Adivari hooks from ${file}`);
      } else {
        console.log(`Usage: adivari hooks <install|uninstall> [--project]`);
        console.log(`(${scope} settings: ${settingsPath(scope)})`);
      }
      break;
    }

    case "run": {
      // adivari run [--agent name] -- <command...>
      const sepIndex = rest.indexOf("--");
      if (sepIndex === -1 || sepIndex === rest.length - 1) {
        console.error("Usage: adivari run [--agent <name>] -- <command> [args...]");
        process.exit(1);
      }
      const agent = opt(rest.slice(0, sepIndex), "agent") ?? "agent";
      const [command, ...args] = rest.slice(sepIndex + 1);
      runWrapped(agent, command, args);
      break;
    }

    case "status": {
      const health = await getHealth();
      if (!health) {
        console.log("✗ bridge not running. Start it with `adivari daemon`.");
        process.exit(1);
      }
      console.log(
        health.busy
          ? `● BUSY — ${health.agent} (${health.source})`
          : "○ idle",
      );
      break;
    }

    case "busy":
    case "idle": {
      // Manual override, e.g. `adivari busy --agent cursor`.
      await sendEvent({
        type: cmd,
        agent: opt(rest, "agent"),
        source: (opt(rest, "source") as Source) ?? "MANUAL",
      });
      console.log(`sent ${cmd}`);
      break;
    }

    default:
      console.log(`Adivari agent CLI

  adivari daemon                 start the local bridge (keep running)
  adivari hooks install          install Claude Code hooks (precise busy/idle)
  adivari hooks uninstall        remove them
  adivari run -- <cmd...>        wrap any agent and infer busy/idle
  adivari status                 show current bridge state
  adivari busy|idle              manual override

Bridge: ${BRIDGE_URL}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

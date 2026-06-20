// Install/uninstall Claude Code hooks so Adivari learns precisely when the
// agent is working: UserPromptSubmit => busy, Stop => idle. These are the
// highest-trust signal (source=HOOK).
//
// Hooks run a short, fire-and-forget `adivari hook <state>` that POSTs to the
// local bridge. Hook failures never block Claude Code.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Explicit marker appended to every command we install, so uninstall can find
// our entries regardless of where the CLI is installed. The `hook` command
// ignores extra args.
const MARKER = "--adivari";

type HookEntry = { matcher?: string; hooks: { type: "command"; command: string }[] };
type Settings = { hooks?: Record<string, HookEntry[]> } & Record<string, unknown>;

export function settingsPath(scope: "global" | "project"): string {
  return scope === "project"
    ? path.resolve(process.cwd(), ".claude", "settings.json")
    : path.join(os.homedir(), ".claude", "settings.json");
}

function command(state: "busy" | "idle"): string {
  const cli = path.resolve(__dirname, "cli.js");
  return `"${process.execPath}" "${cli}" hook ${state} ${MARKER}`;
}

function read(file: string): Settings {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Settings;
  } catch {
    return {};
  }
}

function write(file: string, data: Settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

/** Remove any Adivari-installed hook entries from an event's list. */
function stripOurs(entries: HookEntry[] = []): HookEntry[] {
  return entries.filter(
    (e) => !e.hooks?.some((h) => h.command?.includes(MARKER)),
  );
}

export function installHooks(scope: "global" | "project"): string {
  const file = settingsPath(scope);
  const settings = read(file);
  const hooks = settings.hooks ?? {};

  hooks.UserPromptSubmit = [
    ...stripOurs(hooks.UserPromptSubmit),
    { hooks: [{ type: "command", command: command("busy") }] },
  ];
  hooks.Stop = [
    ...stripOurs(hooks.Stop),
    { hooks: [{ type: "command", command: command("idle") }] },
  ];

  settings.hooks = hooks;
  write(file, settings);
  return file;
}

export function uninstallHooks(scope: "global" | "project"): string {
  const file = settingsPath(scope);
  const settings = read(file);
  if (settings.hooks) {
    for (const key of Object.keys(settings.hooks)) {
      settings.hooks[key] = stripOurs(settings.hooks[key]);
      if (settings.hooks[key].length === 0) delete settings.hooks[key];
    }
    write(file, settings);
  }
  return file;
}

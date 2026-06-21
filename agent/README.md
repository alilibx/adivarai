# @adivari/agent

The Adivari agent bridge — connects your coding agent's **busy/idle** state to the
Adivari ad surface so you earn while the agent works.

## How it works

```
Claude Code hooks ─┐
                   ├─► adivari daemon (localhost:8787) ──SSE──► ad surface (web/desktop)
adivari run <cmd> ─┘        busy / idle state
```

- `adivari daemon` runs a tiny local bridge (127.0.0.1 only). It holds the current
  busy/idle state and streams it to the ad surface over Server-Sent Events.
- **Claude Code hooks** (`UserPromptSubmit` → busy, `Stop` → idle) post precise
  events — the highest-trust signal (`source=HOOK`).
- **`adivari run -- <cmd>`** wraps any other agent and infers busy/idle from output
  cadence (`source=WRAPPER`).
- A watchdog forces idle if a busy state is never closed (e.g. the agent crashes).

## Install

```sh
cd agent
npm install
npm run build
npm link        # puts `adivari` on your PATH (or `npm i -g .`)
```

## Use with Claude Code

```sh
adivari hooks install     # one-time: writes ~/.claude/settings.json hooks (merges safely)
# open the Adivari ad surface (web app /earner "Auto mode", or the desktop app),
# then just use Claude Code — the bridge auto-starts on your first prompt.
```

The bridge **starts automatically** the first time a hook fires (or the wrapper
runs), so you don't have to launch `adivari daemon` by hand. You can still run it
manually for debugging, and the desktop app also starts it on launch.

`adivari hooks uninstall` removes only Adivari's entries. Add `--project` to scope to
the current repo's `.claude/settings.json`.

## Use with any other agent

```sh
adivari daemon                          # in one terminal
adivari run --agent codex -- codex      # wrap the agent in another
```

## Commands

| Command | What it does |
|---|---|
| `adivari daemon` | Start the local bridge (keep running). |
| `adivari hooks install [--project]` | Install Claude Code busy/idle hooks. |
| `adivari hooks uninstall [--project]` | Remove them. |
| `adivari run [--agent <name>] -- <cmd...>` | Wrap an agent, infer busy/idle. |
| `adivari status` | Show current bridge state. |
| `adivari busy \| idle [--agent <name>]` | Manual override. |

Override the port with `ADIVARI_PORT` (the web surface reads
`NEXT_PUBLIC_ADIVARI_BRIDGE`).

## Test

```sh
npm test    # detector state-machine unit tests
```

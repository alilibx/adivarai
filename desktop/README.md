# Adivari desktop (Tauri v2)

A native menubar/desktop shell that hosts the earner **ad surface** and starts the
local **agent bridge**, so ads play automatically while your coding agent works.

> **Status: scaffold.** The code follows Tauri v2 conventions but has not been
> compiled in this environment (it needs the Rust toolchain + Tauri CLI + app icons).
> The full earning loop already works today in the browser — this packages it as a
> desktop app.

## What it does

1. On launch, spawns `adivari daemon` (best-effort; install `@adivari/agent` globally
   so the `adivari` CLI is on PATH).
2. Opens a window onto the earner ad surface (`tauri.conf.json` → `devUrl` /
   `frontendDist`). The surface connects to the bridge and plays ads while busy.
3. Adds a tray icon (Show / Quit).

## Prerequisites

- Rust (`rustup`) and the platform's Tauri build deps — see
  https://tauri.app/start/prerequisites/
- Node 18+, and the web app running (`npm run dev` at the repo root) for `tauri dev`.
- App icons: `npm run icons` (after adding an `app-icon.png`), or `tauri icon`.

## Run

```sh
cd desktop
npm install
npm run dev      # loads http://localhost:3000/earner in a native window
```

## Build

```sh
npm run build    # produces a signed desktop bundle (per-OS)
```

## Notes / next steps

- For production, point the window at the deployed web URL (or bundle an exported
  surface into `frontendDist`).
- Enforce **viewability** natively: only count impressions while the window is
  focused/foreground (window focus events → pause/resume the ad loop).
- Optionally bundle the bridge as a Tauri **sidecar** binary instead of relying on a
  global `adivari` install.

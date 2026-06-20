<p align="center">
  <h1 align="center">Adivari AI</h1>
  <p align="center">Get paid while your coding agent works.</p>
</p>

---

**Adivari AI** turns the dead time of AI coding agents into earnings. While your
agent (Claude Code, Codex, Cursor, Gemini CLI, …) is busy working on a task, the
Adivari desktop app shows you ads and you earn money. Advertisers run self-serve
campaigns — paying per view (CPM) or per click (CPC) — just like Meta or X Ads.

> Two sides, one platform:
> - **Earners** — developers who install the desktop app and get paid for the time
>   their agent is computing.
> - **Advertisers** — businesses that run CPM/CPC campaigns against engaged developer
>   attention.

## How it works

```
Agent starts a task ─► Adivari detects "busy" ─► ads play while you wait
       ─► viewable impression / click ─► you earn, advertiser is charged
       ─► agent finishes ─► ads pause ─► back to work
```

Earnings are **revenue-share-backed**: you're paid a share of what advertisers were
actually billed (shown as a friendly ~$/hr estimate), so payouts are always funded.

## Status

🟢 **MVP running** — Next.js + Convex web app implementing the full money loop:
advertisers fund a balance and run CPM/CPC campaigns; earners run a "work session"
and watch ads in-browser, accruing a revenue-share with a transactional ledger and
payout flow. (The Tauri desktop app + real agent hooks are the next phase; today the
browser simulates the ad surface.)

Docs:
- 📄 [`SPEC.md`](./SPEC.md) — full product & technical specification.
- 💸 [`PAYMENTS.md`](./PAYMENTS.md) — the payments model with worked dollar examples.
- 🗄️ [`convex/schema.ts`](./convex/schema.ts) — Convex database schema.

## Run locally

Requires Node 18+ and a (free) Convex account.

```sh
npm install

# 1) Start the Convex backend — on first run this logs you in and provisions a
#    dev deployment, generates convex/_generated, and writes NEXT_PUBLIC_CONVEX_URL.
npx convex dev

# 2) In a second terminal, start the web app.
npm run dev          # http://localhost:3000
```

Then: open the app, **sign up as an advertiser**, top up a balance, create a campaign,
add a creative (paste any image URL + a click-through URL), and **Activate** it. In a
second browser/profile, **sign up as a developer (earner)**, click **Start working**,
and watch the ads play and earnings accrue in real time.

> Auth is a dev placeholder (email-only, no password) — see `convex/auth.ts`. Stripe
> top-ups/payouts are stubbed (balance credited directly). Both are isolated for easy
> replacement before any real deployment.

## Earn with your real coding agent (auto mode)

Instead of clicking "Start working", let Adivari detect when your agent is actually
busy and play ads automatically:

```sh
cd agent && npm install && npm run build && npm link   # installs the `adivari` CLI
adivari hooks install        # adds Claude Code busy/idle hooks (merges settings.json)
adivari daemon               # leave running — local bridge on 127.0.0.1:8787
```

Then open the earner dashboard, flip on **Auto mode**, and use Claude Code normally —
ads play while the agent works and pause when it's idle. For other agents:
`adivari run --agent codex -- codex …`. See [`agent/README.md`](./agent/README.md). The
[`desktop/`](./desktop/README.md) Tauri app packages this surface natively.

## What works now

- Advertiser: prepaid balance + top-up, create CPM/CPC campaigns, upload/link
  creatives, activate/pause, live spend + impressions + clicks + CTR reporting.
- Earner: start/stop work sessions (with detection-source trust tiers), in-browser ad
  surface, live earnings, pending vs available balances, payout request.
- Backend: ad auction (CPM vs CPC ranked by eCPM), transactional billing + accrual +
  double-entry ledger, budget/daily-cap pacing, single-use impression tokens,
  scheduled daily reset + hold-release crons.
- Agent detection: `adivari` CLI with a local SSE bridge, Claude Code hooks (precise
  busy/idle), a generic CLI wrapper, and a watchdog — wired into the earner surface's
  Auto mode (unit-tested state machine).

## Planned architecture

Current layout (single Next.js app + Convex backend; Tauri desktop added next phase):

| Path | Purpose |
|---|---|
| `convex/` | Backend — `schema.ts` + queries/mutations/crons (auth, ads auction, ingest, ledger, billing, payouts) |
| `app/` | Next.js App Router — landing, login, advertiser & earner dashboards |
| `components/` | UI: nav, campaign create/card, the ad player |
| `lib/` | Client helpers (money formatting, agent-bridge hook) |
| `agent/` | `adivari` CLI + local bridge daemon — Claude Code hooks & CLI wrapper for busy/idle detection |
| `desktop/` | Tauri v2 desktop shell hosting the ad surface (scaffold) |

**Stack:** **Convex** (reactive backend + document DB), Next.js + Tailwind, Stripe
(billing + payouts, stubbed in dev). Convex live queries power the real-time earnings
counter and replace a separate WebSocket/cache layer; transactional mutations keep the
ledger correct. A **Tauri** desktop app with real agent hooks replaces the in-browser
ad surface in the next phase.

## Roadmap

1. **Phase 0** — Spec + DB schema *(current)*
2. **Phase 1** — Advertiser dashboard (campaigns, creatives, Stripe top-up, reporting)
3. **Phase 2** — Earner desktop app (agent hooks, ad render, earnings)
4. **Phase 3** — Payments & payouts (billing, pacing, payout rails, KYC)
5. **Phase 4** — Trust & scale (fraud ML, targeting, video/VAST, analytics)

See [`SPEC.md`](./SPEC.md) for details.

## License

MIT — see [LICENSE.txt](./LICENSE.txt).

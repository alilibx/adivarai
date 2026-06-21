# Adivari AI — Product & Technical Specification

> Status: **v0.1 — foundational spec.** This document is the source of truth for
> scope, architecture, and data model. Code is built against it.

---

## 1. Summary

**Adivari AI** is a two-sided advertising marketplace built around the dead time of
AI coding agents.

When a developer runs a coding agent (Claude Code, Codex, Cursor, Gemini CLI, etc.),
the agent spends meaningful wall-clock time *working* — generating code, running
tools, thinking — while the human waits. Adivari monetizes that waiting time:

- **Earners** (developers) install a desktop app. While their agent is *busy*, the
  app surfaces ads and the earner accrues money.
- **Advertisers** run self-serve campaigns (like Meta/X Ads): upload creatives, set a
  budget, bid on a **CPM** (cost per 1,000 views) and/or **CPC** (cost per click)
  basis, add a card, and spend is deducted as impressions/clicks are delivered.

### Key product decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Ad surface | **Desktop app (Tauri preferred, Electron fallback)** | Strongest viewability + fraud control; can hook native CLI agents directly. |
| Earnings model | **Revenue-share-backed**, displayed as estimated $/hr | Platform can never owe earners more than advertisers were billed. See [`PAYMENTS.md`](./PAYMENTS.md). |
| Backend & database | **Convex** (reactive TypeScript backend + document DB) | Real-time subscriptions replace the WebSocket layer; transactional mutations make the ledger safe; scheduled functions handle pacing + payout holds; actions call Stripe. |
| First build | **This spec + DB schema** | Lock scope before code. |
| Agent detection | **Official hooks / CLI wrapper** (start with Claude Code) | Real busy/idle signal, hardest to fake. |

---

## 2. The core loop

```
Agent starts a long task ──► Adivari detects "agent is busy"
        │
        ▼
 Desktop ad surface wakes, plays ad(s) while the user waits
        │
        ▼
 Viewable impression / click recorded ──► Earner accrues, Advertiser charged
        │
        ▼
 Agent finishes ──► ads pause, user returns to work
```

A **work session** brackets the whole period the agent CLI runs; it is composed of
one or more **busy intervals** (agent actively computing). Ads only serve, and money
only accrues, during busy intervals that pass viewability + liveness checks.

---

## 3. Economic model (the part that must be right)

Earnings are **derived from real advertiser spend**, never from a flat clock. Every
dollar paid to an earner is a share of a dollar an advertiser was actually billed.

```
earner_payout = Σ(viewable_impressions × eCPM / 1000 × revshare)
              + Σ(valid_clicks      × CPC           × revshare)
```

- `revshare` is the earner's share (initial target **60%**; platform keeps 40% to
  cover payment fees, fraud, and margin — tunable).
- The desktop UI shows a friendly **"~$X.XX/hr"** estimate computed from the trailing
  window of actual accrual, so it *feels* like per-minute earning while remaining
  fully backed by billed revenue.
- If there is no ad demand (no fill), the estimate drops toward $0 — we never pay out
  unbacked money. House ads / fallback network can soften this later.

> **The earning side and the advertising side are two views of the same money.**
> Advertisers fund the pool by being billed for views/clicks; earners are paid out of
> that same pool. The platform's margin is the spread. Because we only ever pay a
> fraction of what was billed, the system is structurally solvent.
>
> See **[`PAYMENTS.md`](./PAYMENTS.md)** for the full breakdown: CPM vs CPC mechanics,
> worked dollar examples, the eCPM bridge between the two sides, fees, and exactly
> when money moves.

### Money flow (summary)

```
Advertiser card ──Stripe──► Advertiser prepaid balance ──spend──► Platform revenue
                                                                       │
                                              revshare split ──────────┤
                                                                       ▼
                                                          Earner pending balance
                                                          (hold 7–14d) ──payout──► Earner
```

- Advertisers **prepay** a balance (top-up), and campaign spend draws it down. This
  avoids chargeback/credit risk versus billing in arrears.
- Earner balances move `pending → available` after a hold window and fraud review,
  then are paid out via Stripe Connect / PayPal Payouts / Tremendous once a minimum
  threshold (e.g. $10) is met.

---

## 4. Architecture

```
┌─────────────────────┐                ┌───────────────────────────────────┐
│  Earner desktop app │   Convex client │            Convex backend          │
│  (Tauri)            │  (live queries  │                                    │
│  • agent detector   │◄─+ mutations)──►│  queries/   reactive reads          │
│  • ad surface       │   reactive       │  mutations  transactional writes    │
│  • viewability +    │   subscriptions  │             (ad select, ingest,     │
│    liveness checks  │                  │              ledger, accrual)       │
└─────────────────────┘                  │  actions    Stripe (top-up, payout)│
                                          │  crons      pacing reset, hold     │
┌─────────────────────┐   Convex client  │             release, fraud sweep   │
│ Advertiser web app  │◄────────────────►│                                    │
│ (Next.js dashboard) │   live queries   │  document DB (convex/schema.ts)    │
└─────────────────────┘                  │  file storage (creative assets)    │
                                          └───────────────────────────────────┘
```

Convex is the whole backend: a reactive document database plus TypeScript server
functions. **Live queries** push earnings counters, campaign spend, and busy-state to
both clients in real time (no separate WebSocket service). **Mutations** are
transactional, which is exactly what the ledger and budget-draw need. **Actions** make
the external calls to Stripe. **Scheduled functions / crons** handle daily-cap resets,
payout hold release, and fraud sweeps.

### Recommended stack

- **Monorepo** (Turborepo + pnpm):
  - `apps/web` — Next.js (App Router): marketing site, advertiser dashboard, earner
    web dashboard, auth. Talks to Convex via `convex/react`.
  - `apps/desktop` — **Tauri** (Rust shell + web UI): agent detector daemon, ad
    surface window, liveness. Subscribes to Convex for ad selection + live earnings.
  - `convex/` — the backend: `schema.ts` plus `queries`, `mutations`, `actions`, and
    `crons`. This replaces the former `apps/api` service and `packages/db`.
  - `packages/shared` — shared TypeScript types reused across web/desktop/convex.
- **Backend & database:** **Convex** (reactive document DB + serverless TS functions).
  No separate Redis — Convex mutations + indexed documents cover counters, pacing, and
  dedupe transactionally.
- **Auth:** Convex Auth (or Clerk integrated with Convex).
- **File storage / CDN:** Convex file storage for creative assets (swap to S3/R2 + CDN
  if/when asset volume warrants).
- **Payments:** **Stripe** (called from Convex actions) for advertiser top-ups;
  **Stripe Connect / PayPal Payouts / Tremendous** for earner payouts.
- **Ads:** start with a first-party image/HTML ad server (a Convex query running the
  auction); add **VAST** video support in Phase 4; optional network fallback for fill.
- **Hosting (MVP):** Vercel (Next.js web) + Convex (managed). The Tauri app ships as a
  signed desktop binary.

> **Why Convex fits this product.** The core experience is real-time (a live
> earnings counter ticking while the agent works) and the core risk is money
> correctness (a ledger that must never double-spend or pay out unbacked funds).
> Convex's reactive queries give the first for free, and its transactional mutations
> give the second — without us operating a WebSocket layer, a cache, and a separate
> API service. The cost is being on a managed platform with its own query/index model
> (reflected in `convex/schema.ts`).

---

## 5. Agent detection (the technical crux)

Goal: emit reliable **`busy_started` / `busy_ended`** events that are hard to fake.

### 5.1 Claude Code (first integration)
Claude Code exposes lifecycle **hooks**. Adivari ships a small hook config that posts
events to the local desktop daemon over `localhost`:

- `PreToolUse` / start-of-turn → candidate `busy_started`.
- `Stop` / end-of-turn / idle prompt → `busy_ended`.

The daemon debounces these into clean busy intervals.

### 5.2 Generic CLI wrapper
`adivari run <agent-command>` wraps any agent in a PTY. The wrapper infers busy/idle
from process state and output cadence (output streaming = busy; waiting at a prompt =
idle). Works for Codex, Gemini CLI, aider, etc.

### 5.3 Heuristic fallback (post-MVP)
A manual "Start working" toggle + CPU/process heuristics for agents we can't hook.
Lower trust → stricter liveness + lower trust score.

### 5.4 Trust signal
Each busy interval carries a **source** (`hook` > `wrapper` > `heuristic` >
`manual`). Earnings multipliers and fraud thresholds key off this.

---

## 6. Ad serving

1. Desktop app calls a `busyStarted` **mutation**; it subscribes to a live query for
   ad assignments and its earnings counter.
2. An ad-selection **query/mutation** picks eligible campaigns (active, budget
   remaining, targeting match, frequency cap ok), runs a simple **auction** (rank by
   effective value: CPM bid, or CPC bid × predicted CTR), and returns the winning
   creative + a signed, single-use **impression token**.
3. App renders the ad in the surface window.
4. App measures **viewability** (window focused + foreground; for video ≥50% pixels
   for ≥2s — MRC standard) and calls a `recordImpression` **mutation** with the token.
5. That mutation (transactional) validates token + fraud signals, records the
   impression, **draws down the advertiser balance / campaign spend**, and **accrues
   earner revenue** — all atomically in one write.
6. Click → a `recordClick` mutation validated against the token, opens the advertiser
   landing URL, bills CPC if applicable.

**Budget pacing:** daily-cap and lifetime-budget checks run inside the ad-selection
and billing mutations against indexed counters on the campaign document; a **cron**
resets daily counters. Because billing is transactional, a campaign can never overspend
its budget under concurrency.

---

## 7. Fraud & trust (existential)

Reward-for-attention platforms die to fraud. Layered defenses:

- **Viewability gating** — pay only for in-focus, foreground, sufficiently-visible
  impressions.
- **Liveness checks** — occasional randomized lightweight attention prompts during
  long busy intervals; missed checks pause accrual.
- **Activity correlation** — accrual requires a *verified busy interval* from a
  trusted source, not just a running timer.
- **Device & account integrity** — device fingerprint, one active account per device,
  velocity/anomaly limits.
- **Token integrity** — signed, single-use, short-TTL impression tokens; server-side
  dedupe.
- **Payout hold** — `pending → available` after 7–14 days + anomaly review.
- **Advertiser protection** — invalid-traffic filtering so advertisers aren't billed
  for fraud; refund/credit flow for detected IVT.
- **Trust score** per earner adjusts hold length, caps, and review intensity.

---

## 8. Roadmap

| Phase | Deliverable |
|---|---|
| **0** | This spec + DB schema (current). |
| **1** | Advertiser web app: signup, create campaign, upload creative, set CPM/CPC + budget, Stripe top-up, basic reporting. Testable without desktop. |
| **2** | Earner side: account, desktop app, Claude Code hook + CLI wrapper, ad render, viewability + click ingest, live earnings counter, ledger. |
| **3** | Payments: advertiser billing/pacing live, earner payout rails + hold/threshold/KYC. |
| **4** | Trust & scale: fraud ML, richer targeting, video/VAST, full analytics, network fallback. |

---

## 9. Compliance (flag early, don't block MVP)

- **Payouts = money handling:** KYC, tax forms (W-9/W-8/1099), per-country payout
  rules, minimum thresholds.
- **Ad policy:** creative moderation + prohibited-content rules.
- **Privacy:** GDPR/CCPA for targeting + device fingerprinting; clear consent + data
  retention policy.
- **Agent ToS:** confirm wrapping/hooking each agent CLI is permitted by its terms.

---

## 10. Open questions / future

- Targeting dimensions for v1 (geo, language, dev stack/tags?).
- Should earners pick ad categories / opt out of sensitive verticals?
- Network fallback partner for fill when first-party demand is thin.
- Mobile / non-coding agent surfaces later?

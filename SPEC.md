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
| Earnings model | **Revenue-share-backed**, displayed as estimated $/hr | Platform can never owe earners more than advertisers were billed. |
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

Earnings are **derived from real advertiser spend**, never from a flat clock.

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

### Money flow

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
┌─────────────────────┐        ┌────────────────────────────────────────┐
│  Earner desktop app │        │              Adivari Backend             │
│  (Tauri)            │        │                                          │
│  • agent detector   │◄─WS───►│  • Auth & accounts (earner / advertiser) │
│  • ad surface       │  REST  │  • Ad server (targeting, pacing, fill)   │
│  • viewability +    │        │  • Impression/click ingest + fraud guard │
│    liveness checks  │        │  • Earnings ledger (double-entry)        │
└─────────────────────┘        │  • Campaign manager + Stripe billing     │
                               │  • Payouts                               │
┌─────────────────────┐        │  • Reporting / analytics                 │
│ Advertiser web app  │◄─REST─►│                                          │
│ (Next.js dashboard) │        └───────────────┬──────────────────────────┘
└─────────────────────┘                        │
                                 ┌──────────────┴───────────────┐
                                 │ Postgres │ Redis │ S3 + CDN   │
                                 │ (ledger, │(counts│ (creative  │
                                 │  state)  │ pacing│  assets)   │
                                 │          │ rate) │            │
                                 └──────────────────────────────┘
```

### Recommended stack

- **Monorepo** (Turborepo + pnpm):
  - `apps/web` — Next.js (App Router): marketing site, advertiser dashboard, earner
    web dashboard, auth.
  - `apps/api` — Node/TypeScript service (NestJS or Fastify): ad serving, ingest,
    ledger, billing, payouts. Exposes REST + a WebSocket channel for the desktop app.
  - `apps/desktop` — **Tauri** (Rust shell + web UI): agent detector daemon, ad
    surface window, liveness.
  - `packages/shared` — shared TypeScript types + a thin client SDK.
  - `packages/db` — Prisma schema + generated client.
- **Database:** Postgres (Neon/Supabase) via **Prisma**.
- **Cache / real-time:** Redis (Upstash) for impression counters, budget pacing,
  rate limiting, and dedupe.
- **Object storage / CDN:** S3 (or R2) + CDN for creative assets.
- **Payments:** **Stripe** for advertiser top-ups; **Stripe Connect / PayPal Payouts
  / Tremendous** for earner payouts.
- **Ads:** start with a first-party image/HTML ad server; add **VAST** video support
  in Phase 4; optional network fallback for fill.
- **Hosting (MVP):** Vercel (web) + a container host for `apps/api` + managed
  Postgres/Redis.

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

1. Desktop app opens a WS session and announces `busy_started`.
2. Backend ad server selects eligible campaigns (active, budget remaining, targeting
   match, frequency cap ok), runs a simple **auction** (rank by effective value:
   CPM bid, or CPC bid × predicted CTR), and returns the winning creative + a signed
   **impression token**.
3. App renders the ad in the surface window.
4. App measures **viewability** (window focused + foreground; for video ≥50% pixels
   for ≥2s — MRC standard) and reports a `viewable` impression with the token.
5. Backend validates token + fraud signals, records the impression, **bills the
   advertiser**, and **accrues earner revenue**.
6. Click → recorded with the token, opens advertiser landing URL, bills CPC if
   applicable.

**Budget pacing:** Redis counters enforce daily caps and total budget; campaigns are
pulled from eligibility the moment budget is exhausted.

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

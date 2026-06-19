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

🚧 **Early — foundational spec phase.** No application code yet.

- 📄 [`SPEC.md`](./SPEC.md) — full product & technical specification (architecture,
  agent detection, ad serving, fraud, economics, roadmap).
- 🗄️ [`packages/db/schema.prisma`](./packages/db/schema.prisma) — database schema.

## Planned architecture

A Turborepo monorepo:

| Package | Purpose |
|---|---|
| `apps/web` | Next.js — marketing site + advertiser & earner dashboards + auth |
| `apps/api` | Node/TS service — ad serving, ingest, ledger, billing, payouts |
| `apps/desktop` | Tauri app — agent detection, ad surface, viewability/liveness |
| `packages/shared` | Shared types + client SDK |
| `packages/db` | Prisma schema + client |

**Stack:** Postgres + Prisma, Redis, S3/CDN, Stripe (billing + payouts).

## Roadmap

1. **Phase 0** — Spec + DB schema *(current)*
2. **Phase 1** — Advertiser dashboard (campaigns, creatives, Stripe top-up, reporting)
3. **Phase 2** — Earner desktop app (agent hooks, ad render, earnings)
4. **Phase 3** — Payments & payouts (billing, pacing, payout rails, KYC)
5. **Phase 4** — Trust & scale (fraud ML, targeting, video/VAST, analytics)

See [`SPEC.md`](./SPEC.md) for details.

## License

MIT — see [LICENSE.txt](./LICENSE.txt).

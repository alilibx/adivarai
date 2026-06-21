# Adivari AI — Payments Model

> How money enters from advertisers, how it reaches earners, and why the two sides
> always balance. This expands Section 3 of [`SPEC.md`](./SPEC.md).
> All amounts in USD; stored internally as integer **cents**.

---

## 1. One pool, two faces

There is only **one** pool of money. Advertisers fund it; earners are paid out of it;
the platform keeps the spread.

```
        ADVERTISER SIDE                          EARNER SIDE
   (money flows IN to the pool)          (money flows OUT of the pool)

   pays to show ads  ──────────►  THE POOL  ──────────►  paid to watch ads
   (CPM / CPC billing)            (realized      (revenue share of realized
                                   revenue)        revenue)

                          platform margin = what stays
```

The golden rule that keeps us solvent:

```
total paid to earners  =  revshare × total realized revenue   (revshare ≈ 60%)
total kept by platform =  (1 − revshare) × realized revenue − fees   (≈ 40% − fees)
```

"Realized revenue" = money advertisers were **actually billed** for delivered,
non-fraudulent views and clicks. We never distribute money that hasn't been realized,
so earner payouts can never exceed advertiser spend. The per-minute / per-hour figure
the earner sees is an **estimate** of their slice of this pool — never an independent
promise.

---

## 2. The advertising side (money IN)

Advertisers run **campaigns**, just like Meta/X Ads. Two billing modes:

### CPM — Cost Per Mille (per 1,000 views)
- The advertiser sets a **CPM bid**, e.g. `$8.00 per 1,000 viewable impressions`.
- Charged per **viewable** impression: `bidCents / 1000` per view.
- Good for awareness; advertiser pays for attention whether or not anyone clicks.

```
1 viewable impression  =  $8.00 / 1000  =  $0.008 billed
125 viewable impressions =  $1.00 billed
```

### CPC — Cost Per Click (per click)
- The advertiser sets a **CPC bid**, e.g. `$0.50 per click`.
- Charged **only** when a valid click happens; impressions that don't get clicked
  cost the advertiser nothing.
- Higher per-event price (clicks are rare and worth more), good for traffic/conversions.

```
1 valid click  =  $0.50 billed
0 clicks       =  $0.00 billed (even if shown 1,000 times)
```

### Prepaid balance (how advertisers actually pay)
Advertisers **top up** a prepaid balance with a card via Stripe; campaign spend draws
it down. We bill against a balance we already hold rather than charging in arrears.

- Avoids failed-charge / chargeback risk.
- Spend is gated by the balance: a campaign with `$0` balance simply stops serving.
- Each campaign has a **lifetime budget** and optional **daily cap**; the billing
  mutation refuses to spend past either, so a campaign can never overspend.

```
Add card ──► top up $100 (Stripe) ──► advertiserAccount.balanceCents += 10000
Campaign spends ──► balanceCents −= billed,  campaign.spentCents += billed
Balance hits 0  ──► campaign status → OUT_OF_BUDGET, stops serving
```

---

## 3. The earning side (money OUT)

Earners are paid a **revenue share of realized revenue**, allocated across the
viewable impressions they served. The mechanism differs slightly by campaign type, so
we use **effective CPM (eCPM)** as the common currency between the two sides.

### eCPM: the bridge between CPM and CPC
eCPM = "what is one thousand impressions of this campaign actually worth?"

- **CPM campaign:** eCPM = the bid directly. `$8 CPM → eCPM $8`.
- **CPC campaign:** eCPM = `CPC × CTR × 1000`, where CTR is the click-through rate.
  Example: `$0.50 CPC` at a `1%` CTR → `0.50 × 0.01 × 1000 = $5.00 eCPM`.

This lets the ad auction rank a CPM and a CPC campaign on the same scale, and lets
earners accrue from CPC campaigns on a per-impression basis (not just on rare clicks).

### Two ways to pay earners

**A. Direct attribution (simple — MVP for CPM-only).**
The earner is paid from the exact event their impression caused:
- CPM impression billed `$0.008` → earner gets `revshare × $0.008`.
- CPC click billed `$0.50` → the earner who served the clicked ad gets `revshare ×
  $0.50`; impressions that weren't clicked earn `$0`.

Fully solvent per-event and trivial to compute. **Downside:** for CPC campaigns the
earner mostly earns nothing (clicks are rare), so the live $/hr is jumpy and feels
unfair. Fine while we run CPM-only at launch.

**B. Pooled eCPM revenue share (recommended at scale).**
All realized revenue in a settlement window (e.g. each day) goes into a pool. Each
earner receives:

```
earner_settled = revshare × realized_revenue_pool
                 × (earner_quality_weighted_viewable_impressions
                    ÷ total_quality_weighted_viewable_impressions)
```

- Earners get a **smooth** per-impression trickle regardless of whether the underlying
  campaign was CPM or CPC — the platform absorbs the impression-vs-click mismatch.
- "Quality-weighted" applies the trust/source multiplier (HOOK > WRAPPER > … ) and
  viewability, so high-trust attention earns more per impression.
- Still **exactly solvent**: the sum of all earner payouts is `revshare ×` the realized
  pool, by construction.
- The live counter shows an **estimate** from predicted eCPM; nightly settlement
  reconciles to realized revenue. Differences are small and self-correct.

> **Recommendation:** ship **A (CPM-only)** for the MVP to keep accounting obvious,
> then move to **B** when CPC campaigns and real volume arrive.

---

## 4. Worked examples

Assume `revshare = 60%` throughout.

### Example 1 — A CPM campaign hour
- Advertiser bids **$8 CPM**.
- An earner serves **300 viewable impressions** in an hour of agent busy-time.

```
Advertiser billed : 300 × ($8 / 1000)      = $2.40
Earner accrues    : 60% × $2.40            = $1.44
Platform keeps    : 40% × $2.40            = $0.96  (before fees)
Earner sees       : "~$1.44/hr" estimate
```

### Example 2 — A CPC campaign with a click
- Advertiser bids **$0.50 CPC**; assumed CTR **1%** → eCPM **$5**.
- An earner serves **300 viewable impressions**, of which **3 are clicked**.

```
Advertiser billed : 3 clicks × $0.50       = $1.50   (impressions are free here)
Earner accrues    : 60% × $1.50            = $0.90
Platform keeps    : 40% × $1.50            = $0.60
```

Under **direct attribution**, that $0.90 lands only on the 3 clicked impressions (spiky).
Under **pooled eCPM**, the $0.90 is spread across the earner's 300 impressions (smooth),
and the live estimate uses the $5 eCPM → `60% × 300 × $5/1000 = $0.90`. Same total,
nicer UX.

### Example 3 — A mixed hour (what reality looks like)
The earner's surface shows a blend of campaigns; the pool blends their eCPMs.

```
Realized revenue this hour (all campaigns, this earner) : $3.20
Earner accrues  : 60% × $3.20 = $1.92
Platform keeps  : 40% × $3.20 = $1.28
Displayed       : "~$1.92/hr"
```

If ad demand dries up (no fill), realized revenue → $0 and so does the estimate. We
never owe money we didn't take in.

---

## 5. When money moves (lifecycle & timing)

```
ADVERTISER
  add card → top up ............ Stripe charge → balanceCents credited (TOPUP)
  ad delivered ................. balanceCents debited, campaign.spentCents up (AD_SPEND)
  invalid traffic detected ..... REFUND back to balance

EARNER
  viewable impression / click .. earner.pendingCents += accrual (EARNER_ACCRUAL)
  hold window (7–14 days) ...... pending, under fraud review, not withdrawable
  cleared review ............... pending → available (cron-driven)
  request payout (≥ $10 min) ... available → payout (PAYOUT) via Stripe Connect/PayPal/Tremendous
```

- **Accrual is immediate** (good UX: the counter ticks live), but lands in
  **`pendingCents`**.
- A **hold window** (default 7–14 days, shorter as trust score rises) plus fraud
  review gates the move to **`availableCents`**.
- Payout requires a **minimum threshold** (e.g. $10) and a valid payout method + KYC.
- All of the above are recorded as **ledger entries**; balances are derived/maintained
  transactionally so they always reconcile to the ledger.

---

## 6. Fees & the platform margin

The platform's ~40% cut is **gross**, not net. It absorbs:

- **Payment processing** — Stripe top-up fees (~2.9% + $0.30); payout/transfer fees.
- **Fraud & refunds** — IVT we credit back to advertisers, and any clawbacks.
- **Infrastructure** — Convex, storage/CDN, ad serving.
- **Net margin** — what's left.

Decisions to confirm (see open questions): whether processing fees are absorbed by the
platform or added on top of advertiser top-ups, and the exact `revshare` (we model 60%
to earners). Both are single config values (`revshareBps`, fee policy) and tunable.

---

## 7. Solvency & abuse guarantees

- **Can't pay unbacked money:** earner distributions are a fraction of *realized*
  revenue, by construction (Section 1 golden rule).
- **Can't overspend a budget:** billing happens inside a transactional mutation that
  checks remaining budget/daily cap and the advertiser balance before debiting.
- **Can't double-bill / double-earn:** impression tokens are single-use and unique
  (`impressions.by_token`); the recording mutation is idempotent on the token.
- **Fraud doesn't reach cash:** the hold window + review sit between accrual and
  withdrawable balance; detected IVT is excluded (`ivtReason`) and refunded to
  advertisers before it ever becomes earner cash.

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **CPM** | Cost per 1,000 viewable impressions (advertiser bid). |
| **CPC** | Cost per click (advertiser bid). |
| **eCPM** | Effective CPM — normalized "value per 1,000 impressions" used to compare CPM vs CPC. For CPC: `CPC × CTR × 1000`. |
| **CTR** | Click-through rate = clicks ÷ impressions. |
| **Viewable impression** | An ad that met the visibility bar (focused/foreground; video ≥50% for ≥2s). Only these bill/earn. |
| **Fill rate** | Share of ad requests that returned a paying ad. Low fill → low earnings. |
| **revshare** | Earner's share of realized revenue (target 60%, `revshareBps = 6000`). |
| **Realized revenue** | Money advertisers were actually billed for valid delivery. The only money distributable. |
| **Pending vs available** | Accrued-but-held vs cleared-and-withdrawable earner balance. |
| **IVT** | Invalid traffic (fraud/bots); excluded from billing and earnings. |

# Touring-route generator — readiness, pricing-entry & pilot plan — 2026-06-05

_Phase 3D.1D. Operational readiness for the POI-aware touring-route → quote generator.
Documentation/admin guidance only — **no prices invented, no pricing formula / `QuotePricingService`
changes, no generator code changes.** Data is a live read on 2026-06-05._

A route is **generator-ready only if it has BOTH** ≥1 **active pricing row** (else the transport
package can't be created — apply is blocked) **and** ≥1 **POI-linked stop** (else days + transport
are created but the proposal narrative has no composed POI content). Translations are *not* required
to apply — missing PT/ES/AR POI translations just fall back to English content in those languages.

## 1. Generator readiness checklist — priority POI-linked routes

| # | Route name | Route code | durationDays | Active pricing rows | Active POI-linked stops | Generator-ready? | What's missing | Recommended operator action |
|---|---|---|---|---|---|---|---|---|
| 1 | Amman → Amman City Sites → Amman RT | `JOR-TR-CENTRAL-AMMAN-CITY-RT` | 1 | **0** | 3 (Citadel, Roman Theatre, Downtown — all EN/PT/ES/AR) | ❌ No | **Pricing missing** | Add ≥1 active pricing row (see §2) |
| 2 | Ajloun & Jerash | `JOR-TR-AMMAN-AJLOUN-JERASH` | 1 | 3 | 2 (Jerash, Ajloun — all EN/PT/ES/AR) | ✅ **Yes** | — | None — ready to pilot |
| 3 | Amman → Madaba → Mount Nebo → Amman RT | `JOR-TR-CENTRAL-MADABA-NEBO-RT` | 1 | **0** | 2 (Madaba, Mount Nebo — all EN/PT/ES/AR) | ❌ No | **Pricing missing** | Add ≥1 active pricing row (see §2) |
| 4 | Amman → Dana → Petra ON | `JOR-TR-SOUTH-AMMAN-DANA-PETRA-ON` | 2 | **0** | 2 (Petra — all 4 langs; **Dana Biosphere — EN only**) | ❌ No | **Pricing missing**; **Dana translations missing** (PT/ES/AR); **multi-day partition is a suggestion** | Add pricing (see §2); optionally add Dana PT/ES/AR translations; review the 2-day POI split in preview before apply |
| 5 | Petra → Wadi Rum ON | `JOR-TR-SOUTH-PETRA-WADI-RUM-ON` | 2 | 6 | 2 (Petra, Wadi Rum — all EN/PT/ES/AR) | ✅ **Yes** | **Multi-day partition is a suggestion** (review in preview) | None blocking — ready to pilot (review the 2-day split) |

_(No `Petra → Wadi Rum → Aqaba` route exists in the catalog; `Petra → Wadi Rum ON` is the closest priority route.)_

Other readiness notes (apply-time, surfaced in the preview, not blockers):
- **Ambiguous day partition** — any multi-day route shows an "automatic suggestion — please review" flag; the operator can move/reorder/drop POIs per day before applying.
- **No active pricing for selected pax** — if the only active pricing rows don't cover the chosen pax band, the operator should pick a covering row or add one. (The current priority routes' rows are not pax-restrictive, but confirm per route.)

## 2. Operator pricing-entry checklist (for unpriced but POI-linked routes)

Applies to: **Amman City Sites**, **Madaba → Mount Nebo**, **Amman → Dana → Petra ON** (all have POI
content but **0 active pricing rows**). **Do not invent prices — enter the operator's real contracted
rates.**

**Why required:** the generator creates exactly one touring-route transport package item from a
selected pricing row (`overrideCost = pricing.baseCost`, `useOverride = true`, `dayCount =
durationDays`). With no active pricing row, the preview's Apply button stays disabled with "Select a
pricing row."

**Where to add it (admin UI):** Transport → Touring Routes → open the route → **edit mode** → the
**Pricing rows** section (`/transport/touring-routes/{id}?mode=edit`).

**Fields to fill per pricing row:**
- **Vehicle / service category** — vehicle and transport service type (and pricing basis, e.g. `PER_VEHICLE`).
- **Pax band** — `minPax` / `maxPax` the row applies to.
- **baseCost** — the per-package base cost (this becomes the generated item's `overrideCost`).
- **currency** — e.g. `JOD` or `USD`.
- **active** — must be **true** (inactive rows are ignored by the generator).
- **validity** (if used) — `validFrom` / `validTo` if the route is seasonally priced (optional).

After saving an active row, re-open the generator preview for that route — Apply becomes available.

### 2.1 Pricing model — full package price, not per-day; cross-currency handled automatically

**Touring-route pricing is treated as the full package price for the selected route, not a per-day
price.** The generator copies the selected row's `baseCost` into the transport item's `overrideCost`
and sets `dayCount = durationDays` purely as **metadata** — `dayCount` does **not** multiply
`baseCost`. The pricing engine (markup, etc.) is unchanged.

Operators must therefore **confirm that each entered pricing row's `baseCost` is the full package
price for the whole route**, not the price of a single day. This matters most for **multi-day
routes**, where the base cost must cover the entire trip:

- **Petra → Wadi Rum ON** (`JOR-TR-SOUTH-PETRA-WADI-RUM-ON`, 2 days) — `baseCost` must be the full
  2-day package price (Petra + overnight + Wadi Rum), not a per-day rate.
- **Amman → Dana → Petra ON** (`JOR-TR-SOUTH-AMMAN-DANA-PETRA-ON`, 2 days) — `baseCost` must be the
  full 2-day package price (Amman → Dana → Petra with overnight), not a per-day rate.

If a row was entered as a per-day rate, multiply it out to the full-route package total before
piloting — otherwise multi-day quotes will under-price.

**Cross-currency pricing — fixed and verified (Phase 3D.1H, 2026-06-05):** if the pricing row
currency differs from the quote currency (e.g. a JOD pricing row on a USD quote), the system now
automatically converts `baseCost` to the quote currency before applying markup. No manual
adjustment is needed. Production-verified examples:

| Pricing | Quote currency | Sell at 20% markup |
|---|---|---|
| JOD 100 | USD | USD 169.20 |
| JOD 70 | USD | USD 118.44 |
| JOD 145 | USD | USD 245.34 |

As always, review the final quote total before sending to a client.

### 2.2 Translation content gap — Dana Biosphere Reserve (next pack)

**Dana Biosphere Reserve POI content is still English-only** (no PT/ES/AR translations). This is
**not a blocker** — the proposal composer falls back correctly: PT/ES/AR proposals render the
localized boilerplate ("Visita a …" / "زيارة …") combined with the **English** Dana title and
description via the fallback chain. RTL is preserved for Arabic. So **Amman → Dana → Petra ON**
pilots are fine to run today; the Dana entry will simply appear in English within otherwise-localized
day narratives.

**Recommendation (document-only, no translations applied this phase):** if **Dana / Petra** routes
will be sold often, add **Dana Biosphere Reserve** to the **next human translation content pack**
(PT/ES/AR title + short description), alongside the remaining active POIs. Petra is already fully
translated in all four languages, so completing Dana would make the whole **Amman → Dana → Petra ON**
narrative fully localized.

## 3. Pilot test plan

Pilot order: **Ajloun & Jerash** (works today) → **Amman City Sites**, **Madaba / Mount Nebo**,
**Dana / Petra** (each after pricing is added).

For **each** pilot route:
1. Open an **empty** quote (zero itinerary days) → **Itinerary** step → **Generate from touring route**.
2. Pick the route → pick an active pricing row → set start date + pax → review the preview.
3. **Apply.**
4. Confirm **day count** = `durationDays` (1 for Amman City / Madaba-Nebo / Ajloun-Jerash; 2 for Dana-Petra).
5. Confirm **exactly one** touring-route transport package item, using the selected pricing row
   (`overrideCost` = its baseCost, `useOverride = true`, `dayCount` = durationDays, pax from preview).
6. Confirm **ordered `QuoteItineraryDayPoi` rows** per day; base/operational stops created none.
7. Render proposal in **`?language=en` / `pt` / `es` / `ar`** → day summaries composed by the POI
   composer ("Visit …" / "Visita a …" / "زيارة …").
8. Confirm **Arabic remains RTL**; for routes with EN-only POIs (e.g. **Dana**), confirm PT/ES/AR show
   localized boilerplate + English POI content (acceptable).
9. Confirm the **pricing total** reflects the package: the selected row's `baseCost` is the **full
   package price** for the whole route, carried through the existing pricing engine (markup, etc.)
   **unchanged**. `dayCount` is metadata and does **not** multiply `baseCost` — a 2-day route is not
   double a 1-day route unless its `baseCost` already says so. (See §2.1.)
10. Confirm the operator can then **manually add hotels / activities / entrances** after generation
    (generator adds none of these).
11. If re-running: the generator **blocks** on a quote that now has itinerary days (expected — no
    replace/append yet); use a fresh empty quote.

Pilot acceptance = steps 4–10 pass for Ajloun & Jerash plus each newly-priced route.

## 4. Out of scope (unchanged)
Hotel matching · replace/append mode · pricing-engine changes · auto-created activities/entrances/
meals · TouringRouteDay · PR #321 reconciliation · manual per-locale override UI · machine
translation · ZZ Verification cleanup.

# Touring-route pricing readiness — generator audit — 2026-06-05

_Phase 3D.1C.1. Read-only audit. **No prices were invented, applied, or changed; no pricing
formula / `QuotePricingService` changes.** "Active pricing" = a `TouringRoutePricing` row with
`active !== false`._

## Why this matters

The POI-aware generator (Phase 3D) creates **one touring-route transport package item** from a
selected pricing row. So a route is **generator-ready only if it has BOTH**:
1. **≥1 active pricing row** (otherwise the transport package can't be created — apply is blocked
   with "Select a pricing row"), **and**
2. **≥1 POI-linked stop** (otherwise days + transport are created but the proposal narrative has no
   composed POI content — it falls back to manual notes).

## Snapshot

- **88 touring routes** total.
- **22 routes have ZERO active pricing rows** — the generator cannot create a transport package for
  these until an operator adds pricing.
- A recurring **mismatch**: many routes whose stops ARE POI-linked have **no** pricing, while many
  priced routes have **no** POI-linked stops. Few routes currently satisfy both conditions.

## The five routes you asked about

| Route (as named in the catalog) | Days | Active pricing | POI-linked stops | Generator-ready? |
|---|---|---|---|---|
| **Amman → Amman City Sites → Amman RT** | 1 | **0** | 3 | ❌ needs pricing |
| **Ajloun & Jerash** | 1 | **3** | 2–3 | ✅ ready (used in the 3D.1C E2E) |
| **Amman → Madaba → Mount Nebo → Amman RT** (POI-linked variant) | 1 | **0** | 2 | ❌ needs pricing |
| **Amman → Dana → Petra ON** | 2 | **0** | 2 | ❌ needs pricing |
| **Petra → Wadi Rum (ON)** | 2 | 6 | 2 | ✅ ready |

Notes:
- There are **duplicate/variant** routes for several of these. For example, a priced variant
  `Amman → Madaba → Nebo → Dead Sea → Amman RT` (6 active pricing rows) exists **but its stops are
  not POI-linked** (0 POI stops), so it would generate days + transport with **no** composed POI
  narrative. Conversely the POI-linked `Amman → Madaba → Mount Nebo → Amman RT` has **no pricing**.
  The same split appears for Jerash/Ajloun (a `Amman → Jerash → Ajloun → Amman RT` variant has 6
  pricing rows but 0 POI-linked stops, while the `Ajloun & Jerash` variant has both).

## Recommendation (operator action — no code/pricing change here)

To make the flagship POI routes usable by the generator, an operator should **add active pricing
rows** to the POI-linked variants:
1. **Amman → Amman City Sites → Amman RT** (3 POI stops, 0 pricing) — highest value; unlocks the
   flagship Amman city tour.
2. **Amman → Madaba → Mount Nebo → Amman RT** (2 POI stops, 0 pricing).
3. **Amman → Dana → Petra ON** (2 POI stops, 0 pricing).

Already ready (no action): **Ajloun & Jerash**, **Petra → Wadi Rum (ON)**.

Separately (content, not pricing): the **priced variants that lack POI-linked stops** (e.g. the
`… Dead Sea … RT` and `Amman → Jerash → Ajloun → Amman RT` variants) would benefit from linking
their stops to POIs (Phase 2 stop-editor) so the generator produces a narrative — OR the duplicates
could be consolidated. That is a separate data cleanup, not part of this audit.

## Not done here
No prices invented/applied; no pricing-formula or `QuotePricingService` changes; no route edits;
no consolidation of duplicates. This document is informational only.

# PR 0 — Vehicle-Class Audit / Dry-Run Report (read-only)

**Date:** 2026-06-13
**Scope:** READ-ONLY audit of `vehicleType` against the live DB. **No** schema,
migration, seed, column, backfill, or quote-logic change. Query was a throwaway
SELECT-only script, since deleted. This report exists to approve a canonical mapping
**before** PR 1 adds the `vehicleClass` column.

**Source:** live Railway DB (single shared instance). Totals: **34 vehicles**,
**24 suppliers**, **8 distinct `vehicleType` values** (one of which is `NULL`).

---

## 1–3. Distinct `vehicleType` values — counts, pax, suppliers

| `vehicleType` | Vehicles | Pax range | Suppliers | Rate rows* |
|---|---|---|---|---|
| **`NULL`** | **25** | 2–49 | Almushtari, Amman West Hotel, General Transport, **Alpha**, Desert Compass | **1036** |
| `Mini Van` | 2 | 5–6 | Almushtari, Canonical Fleet | 131 |
| `Van` | 2 | 9–10 | Almushtari | 184 |
| `Sedan` | 1 | 2 | Almushtari | 182 |
| `SUV` | 1 | 4 | Almushtari | 107 |
| `Mini Bus` | 1 | 17 | Canonical Fleet | 16 |
| `Medium Bus` | 1 | 30 | Canonical Fleet | 16 |
| `Large Coach` | 1 | 49 | Canonical Fleet | 16 |

\* Rate rows = `VehicleRate` + `TransportPricingRule` + `TouringRoutePricing` referencing that vehicle (relevance signal).

**Headline finding:** the entire **priced Alpha fleet is `vehicleType = NULL`**. The
typed values are mostly the small "Canonical Fleet" reference set and a few Almushtari
rows. So NULL is not noise — it covers the most commercially active vehicles.

---

## 4–5. Proposed canonical mapping + alias logic

**Recommended capacity bands (name-driven where capacity is ambiguous):**

| Canonical `VehicleClass` | Primary pax band | Name aliases |
|---|---|---|
| **Sedan** | 1–3 | sedan, camry, car |
| **SUV** | ~4 (name-driven) | suv |
| **Mini Van** | 4–6 | mini van, minivan, h1, staria, v-class (viano), vito |
| **Van** | 7–12 | van, sprinter, h350, van 9/10/12, van vip |
| **Small Mini Bus** | 13–17 | coaster, mini bus, small 17 |
| **Medium Bus** | 18–30 | medium bus/coach, medium 30 |
| **Large Bus** | 31–49 | large coach, large bus, grand star, large 49 |
| **Large Bus X** | 50+ | large x, 51-seat (**no current members**) |

### Recommended per-vehicle mapping (all 34)

| Vehicle (name) | maxPax | Supplier | Current type | → Proposed class | Confidence |
|---|---|---|---|---|---|
| Sedan 2 | 2 | Almushtari | Sedan | **Sedan** | ✅ |
| Car | 2 | Almushtari | NULL | **Sedan** | ✅ |
| Toyota Camry Sedan | 2 | Amman West Hotel | NULL | **Sedan** | ✅ |
| General Transport Car | 3 | General Transport | NULL | **Sedan** | ⚠️ 3-pax boundary |
| SUV 4 | 4 | Almushtari | SUV | **SUV** | ✅ |
| Hyundai Staria | 5 | Alpha | NULL | **Mini Van** | ✅ |
| Mercedes V-Class VIP | 5 | Alpha | NULL | **Mini Van** | ✅ |
| Mercedes V-Class VVIP | 5 | Alpha | NULL | **Mini Van** | ✅ |
| Mini Van 5 | 5 | Alpha | NULL | **Mini Van** | ✅ |
| Mini Van 5 | 5 | Almushtari | Mini Van | **Mini Van** | ✅ |
| Mini Van | 6 | Almushtari | Mini Van | **Mini Van** | ✅ |
| Mini Van 6 | 6 | Canonical Fleet | Mini Van | **Mini Van** | ✅ |
| Hyundai H1 Minivan | 6 | Amman West Hotel | NULL | **Mini Van** | ✅ |
| General Transport Van | 7 | General Transport | NULL | **Van** | ✅ |
| Mercedes Sprinter VIP | 9 | Alpha | NULL | **Van** | ✅ |
| Van VIP 9 | 9 | Alpha | NULL | **Van** | ✅ |
| Van 9 | 9 | Almushtari | Van | **Van** | ✅ |
| Van 10 | 10 | Almushtari | Van | **Van** | ⚠️ 10–12 gap |
| Hyundai H350 | 12 | Alpha | NULL | **Van** | ⚠️ 10–12 gap |
| Van 12 | 12 | Alpha | NULL | **Van** | ⚠️ 10–12 gap |
| Toyota Coaster Mini Coach | 14 | Desert Compass | NULL | **Small Mini Bus** | ✅ |
| Toyota Coaster | 17 | Alpha | NULL | **Small Mini Bus** | ✅ |
| Small 17 | 17 | Alpha | NULL | **Small Mini Bus** | ✅ |
| Toyota Coaster / Mini Bus 17 | 17 | Canonical Fleet | Mini Bus | **Small Mini Bus** | ✅ |
| Large VVIP 29 | 29 | Alpha | NULL | **Medium Bus** | ⚠️ named "Large", 29-pax |
| Mercedes Grand Star VIP | 29 | Alpha | NULL | **Medium Bus** | ⚠️ named "Grand Star", 29-pax |
| Alpha Medium Coach 30 Pax | 30 | Alpha | NULL | **Medium Bus** | ✅ |
| Medium 30 | 30 | Alpha | NULL | **Medium Bus** | ✅ |
| Medium Bus 30 | 30 | Canonical Fleet | Medium Bus | **Medium Bus** | ✅ |
| Mercedes Grand Star 31 Pax | 31 | Alpha | NULL | **Large Bus** | ✅ |
| Large VIP 31-33 | 33 | Alpha | NULL | **Large Bus** | ✅ |
| Large 49 | 49 | Alpha | NULL | **Large Bus** | ⚠️ Large vs Large Bus X boundary |
| Mercedes Grand Star 49 Pax | 49 | Alpha | NULL | **Large Bus** | ⚠️ Large vs Large Bus X boundary |
| Large Coach 49 | 49 | Canonical Fleet | Large Coach | **Large Bus** | ⚠️ Large vs Large Bus X boundary |

**Auto-mappable:** 26 of 34 ✅. **Need your decision:** 8 ⚠️ (below).

---

## 6. Ambiguous rows needing your decision

**D1 — 10–12 pax: Van or Small Mini Bus?** (`Van 10`, `Van 12`, `Hyundai H350`)
The bands leave a gap at 10–12. Alpha/Almushtari **name** them "Van", so the report
proposes **Van**. Confirm, or split 10–12 into Small Mini Bus.

**D2 — 29-pax coaches: Medium Bus or Large Bus?** (`Large VVIP 29`,
`Mercedes Grand Star VIP` 29) Capacity (29) → Medium band, but Alpha **names** them
"Large"/"Grand Star". Report proposes **Medium Bus by capacity**. Confirm, or honor
the "Large" naming. *(This is commercially material — affects which package/route rate
pool a 29-seater draws from.)*

**D3 — Large Bus vs Large Bus X boundary.** Your earlier note gave overlapping bands
("30–48 → Large Bus", "30–51 → Large Bus X"). All current 49-pax vehicles are proposed
as **Large Bus**; **Large Bus X has zero members**. Please define the exact split — e.g.
Large Bus = 31–49, Large Bus X = 50+? Or is "Large Bus X" a *premium/VIP* 49-seater
distinct by trim rather than capacity?

**D4 — `General Transport Car` (3 pax) → Sedan?** 3-pax is the Sedan/Mini-Van boundary.
Report proposes Sedan. Confirm.

---

## 7. Data-quality anomalies (flagged, no action in PR 0)

**A1 — Duplicate Alpha fleet (priced vs unpriced).** Alpha has **two parallel naming
schemes for the same capacities**:
- *Generic names* (`Van VIP 9`, `Van 12`, `Small 17`, `Medium 30`, `Large VVIP 29`,
  `Large VIP 31-33`, `Large 49`, `Mini Van 5`) — **carry the rate rows (~123 each)**.
- *Brand names* (`Mercedes Sprinter VIP`, `Hyundai H350`, `Toyota Coaster`,
  `Mercedes Grand Star VIP/31/49`, `Alpha Medium Coach 30`, `V-Class VIP/VVIP`,
  `Hyundai Staria`) — **0 rate rows** (10 vehicles).
→ The brand-named rows look like a redundant earlier fleet import. **Cleanup candidate
for PR 9**, not now — but mapping must not double-count Alpha when seeding contracts.

**A2 — Name collision.** `Mini Van 5` exists under **both** Alpha (NULL, 172 rows) and
Almushtari (typed, 112 rows) — same display name, different supplier. Not a true
duplicate; flag for disambiguation in the UI.

**A3 — Supplier-type mismatch.** `Amman West Hotel` (a hotel) owns transport vehicles
(`Toyota Camry Sedan`, `Hyundai H1 Minivan`), both 0 rate rows — likely seed/test
artifacts. Confirm whether these should exist as transport vehicles at all.

**A4 — Pseudo-suppliers.** `Canonical Fleet` (reference vehicles) and
`General Transport` (generic `Car`/`Van`, 0 rows) are placeholder suppliers, not real
commercial transport suppliers. Decide whether they stay as reference rows or get
quarantined before contract seeding.

**A5 — Missing luggage capacity.** All Almushtari + all Alpha generic vehicles have
`luggageCapacity = 0`. Non-blocking, but note for data hygiene.

**A6 — `vehicleType = NULL` on the main priced fleet.** 25 NULL rows, including every
priced Alpha vehicle. This is exactly what `vehicleClass` will fix — confirms the
nullable-column approach is the right call (don't trust `vehicleType` for the active
fleet).

---

## 8. Recommended mapping table for review — summary

- **8 canonical classes**, bands per §4. **26/34 vehicles map with high confidence.**
- **4 decisions (D1–D4)** needed before PR 1 backfill.
- **6 anomalies (A1–A6)** logged; none block PR 1, but A1 (Alpha duplicates) and A3/A4
  (non-commercial suppliers) should be settled before PR 9 (seed/pilot contract).
- **Large Bus X currently empty** — its definition (D3) is the only class with no data
  to validate against.

**Proposed alias map (for PR 1, after approval):** match on canonical name tokens first
(`sedan/car`, `suv`, `mini van|minivan|h1|staria|v-class`, `van|sprinter|h350`,
`coaster|mini bus|small 17`, `medium`, `large|grand star|coach 49`), then fall back to
capacity band; emit any row that matches neither cleanly into a manual-review list
(same dry-run gate, re-run before PR 1 writes anything).

---

## Restrictions honored

No schema change · no migration · no seed · no `vehicleClass` column · no backfill ·
no DB write · no quote-logic change · PR 1 not started. Report only.

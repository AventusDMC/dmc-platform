# PR 11 — Live apply of the saved transport selection (PLAN ONLY)

**Date:** 2026-06-14
**Status:** PLAN ONLY — no code, no schema, no migration, no pricing change.
**Builds on:** PR 10B-1 (selection persistence) + PR 10B-2 (selection UI + `savedSelection`/
`selectionStale` read). This is the **first step that can change a live quote total**, so it is
plan-first and tightly scoped.

> Principle: nothing is ever applied automatically. A total only changes when (a) the live-apply
> flag is ON, **and** (b) a planner has explicitly saved a **valid** PACKAGE selection, **and**
> (c) every validation gate passes at recompute time. Otherwise the existing pricing is used,
> byte-for-byte.

---

## 0. Grounding — how totals are computed today (verified, read-only)

- **Single total-assembly point:** `recalculateQuoteTotals(quoteId)` —
  `apps/api/src/quotes/quotes.service.ts:9143-9273`. It loads active `QuoteItem`s, sums each
  item's `totalCost`/`totalSell` via `calculateTotalsFromItems()`, adds Jordan Pass totals, and
  persists `Quote.{totalCost, totalSell, totalPrice, pricePerPax}`. Triggered on item
  create/update/delete and on quote-level changes.
- **Authoritative per-line cost** = `QuoteItem.finalCost` (mirrored to `totalCost`). Transport
  items are **not** distinguished during totaling — they are summed like any other item.
- **Supplier discount** (`Supplier.transportDiscountPercent`) is already baked into the transport
  line `baseCost` at item-resolution time.
- **PR9 shadow** `evaluateQuotePackagePricingShadow()` already computes, read-only:
  `currentTransportTotal` (persisted route baseline), `packageGrossTotal`, `supplierDiscountAmount`,
  `packageNetTotal`, `excludedDays`/excluded route cost, and `difference = packageNetTotal −
  currentTransportTotal`. **This is the exact delta a live apply would use** — so the live path
  reuses this single source of truth rather than re-deriving a formula.
- **Existing `excursionPackageRate`** (quotes.service.ts:~3795-3937, 5824-5937) is a *separate*
  full-day/free-mileage mechanism that rewrites touring-route line cost. It **overlaps** with the
  package regime — handled by guards now, retired later (PR 13).
- The 5 selection columns are read-only today; nothing reads them into pricing.

---

## 1. Recommended split (agree with your preference)

- **PR 11A — pilot-only live apply.** Apply the package price **only** when the saved selection's
  contract is the **pilot Alpha Large Bus USD** contract, the quote currency is USD, and **every**
  validation gate passes. Flag-gated, reversible, additive. ← this plan focuses here.
- **PR 11B — expand** to more suppliers / vehicle classes (and cross-currency/FX handling).
- **PR 12 — driver overnight + stationary** pricing (blocked/warned in 11A).
- **PR 13 — retire** overlapping mechanisms (`excursionPackageRate` / old FULL_DAY path) once the
  contract regime supersedes them.

Rationale: 11A proves the apply mechanism end-to-end on one fully-understood contract with the
narrowest blast radius, while every other quote stays exactly as today.

---

## 2. Activation model

- New flag **`transport.packagePricingLiveApply`** (env `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY`),
  **default OFF**, truthy-only — same pattern as the existing transport flags.
- **Flag OFF:** saved selection stays metadata-only; `recalculateQuoteTotals` is unchanged; no
  pricing difference whatsoever.
- **Flag ON:** a saved **valid** PACKAGE selection (pilot, in 11A) may adjust the transport
  portion of the total. ROUTE/none/invalid/stale → existing behavior.
- Independent of the read/preview flags (`packagePricingShadowCompare`, `packageOptionSelection`)
  — those can be on without apply, and apply requires its own flag.

---

## 3. Selection rules (what the recompute does, per saved option)

Read `Quote.selectedTransportPricingOption`:
- **NULL / unset** → existing pricing behavior (no change).
- **`ROUTE_TRANSFER`** → existing route/transfer pricing behavior (no change; the selection just
  records the planner's intent and keeps current line costs).
- **`PACKAGE_MIN_FULL_DAY`** → package pricing may apply **only if ALL** of the following hold at
  recompute time (re-validated server-side, never trusting stored state):
  1. `selectedTransportContractId` resolves to an existing `TransportContract`.
  2. that contract is **active** (`active: true`).
  3. contract **matches** the quote's primary transport supplier **and** vehicle class **and**
     currency (the same `primary` the shadow derives).
  4. **(PR 11A only)** that contract is the **pilot** (supplier = Alpha, vehicleClass = Large Bus,
     currency = USD) — non-pilot contracts are **not applied** in 11A (no change + warning).
  5. **(PR 11A only)** quote currency **== USD** (contract currency) — avoids FX ambiguity; a
     non-USD quote is **not applied** + warning (cross-currency is PR 11B).
  6. package **eligibility still valid** (`evaluatePackageEligibility` → eligible).
  7. **no manual-required days** (`manualRequiredDays === 0`).
  8. **not stale** (`selectionStale === false` — stored contract id matches the freshly resolved
     active contract).
  9. **minimumFullDays rule passes** (`countedFullPackageDays ≥ minimumFullDays`, or the
     contract's `CHARGE_MINIMUM_DAYS` policy resolves; default policy `INELIGIBLE_UNDER_MIN`).
- If any gate fails → **do not apply**; keep existing route/transfer pricing; surface a warning
  (and, if PACKAGE was selected but blocked, mark it stale/invalid in the read response).

---

## 4. Pricing calculation (formula — reuse the PR9 shadow, do not re-derive)

The live apply computes the package transport subtotal **identically to the PR9 shadow**, so the
"preview" the planner saw equals what gets applied:

- **Billable full days** = days with `packageDayWeight === 1` (touring/full-day/retained P2P).
- **Half days** = days with `packageDayWeight === 0.5` (×`halfDayRate`, per contract policy).
- **Package gross** = `billedAtMinimum ? minimumFullDays × fullDayRate : fullDayCount ×
  fullDayRate + halfDayCount × halfDayRate`.
- **Supplier discount** = `× (1 − transportDiscountPercent/100)` → **package net**.
- **Excluded transfer days** = non-counted transport days (airport, released P2P, standby,
  manual-required, stationary) keep their **existing persisted route cost** and are **added on top**
  of the package net (covered in both totals so the delta is apples-to-apples).
- **Airport transfers** = excluded by default (priced separately as today) unless a future
  contract sets `airportTransferIncluded`.
- **Released P2P days** = excluded (weight 0).
- **Manual-required days** = block the whole apply (gate 7) — never silently priced.
- **Stationary days** = **blocked or warned, not priced** in 11A (PR 12). If a stationary day is
  present and would change the answer, 11A either keeps it as an excluded route-cost day **and
  warns**, or blocks (decision D3 below).
- **Driver overnight** = **not priced** in 11A (PR 12) — `excludes-driver-overnight` warning
  retained.
- **Alpha pilot warning** retained: uses the **standard Large Bus 49** rate only, **not** the VIP
  31–33 live rate (`standard-large-bus-49-rate-only-not-vip-31-33`).

**Applied delta:** `appliedDelta = packageNetTotal − currentTransportTotal` (= the shadow's
`difference`). The new cost total = `itemTotals.totalCost + appliedDelta` (transport portion
swapped, everything else untouched).

### Open decision D1 — sell-side treatment (needs your call before 11A code)
The shadow computes **cost** only. To reflect the package on the **sell**/`totalSell` side, pick:
- **D1a (recommended):** preserve margin — apply the **weighted-average markup of the replaced
  transport lines** to the package net, so `appliedSellDelta` mirrors current transport margin
  policy. Most faithful to existing pricing.
- **D1b:** cost-only — `appliedSellDelta = appliedDelta` (no added margin on the package portion).
  Simplest, but understates/zeroes transport margin.
- **D1c:** flat configured markup for package transport.

### Open decision D2 — injection point
- **D2a (recommended):** **total-level additive delta inside `recalculateQuoteTotals`** — compute
  `appliedDelta`/`appliedSellDelta` from the contract and adjust the persisted totals; **do not
  mutate any `QuoteItem` rows**. Per-line route costs stay intact, so revert = stop adding the
  delta (flag OFF or selection cleared). Cleanest + most reversible. Requires the total-assembly to
  call the package computation when gates pass.
- **D2b:** item-level rewrite of transport line `finalCost` — invasive, destroys per-line route
  cost, hard to revert. **Not recommended.**

### Open decision D3 — stationary present in a pilot quote
- **D3a (recommended for safety):** **block** apply + warn ("stationary not priced — PR 12").
- **D3b:** apply package for counted days, keep stationary as an excluded route-cost day + warn.

---

## 5. Guaranteeing existing quote behavior is unchanged

- **No saved selection / NULL** → gate fails at step "option is PACKAGE"; `recalculateQuoteTotals`
  takes the existing path. Test: total identical with flag ON and OFF.
- **ROUTE_TRANSFER selection** → no delta applied; existing totals. Test: identical.
- **Package selection invalid/ineligible/stale/manual-required** → no apply; existing totals +
  warning.
- **Previous route/transfer logic still available** — never deleted; it is the default and the
  fallback. The package path is purely additive on top of `recalculateQuoteTotals`.
- **Non-pilot suppliers** → gate 4 fails → no change (11A).
- **Small-vehicle suppliers (Almushtari/JOD, ≤Van9)** → not pilot + currency≠USD → no change.
- **Old `excursionPackageRate` / FULL_DAY mechanism** → untouched in 11A. Guard: if a quote has
  `excursionPackageRate` enabled **and** a PACKAGE live-apply would also fire, 11A **blocks the
  package apply + warns** (`overlap-with-excursionPackageRate`) to avoid double-charging. Retirement
  is PR 13, explicitly approved later.

---

## 6. Storage / audit (propose options — NO schema unless you approve)

What "applied" state to record:
- applied option, applied contract id, applied amount (cost delta / package net), comparison to old
  total, timestamp, actor, stale status.

Options:
- **A (recommended for 11A) — no schema, derive at read time.** The applied result is fully
  re-derivable from the selection columns + the PR9 shadow (`difference`, `packageNetTotal`,
  `currentTransportTotal`, `selectionStale`). Expose an `applied: { option, contractId,
  appliedAmount, previousTransportTotal, appliedTransportTotal }` block on the existing shadow
  read when live-apply is ON. **Zero migration, zero new write surface.**
- **B — minimal columns.** Add `appliedTransportPricingOption`, `appliedTransportAmount`,
  `appliedAt` to Quote (additive nullable). Persists the audit but needs a migration + a write at
  recompute. Propose only if you want a durable record independent of recompute.
- **C — full audit table.** `QuoteTransportPricingApplication` rows (option, contract, amounts,
  actor, timestamp, stale). Most complete; heaviest. Defer to PR 11B+ if ever.

Recommendation: **Option A for 11A** (no schema). Revisit B/C when expanding.

---

## 7. UI behavior proposal (do NOT implement in this plan)

In `PackagePricingPreview.tsx` (and wherever the quote total is shown), when live-apply is ON and a
package is applied:
- A clear **"Package pricing is APPLIED to this quote total"** banner (replacing
  "NOT APPLIED TO TOTALS" for the applied case).
- Show that the **current quote total changed because the selected package option is active**
  (old transport subtotal → new), reusing the shadow `difference`.
- Keep **route/transfer available** with a **"Revert to route/transfer"** affordance (saves
  `ROUTE_TRANSFER` or clears, which removes the delta on the next recompute).
- **Stale/invalid** package while applied → prominent warning that pricing fell back to
  route/transfer (apply was blocked) and the planner must re-select or clear.
- No apply button that *computes a price on click* — apply is a consequence of the saved selection
  + flag, not a one-off action; still no automatic cheapest selection.

---

## 8. Tests (plan)

API (`recalculateQuoteTotals` + a package-apply helper, plus the shadow read):
1. **flag OFF** → total identical to baseline for every selection state.
2. **no saved selection** → no total change (flag ON).
3. **ROUTE_TRANSFER** selection → existing total (flag ON).
4. **valid pilot PACKAGE** → total = baseline + `difference`; transport portion swapped, other
   items unchanged.
5. **stale PACKAGE** (contract id mismatch / deactivated) → **blocked**, existing total + warning.
6. **ineligible PACKAGE** (below minimum) → blocked, existing total.
7. **manual-required days** → blocked, existing total.
8. **stationary / overnight present** → blocked or warned, **never silently priced** (per D3).
9. **airport-transfer day** → excluded by default; its route cost retained in both totals.
10. **supplier discount** → package net = gross × (1 − pct); discount applied exactly once.
11. **excluded transfer days** → retained from existing persisted costs (added on top of package
    net).
12. **non-pilot supplier** → unaffected (no apply in 11A).
13. **Alpha VIP 31–33** quote → **does not** borrow the Large Bus 49 pilot rate (gate 3/4 vehicle
    class/contract mismatch → no apply).
14. **cross-currency** (non-USD quote) → blocked in 11A + warning.
15. **excursionPackageRate overlap** → blocked + warning (no double-charge).
16. **rollback** → flipping the flag OFF restores the baseline total exactly (no residue).
17. **sell-side** (per D1) → `totalSell` delta matches the chosen margin rule.

Source-grep / no-regression: existing quotes.service tests stay green; admin-web preview tests
extended for the applied/revert UI when that ships.

---

## 9. Rollback plan

- **Flag OFF restores old pricing** — because apply is computed at recompute time as an additive
  delta (D2a) and never mutates per-line items, turning the flag off makes the next
  `recalculateQuoteTotals` produce the original total. (Note: totals are only restored on the next
  recompute; PR 11A should document that flipping the flag does not retro-rewrite already-persisted
  totals until each quote recomputes — or include a one-shot recompute pass if you want immediate
  restoration.)
- **Saved selection metadata remains** but is simply not applied.
- **No DB rollback required** under Option A (no schema). If you later choose Option B/C, a
  migration down (`DROP COLUMN`/drop table) is the rollback, and data is nullable/non-load-bearing.

---

## 10. Risks

- **Totals changing unexpectedly** — mitigated by flag default OFF + explicit-selection-only +
  recompute-time re-validation. Risk window: enabling the flag recomputes affected quotes.
- **Stale saved selection** — re-validated server-side every recompute; stale → blocked + warned.
- **Wrong vehicle variant** — gate 3 (supplier+class+currency match) + 11A pilot pin; tests 12–13.
- **Alpha Large Bus vs VIP 31–33 ambiguity** — pilot pin to the standard Large Bus 49 contract;
  VIP quotes fail the contract/class match → no apply; explicit warning retained.
- **Overnight/stationary not priced** — gate blocks/warns (D3); never silently priced (PR 12).
- **`excursionPackageRate` overlap** — explicit overlap guard (block + warn); retirement in PR 13.
- **Mixed supplier/currency quote** — 11A requires single primary supplier + USD; mismatch →
  blocked. Multi-supplier/cross-currency is PR 11B.
- **Day-membership mismatch** — the shadow's `currentTransportTotal` is derived from
  `quoteItineraryDay → dayItems` persisted costs, while `itemTotals` sums `QuoteItem.totalCost`;
  if a transport item is not joined to a day, the delta could be computed against a different
  transport base. **Mitigation:** in 11A, compute the replaced transport base and the package days
  from the **same** join the shadow uses, assert the replaced base ⊆ itemTotals transport lines,
  and **block + warn** if they diverge (`day-membership-mismatch`). Tests cover this.
- **User confusion when the total changes** — addressed by the applied banner + before/after +
  revert affordance (UI proposal §7).

---

## 11. Acceptance criteria (for the eventual PR 11A)

- Flag default OFF; with OFF, no quote total differs by a single cent from today.
- With ON, a total changes **only** for a quote with an explicitly-saved **valid pilot PACKAGE**
  selection passing every gate; the change equals the shadow `difference`.
- ROUTE/none/invalid/stale/ineligible/manual-required/non-pilot/non-USD/overlap → **no apply**,
  existing total, appropriate warning.
- No per-`QuoteItem` mutation (D2a); revert via flag-off or selection change restores baseline on
  recompute.
- No automatic cheapest selection; no silent switching; no manual override of ineligible.
- No driver-overnight / stationary pricing; no schema/migration (Option A); `excursionPackageRate`
  untouched and guarded.
- Non-pilot, small-vehicle, and VIP quotes provably unaffected.
- All existing + new tests green; build green.

---

## 12. Decisions needed before PR 11A code
- **D1** sell-side treatment (recommend **D1a** weighted-average markup).
- **D2** injection point (recommend **D2a** total-level additive delta, no item mutation).
- **D3** stationary-present handling (recommend **D3a** block + warn).
- **D4** audit storage (recommend **Option A** no schema).
- **D5** rollback immediacy (recompute-on-next-edit vs one-shot recompute pass on flag-off).
- **D6** confirm the **pilot contract id** to pin in 11A (the PR8 pilot:
  `66f5de06-28df-426c-90b8-ffaa01ed5c5f`, Alpha Large Bus USD) — pin by id, or by
  supplier+class+currency match?

## 13. Explicitly NOT in this step
No PR 11 implementation · no live pricing activation · no quote total change · no schema/migration
(pending approval) · no driver overnight · no stationary charging · no automatic cheapest
selection · no PR 12 work · no `excursionPackageRate` retirement · no quote-WIP stash restore/drop
· no dana files · no `touring_route_days` cleanup · `proposal-v3-pdf-export.test.ts` stays excluded.

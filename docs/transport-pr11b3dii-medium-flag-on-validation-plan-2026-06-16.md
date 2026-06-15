# PR 11B-3D-ii — Controlled flag-ON validation, Medium 30 pilot (PLAN ONLY)

**Date:** 2026-06-16
**Status:** PLAN ONLY. Do NOT run until approved. Same 2-phase, in-process, reversed-in-run process
proven for the Large Bus pilot — restricted to the two Medium DRAFT/TEST quotes.

**Targets (only these two):**
- Scenario A `84ba04f5-0127-4f13-8ac2-07d2b2cc7503` — baseline 1641.75 / 1641.75, expected delta **0**.
- Scenario B `caf51d18-c8d9-45cf-932a-6251d5e8540c` — baseline 3102.75 / 3102.75, expected delta
  **−1606.50** → flag-ON total **1496.25 / 1496.25**.

Medium contract `eabd43a0-2374-49d7-aaba-959df4d7c8bd`; allowed vehicle Medium 30
`da68f987-ce15-469a-8a65-50c2ee2bbca3`.

## Environment
- Throwaway NestApplicationContext script with `process.env.TRANSPORT_PACKAGE_PRICING_LIVE_APPLY =
  'true'` set **in-process for Phase 1 only** (read flags `…SHADOW_COMPARE` / `…OPTION_SELECTION`
  also in-process for the preflight). Connects to the shared Railway DB.
- **No production-wide flag changed:** value lives only in the script process for its lifetime; no
  Vercel/Railway env, no settings file, no global export; production stays OFF after exit.
- DB writes: `quote.update` totals on **only the two test quotes** (applied in Phase 1, restored in
  Phase 2). No other table, no other quote, no QuoteItem writes.

## 1. Read-only preflight (assert per quote; abort whole run on any mismatch, before any flag/recompute)
For each of the two hard-coded ids:
- `status === 'DRAFT'`; `title` starts with `TEST — Alpha Medium Bus Package Pilot`.
- `quoteCurrency === 'USD'`.
- `selectedTransportPricingOption === 'PACKAGE_MIN_FULL_DAY'`.
- `selectedTransportContractId === 'eabd43a0-…'` (Medium contract).
- pricing-shadow: `selectionStale === false`, `allowlist.allowed === true`,
  `allowlist.allowedVehicleIds === [da68f987-…]`, `allowlist.resolvedVehicleIds === [da68f987-…]`,
  vehicleNames = [Medium 30] (i.e. **Medium 30 only; Large VVIP 29 not used**).
- shadow `difference` matches expected (A `0`, B `−1606.5`).
- capture before-totals + QuoteItem `{count, ΣtotalCost, ΣtotalSell}`.
Abort (no recompute) if any assertion fails.

## 2. Phase 1 — flag ON (in-process)
- Set the flag; recompute both via `recalculateQuoteTotals`.
- Expect: **A 1641.75 / 1641.75** (delta 0); **B 1496.25 / 1496.25** (delta −1606.5 applied).

## 3. Phase 2 — rollback (finally block, always runs)
- Unset the flag; recompute both.
- Expect: **A 1641.75 / 1641.75** (unchanged); **B back to 3102.75 / 3102.75**.
- Saved selection metadata remains (PACKAGE, Medium contract) but is **not applied** with flag OFF.
- Phase 2 runs even if Phase 1 throws → totals never left in the applied state.

## 4. Safety checks (asserted in-script)
- **No QuoteItem mutation:** capture per-quote `{count, ΣtotalCost, ΣtotalSell}` before Phase 1 and
  after Phase 2 → identical for both (PR 11A/B apply the delta only at total assembly).
- Only quote-level totals change during Phase 1; only on the two test quotes (hard-coded 2-id list).
- No production/global env changed; no real quotes touched; CONFIRMED "Exodus" quote untouched.
- No contracts created; no migrations; no code changes; no unrelated files.

## 5. Report format (after running)
- Exact command/process (`node --require ts-node/register <throwaway>.ts`, flag in-process Phase 1
  only; script deleted after).
- Preflight results (both quotes: DRAFT/TEST/USD/PACKAGE/Medium-contract/not-stale/allowlist-allowed/
  Medium-30-only/shadow-difference).
- Before / flag-ON / flag-OFF totals for both:
  - A: 1641.75 → 1641.75 → 1641.75.
  - B: 3102.75 → 1496.25 → 3102.75.
- QuoteItem count + sums before/after (identical).
- Confirmations: Medium 30 allowlist passed; Large VVIP 29 not used; production flag remains OFF; no
  real quotes touched; final state = baseline.

## Risks
- First real flag-ON apply on Medium — but only on throwaway DRAFTs, reversed in the same run.
- DB writes occur (the two test quotes' totals) — all restored in Phase 2; if rollback fails or final
  totals don't match baseline, **stop immediately and report exact current state**.
- Railway interactive-transaction flakiness affected day-creation in 3D-i; this run does NOT create
  days — it only calls `recalculateQuoteTotals` (a single `quote.update`, no interactive
  `$transaction`), so that flakiness does not apply. If a transient connection error occurs, retry
  (idempotent: each recompute recomputes from items).
- Scenario A delta 0 is expected (package == discounted daily card); Scenario B shows the saving.

## Acceptance criteria
- Preflight passes for both; with flag ON A stays 1641.75 and B becomes 1496.25; with flag OFF both
  restored to baseline (A 1641.75, B 3102.75).
- QuoteItem rows unchanged (count + sums); only quote-level totals temporarily changed.
- Production flag OFF throughout; no global env change; no real quotes touched; Exodus untouched.
- No code/schema/migration/contract change; `quotes.service.ts` untouched;
  `proposal-v3-pdf-export.test.ts` excluded.

## Strictly not in this step
No run until approved; no production activation; no PR 12/13; no quote-WIP stash; no dana; the only
DB writes (after approval) are the temporary-then-restored totals on the two test quotes.

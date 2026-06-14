# PR 11A — Controlled flag-ON validation plan (two test quotes only) — PLAN ONLY

**Date:** 2026-06-14
**Status:** PLAN ONLY. Do NOT run until approved. This is the FIRST time live apply will actually
move a quote total — restricted to two throwaway DRAFT test quotes, fully reversible.

**Targets (only these two):**
- Scenario A `04f87127-f30c-4489-99d5-bddd3ab3adbd` — expected delta **0** (2031 → 2031).
- Scenario B `714ac0d8-5ade-41be-9f6d-1b3f7ab55b79` — expected delta **−2094** (3892.50 → 1798.50).

---

## 1. Environment
- Run a **throwaway NestApplicationContext script** (same harness as the Scenario A/B creation
  scripts) with **`process.env.TRANSPORT_PACKAGE_PRICING_LIVE_APPLY = 'true'` set inside that
  process only** (plus the read flags `TRANSPORT_PACKAGE_PRICING_SHADOW_COMPARE` /
  `TRANSPORT_PACKAGE_OPTION_SELECTION` so the shadow/selection read paths work). The flag is read
  via `process.env` at recompute time, so setting it in-process is sufficient and scoped.
- **Shared DB: YES, it connects to the shared Railway DB** (local `apps/api/.env` `DATABASE_URL`).
  The flag-ON recompute **writes** `quote.update` (totalCost/totalSell/totalPrice/pricePerPax) for
  **only the two test quotes**. No other table, no other quote. The restoration phase writes them
  back to baseline.
- **No production-wide flag changed:** the value lives only in the script process's env for its
  lifetime. No Vercel/Railway env var, no `settings.json`, no global shell export, nothing persisted
  after the process exits. Production services keep the flag OFF (default).

## 2. Scope + pre-flight gates (script asserts before any recompute; aborts on mismatch)
Operate on **exactly the two ids above** — the script iterates a hard-coded 2-element list, never a
query over all quotes. For each, assert:
- `status === 'DRAFT'` and `title` starts with `TEST — Alpha Large Bus Package Pilot`.
- `quoteCurrency === 'USD'`.
- `selectedTransportPricingOption === 'PACKAGE_MIN_FULL_DAY'`.
- `selectedTransportContractId === '66f5de06-28df-426c-90b8-ffaa01ed5c5f'` (pilot).
- pricing-shadow `selectionStale === false`.
If any assertion fails for either quote → **abort the whole run** (no recompute), report.

## 3. Scenario A expected result
- Before: **2031 / 2031**. Shadow `difference = 0`.
- Flag-ON recompute: **2031 / 2031** (no change — package net equals the discounted daily-card
  baseline). Confirms no unintended movement when delta is 0.

## 4. Scenario B expected result
- Before: **3892.50 / 3892.50**. Shadow `difference = −2094`.
- Flag-ON recompute: **1798.50 / 1798.50** (cost delta −2094, sell delta −2094 at 0% markup).
  Confirms live package apply works for the retained-P2P saving.

## 5. Rollback / restoration (same script, always runs last)
The script has two phases in one execution so the DB is left at baseline no matter what:
- **Phase 1 (flag ON):** recompute both → capture after-totals (A 2031/2031, B 1798.50/1798.50).
- **Phase 2 (flag OFF):** unset the env flag, recompute both again → capture restored totals.
  Expect **A 2031/2031** (unchanged) and **B back to 3892.50/3892.50**.
- Confirm the **saved selection metadata still exists** on both (option PACKAGE, pilot contract)
  but is **not applied** when the flag is OFF.
- The script restores (Phase 2) even if Phase 1 assertions/asserts throw mid-way (finally-guarded),
  so totals never stay in the applied state unintentionally.

## 6. Safety checks (asserted in-script)
- **No QuoteItem rows mutated:** capture per-quote `count` + `sum(totalCost)` + `sum(totalSell)` of
  QuoteItems before Phase 1 and after Phase 2 → must be identical for both quotes. (PR11A applies
  the delta only at total assembly; it never writes items.)
- **Only quote-level totals change during flag-ON** (and only on the 2 test quotes).
- **No real quotes touched** — hard-coded 2-id list; pre-flight asserts DRAFT/TEST title.
- No new contracts, no migrations, no code changes, no unrelated files, no stash/dana, proposal-v3
  excluded.

## 7. Report format (what I will return after running)
- **Exact command/process:** `node --require ts-node/register <throwaway>.ts` with
  `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY` set in-process for Phase 1 only; script deleted after.
- **DB writes:** YES — `quote.update` totals on the 2 test quotes (Phase 1 applies, Phase 2
  restores). No QuoteItem writes; no other rows.
- **Before/after totals for both quotes:**
  - A: before 2031/2031 → ON 2031/2031 → OFF 2031/2031.
  - B: before 3892.50/3892.50 → ON 1798.50/1798.50 → OFF 3892.50/3892.50.
- **Rollback/recompute results:** both restored to baseline; selection metadata intact, not applied.
- **Confirmation flag not enabled globally:** value only in the script process env; no deployed/
  global env or settings changed; production remains OFF.
- **Confirmation no real quotes touched:** only `04f87127-…` and `714ac0d8-…` (both DRAFT/TEST);
  QuoteItem sums unchanged.

## Notes / risks
- This is the first real flag-ON apply; it is on throwaway DRAFTs and is reversed in the same run.
- After this validation the production flag stays OFF; turning it on for real quotes remains a
  separate, explicitly-approved future step (not part of this plan).
- Leaving the two test quotes in place afterwards (per your instruction) — they end at baseline
  totals with PACKAGE selection saved (not applied, flag OFF).

## Strict safety (unchanged)
Do NOT set `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY` anywhere but the throwaway process; no production
flags; no real quotes; no new contracts; no migrations; no code changes; no unrelated files; no
quote-WIP stash; no dana files; keep `proposal-v3-pdf-export.test.ts` excluded. Do NOT start
PR 11B/12/13.

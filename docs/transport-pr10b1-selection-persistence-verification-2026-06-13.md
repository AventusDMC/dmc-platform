# PR 10B-1 — Selection Persistence (schema + save/clear API): Verification

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr10b1`
**Migration:** `20260613150000_add_quote_transport_selection`

PR 10B-1 persists a planner's manual route-vs-package selection on the quote as **metadata
only**. **No UI, no live apply, no quote-total/item change.** Ineligible PACKAGE selections
are **hard-blocked**.

## Schema (additive, nullable, metadata-only on Quote)
```
selectedTransportPricingOption  TEXT        -- 'ROUTE_TRANSFER' | 'PACKAGE_MIN_FULL_DAY' | null
selectedTransportContractId     UUID        -- set only when PACKAGE (plain column, no FK)
transportSelectionIsManual      BOOLEAN
transportSelectionAt            TIMESTAMP(3)
transportSelectionByUserId      UUID        -- plain column; null when no actor id available
```
Plain nullable columns (no FK relations) → purely additive. No package price stored; no
totals/items columns touched.

## Migration (production-safe)
| Stage | Result |
|---|---|
| Recovery point | 66 quotes (read-only) |
| Before deploy | 188 migrations; **only** `20260613150000_add_quote_transport_selection` pending |
| Diff method | schema-to-schema (origin/main → edited) → 5 nullable `ADD COLUMN` only |
| Apply | `prisma migrate deploy` (never `migrate dev`) |
| After deploy | **"Database schema is up to date!"** |

## API
- New endpoint `PATCH /transport-pricing/quotes/:id/package-selection` (`@Roles('admin','finance')`).
- Flag **`transport.packageOptionSelection`** (env `TRANSPORT_PACKAGE_OPTION_SELECTION`),
  **default OFF** → endpoint rejects (`ForbiddenException`). ON → save/clear metadata only.
- Body `{ option, manualOverride? }`. Actor id via `@Actor()` → `actor?.id ?? null` (not faked).
- Service writes **only the 5 selection columns** via a targeted `prisma.quote.update` —
  **never** recalculates, **never** touches quote items/totals/supplier/method.
  `quotes.service.ts` is untouched.

## Validation (hard-block ineligible — PR 10B-1)
- `option` ∈ `{ROUTE_TRANSFER, PACKAGE_MIN_FULL_DAY, null}`; else 400.
- **ROUTE** always allowed (no contract needed).
- **PACKAGE** requires the quote's resolved `PACKAGE_MIN_FULL_DAY` contract AND current
  eligibility:
  - no contract → `no-package-contract`
  - manual-required days > 0 → `manual-required-days`
  - not eligible (below-minimum) → `below-minimum`
  - **`manualOverride` is ignored — ineligible is hard-blocked** (override deferred to PR 10B-2/11).
- Resolved contract id is stored (guaranteeing supplier/class/currency context).
- **Clear** (`option: null`) → all 5 fields set NULL.
- Unknown quote → 404.

## Sample save/clear results
- Save ROUTE → `{ selectedTransportPricingOption: 'ROUTE_TRANSFER', selectedTransportContractId: null, transportSelectionByUserId: 'user-1', transportSelectionAt: <ts>, notApplied: true }`.
- Save eligible PACKAGE (3 retained/touring + pilot) → `{ option: 'PACKAGE_MIN_FULL_DAY', selectedTransportContractId: <pilot>, ... }`.
- Clear → all selection fields null.
- Ineligible PACKAGE (2 days / no contract / manual-required) → 400 with the reason.

## Tests
`package-eligibility-shadow.service.test.ts` — **32 tests pass** (9 new PR 10B-1): save ROUTE
(write payload = only the 5 selection keys) · save eligible PACKAGE (option + contractId) ·
clear → nulls · no-contract/below-minimum/manual-required rejected · invalid option & unknown
quote rejected · **controller flag OFF rejects (service not called)** · flag ON calls service
with option + actor id. `nest build` passes.

## Confirmation — no live behavior changed
- The `quote.update` writes **only** the 5 selection columns (asserted) — no totals, items,
  supplier, or method; no recalculation; `quotes.service.ts` byte-for-byte unchanged.
- No package price stored as the live quote price. No `DAILY_PACKAGE`, no overnight/stationary
  charging, no UI (PR 10B-2), no apply (PR 11).
- Flag default OFF → endpoint rejects.

## Files (PR 10B-1)
| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | +5 nullable Quote fields |
| `apps/api/prisma/migrations/20260613150000_add_quote_transport_selection/migration.sql` | additive migration |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` | `saveQuotePackageSelection` + `computeQuoteEligibility` + `writeSelection` |
| `apps/api/src/transport-pricing/transport-pricing.controller.ts` | flag-gated `PATCH …/package-selection` |
| `apps/api/src/transport-pricing/transport-feature-flags.ts` | `transport.packageOptionSelection` (default OFF) |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` | +9 PR 10B-1 tests |
| `docs/transport-pr10b-selection-persistence-plan-2026-06-13.md` + this | docs |

## Excluded (unrelated)
`apps/api/src/quotes/proposal-v3-pdf-export.test.ts` (linter auto-fix) — **left untouched and
excluded** (not staged/committed). Not reverted/stashed.

## Rollback
Flag OFF disables the endpoint. Migration reversible (`DROP COLUMN` ×5). No data depends on it
(NULL default). Live pricing never touched.

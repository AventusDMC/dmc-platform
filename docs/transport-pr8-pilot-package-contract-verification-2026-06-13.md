# PR 8 — Pilot PACKAGE_MIN_FULL_DAY Contract: Verification (shadow only)

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr8`
**Created contract ID:** `66f5de06-28df-426c-90b8-ffaa01ed5c5f`

PR 8 creates **one** pilot `PACKAGE_MIN_FULL_DAY` contract for **shadow validation only**.
It is **not wired into live pricing** — no live pricing path reads PACKAGE contracts; only
the read-only shadow endpoint does.

## Pilot contract (created)
| Field | Value |
|---|---|
| id | `66f5de06-28df-426c-90b8-ffaa01ed5c5f` |
| supplierId | `3f63311b-021f-432a-8ff8-fc5d5f407ad0` (Alpha Bus and Limo Co) |
| vehicleClass | `Large Bus` · currency `USD` |
| regime | `PACKAGE_MIN_FULL_DAY` |
| minimumFullDays | 3 · minimumDayPolicy `INELIGIBLE_UNDER_MIN` |
| fullDayRate / halfDayRate | 656 / 370 (standard Alpha Large 49 USD) |
| airportTransferIncluded | false · validity 2026-04-01…2026-12-31 · active true |
| notes | `PILOT — shadow only — standard Alpha Large Bus 49 rate, not VIP 31-33 live pricing` |

**Per-vehicle nuance (deferred):** the Large Bus class also has a premium `Large VIP 31-33`
rate (930/585). This pilot represents the **standard Large 49** rate only and **must not** be
treated as the VIP 31-33 live package rate. Per-vehicle/package-rate modeling is for PR 9+.

## Creation method (approved)
Idempotent script `scripts/create-pilot-package-contract.cjs`:
- supplier sanity check; `findMany` match → **>1 aborts**, **1 = no-op**, **0 = create**.
- `--dry-run` previews without writing.

## Preflight (before the write)
- `prisma migrate status`: **"Database schema is up to date!"** (187 migrations).
- Recovery point: 17 contracts total, **0 PACKAGE, 0 existing pilot**.
- Dry-run: "would create exactly 1 contract" with the approved values.

## Run result
- `CREATED {"id":"66f5de06-28df-426c-90b8-ffaa01ed5c5f"}`.
- Idempotent re-run: `EXISTS … action: none (idempotent)` — no duplicate.

## Shadow validation (against the real contract — 7 checks, all passing)
- The shadow `findFirst({ supplierId, vehicleClass:'Large Bus', regime:'PACKAGE_MIN_FULL_DAY',
  active:true })` **locates** the pilot; values correct (USD, min 3, INELIGIBLE_UNDER_MIN,
  656/370, PILOT notes).
- The pilot has **0 attached rate rows** (no rate changes; ROUTE contracts untouched).
- **Exactly one** pilot (no duplicate).
- 3 retained full days → **eligible**, countedFullPackageDays 3.
- 2 retained days → **below-minimum**, ineligible.
- 3 released P2P days → counted 0, ineligible.
- 3 adjacency candidates → counted 0, `manualRequiredDays 3` (not auto-counted).

## Confirmation — live pricing/quotes unchanged
- **No live pricing path reads PACKAGE contracts** (grep: only the shadow service's
  `findFirst` and the evaluator reference `PACKAGE_MIN_FULL_DAY`; `quotes.service.ts` = 0).
- The create added **one contract row, no rate rows** → no route/transfer rate changes; quote
  items/totals untouched.
- No `DAILY_PACKAGE`, no `minimumFullDays` enforcement in live pricing, no overnight/stationary
  charging, no automatic cheapest selection, no package-option UI.

## Files (PR 8)
| File | Type |
|---|---|
| `scripts/create-pilot-package-contract.cjs` | new (idempotent create + --dry-run) |
| `docs/transport-pr8-pilot-package-contract-plan-2026-06-13.md` | plan |
| `docs/transport-pr8-pilot-package-contract-verification-2026-06-13.md` | this |

No app/schema/migration/pricing/UI code. The throwaway verification test used to exercise the
real contract was deleted (not committed).

## Rollback
- **Soft disable (sufficient):** `active = false` on `66f5de06-…` → the shadow's
  `findFirst(active:true)` stops matching → reverts to `no-package-contract`. No other effect.
- **Hard cleanup (only if explicitly decided):** delete the row (clean — 0 rate rows
  reference it; ROUTE contracts untouched). The script re-creates it idempotently.
- No live pricing rollback needed (live pricing never reads PACKAGE contracts).

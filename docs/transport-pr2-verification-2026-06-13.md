# PR 2 — TransportContract + ROUTE_TRANSFER backfill: Verification

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr2` (based on repaired `origin/main` @ `a0a60067`)
**Migration:** `20260613130000_add_transport_contracts`

PR 2 adds the `TransportContract` / rate-regime layer and backfills **only** default
`ROUTE_TRANSFER` contracts, attaching existing commercial rate rows. **Additive and
inert** — no pricing/quote/UI logic changed, no `PACKAGE_MIN_FULL_DAY` contracts, no
`DAILY_PACKAGE` activation.

## Preflight (before any DB write)
- Recovery-point snapshot of the 3 rate tables captured (733/699/256 row ids) to a temp
  file outside the repo.
- `prisma migrate status`: only `20260613130000_add_transport_contracts` pending; no
  "migration in DB but not found locally" divergence (repaired by PR #452).
- Final dry-run re-confirmed: 17 contracts · 1,673 attach (733/699/241) · 15 skipped
  (Amman West Hotel) · 0 ambiguous · 0 priced-Alpha ambiguity · 0 non-commercial.

## Migration status
| Stage | Result |
|---|---|
| Before deploy | 186 found; 1 pending (`add_transport_contracts`); no divergence |
| After deploy  | **"Database schema is up to date!"** (186 applied, 0 pending) |
| Production-safe flow | `prisma migrate deploy` (never `migrate dev` against Railway) |

## Backfill (idempotent, deterministic supplier + vehicleClass + currency grouping)
A first run partially completed (created 8 contracts, attached 0 rows) then the Railway
connection dropped; a row-attach filter also mis-handled NULLs. Re-run with a **batched,
NULL-safe, idempotent** backfill resolved it cleanly: reused the 8 contracts, created the
remaining 9, and attached all rows in one `updateMany` per (contract, table).

### Post-backfill counts (verified)
| Metric | Expected | Actual |
|---|---|---|
| `ROUTE_TRANSFER` contracts | 17 | **17** ✓ |
| `PACKAGE_MIN_FULL_DAY` contracts | 0 | **0** ✓ |
| VehicleRate attached | 733 | **733** ✓ |
| TransportPricingRule attached | 699 | **699** ✓ |
| TouringRoutePricing attached | 241 | **241** ✓ |
| Total attached | 1,673 | **1,673** ✓ |
| VehicleRate NULL remaining | 0 | **0** ✓ |
| TransportPricingRule NULL remaining | 0 | **0** ✓ |
| TouringRoutePricing NULL remaining (skipped) | 15 | **15** ✓ |
| Non-commercial contracts | 0 | **0** ✓ |

Contracts by supplier: **Alpha 10 · Almushtari 5 · Desert Compass 2**.

## Skipped rows
The **15** unattached `TouringRoutePricing` rows are **all Amman West Hotel**
(non-commercial), left with `transportContractId = NULL` by design. No Canonical Fleet /
General Transport / Amman West Hotel contracts were created. Alpha 0-rate duplicate
vehicles were not double-counted (they own no rate rows).

## No behavior activated / changed
- No pricing logic, quote logic, or quote-builder UI changed.
- `DAILY_PACKAGE` not activated; no `PACKAGE_MIN_FULL_DAY` contracts created.
- Rate-table row totals unchanged (733/699/256) — no price/currency/validity field on any
  existing row was modified; only the new nullable `transportContractId` was populated.
- The contract layer is read by no pricing/quote code (inert until a later PR).

## Out of scope (tracked separately)
- The deeper `touring_route_days` table↔schema drift (history repaired by PR #452;
  model re-adopt vs. table drop is a separate decision).
- `PACKAGE_MIN_FULL_DAY` pilot contracts, half-day/overnight/stationary activation — later PRs.

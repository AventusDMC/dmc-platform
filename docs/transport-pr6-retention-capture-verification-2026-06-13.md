# PR 6 — Per-Day Retention Capture: Verification (metadata-only, non-live-affecting)

**Date:** 2026-06-13
**Branch:** `transport-contract-regime-pr6` (from current `origin/main`)
**Migration:** `20260613140000_add_quote_day_transport_retention`

PR 6 adds **additive, nullable, metadata-only** transport day-classification fields to
`QuoteItineraryDay` and teaches the PR 5 shadow path to read them. NULL everywhere =
identical to today. **No live pricing, quote total, supplier/method, or UI change.**

## Schema (additive, nullable — like `QuoteItineraryDay.country`)
```
QuoteItineraryDay {
  transportDayType  String?   // validated vs OperationalTransportType TS const; NULL = infer
  vehicleRetained   Boolean?
  vehicleReleased   Boolean?
  inRetainedBlock   Boolean?
}
```
No DB enum; `transportDayType` validated in TS (`isValidOperationalType`). No backfill
(NULL is the correct default).

## Migration status (production-safe flow)
| Stage | Result |
|---|---|
| Recovery point | `quote_itinerary_days` = 399 rows (read-only snapshot) |
| Before deploy | 187 found; **only** `20260613140000_add_quote_day_transport_retention` pending; no divergence |
| Diff method | schema-to-schema (`origin/main` baseline → edited) → ONLY the 4 `ADD COLUMN`s (no drift) |
| Apply | `prisma migrate deploy` (never `migrate dev`) |
| After deploy | **"Database schema is up to date!"** (187 applied, 0 pending) |

## Behavior rules (shadow only)
- `transportDayType` set + valid → overrides inferred operational type; unset/invalid → current inference.
- `vehicleReleased = true` → released, weight 0.
- `vehicleRetained = true` → retained (counts per classifier rules).
- `inRetainedBlock = true` → retained block (counts per classifier rules).
- **Contradiction `vehicleRetained = true AND vehicleReleased = true`** → **manual-required /
  invalid**: all signals cleared, weight 0, `billedAs = manual-required`, flagged
  `metadataInvalid = true`, counted in `manualRequiredDays`. **Never auto-counted.**

## Tests
`package-eligibility-shadow.service.test.ts` — **16 tests, all passing** (8 PR 5 + 8 PR 6):
resolveDayInput contradiction & transportDayType override/invalid; NULL → inference
unchanged; transportDayType override counts; vehicleReleased → 0; vehicleRetained → counts;
inRetainedBlock → counts; contradiction → manual-required not counted. `nest build` passes.

## Sample shadow output with metadata (flag ON)
**3 P2P-item days, each `vehicleRetained=true`, PACKAGE contract (min 3):**
`eligibility.countedFullPackageDays=3`, `eligible=true`; `dayPlan[*].vehicleRetained=true`,
`packageDayWeight=1`, `billedAs='full-day'`.

**3 P2P days, each `vehicleRetained=true AND vehicleReleased=true` (contradiction):**
`eligibility.countedFullPackageDays=0`, `manualRequiredDays=3`, `eligible=false`;
`dayPlan[*].metadataInvalid=true`, `billedAs='manual-required'`.

**3 P2P days, `vehicleReleased=true`:** counted 0, `below-minimum`.

## Confirmation — no live behavior changed
- `quotes.service.ts` **byte-for-byte unchanged**; `calculateCreateOrUpdateQuoteItemServiceCost`
  / `recalculateQuoteTotals` untouched.
- New fields are read **only** by the shadow path; NULL on all existing rows → existing
  quotes behave exactly as before.
- **No pilot `PACKAGE_MIN_FULL_DAY` contract created** (verified: 0 PACKAGE contracts exist).
- No `DAILY_PACKAGE`, no min-day enforcement in live pricing, no supplier/method switching,
  no quote-builder UI change (PR 7), no overnight/stationary charging, no persistence beyond
  the additive columns themselves.

## Files
| File | Type |
|---|---|
| `apps/api/prisma/schema.prisma` | +4 nullable fields on QuoteItineraryDay |
| `apps/api/prisma/migrations/20260613140000_add_quote_day_transport_retention/migration.sql` | additive migration |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` | reads metadata + contradiction handling |
| `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` | +8 PR6 tests |
| `docs/transport-pr6-phase-plan-2026-06-13.md` | phase plan |
| `docs/transport-pr6-retention-capture-verification-2026-06-13.md` | this |

## Rollback
Fields are nullable/inert → reverting the PR removes the read code; the migration is
reversible (`DROP COLUMN`). No data rollback needed. Live pricing was never touched.

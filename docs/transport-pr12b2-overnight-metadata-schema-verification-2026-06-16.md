# PR 12B-2 — Additive overnight-metadata schema: Verification

**Date:** 2026-06-16
**Branch:** `transport-pr12b2-overnight-metadata-schema` (from `origin/main`)
**Scope:** add three additive, nullable, metadata-only columns. **No pricing behavior, no backfill,
no defaults, no NOT NULL, no FK.** Overnight/stationary stay blocked; flag OFF.

## Schema additions
- `Supplier.baseCity String?`
- `QuoteItineraryDay.overnightCity String?`
- `QuoteItineraryDay.vehicleReturnsToBase Boolean?`

## Migration `20260616120000_add_overnight_metadata`
```sql
ALTER TABLE "quote_itinerary_days" ADD COLUMN "overnightCity" TEXT, ADD COLUMN "vehicleReturnsToBase" BOOLEAN;
ALTER TABLE "suppliers" ADD COLUMN "baseCity" TEXT;
```
Generated via schema-to-schema diff (origin/main → current); contains **only** the three nullable
`ADD COLUMN`s. No NOT NULL, no defaults, no FK/Place/City relation, no backfill, no destructive change.

## Migration safety (production-safe flow)
| Stage | Result |
|---|---|
| `prisma validate` | valid |
| `migrate status` (before) | "Database schema is up to date!" (only `20260616120000_add_overnight_metadata` pending) |
| Recovery point | suppliers 24, quote_itinerary_days 427 |
| Diff review | exactly 3 nullable ADD COLUMN (2 days + 1 suppliers); no destructive/drift/unrelated change |
| Apply | `prisma migrate deploy` (never `migrate dev`) → applied |
| `migrate status` (after) | "Database schema is up to date!" (190 migrations) |
| `prisma generate` | ok |

## Post-migration checks
- Existing supplier loads with `baseCity = null`; existing day loads with `overnightCity = null`,
  `vehicleReturnsToBase = null`. ✓
- **No backfill:** 0 suppliers with `baseCity` set; 0 days with overnight metadata set. ✓
- All three fields nullable (no NOT NULL/default). ✓
- `nest build` passes.
- **No pricing/quote behavior changed** — read-only `computeQuotePackageLiveApply` on all four pilot
  test quotes returns identical deltas: Large A `0`, Large B `−2094`, Medium A `0`, Medium B `−1606.5`.
- `quotes.service.ts` untouched (empty diff vs origin/main).
- Overnight/stationary still blocked (no logic reads the new fields; PR 11A/11B blocks intact); flag OFF.

## Confirmations
- Three additive nullable columns only; no backfill/default/NOT NULL/FK.
- NULL = unknown/unset/manual-required (for PR 12C); nothing reads the fields yet.
- Production live-apply flag remains OFF; overnight/stationary remain blocked/warning-only.
- No code behavior / quote total / contract change.

## Rollback
`DROP COLUMN` the three columns (down migration) — data is nullable and unread, so removal is safe.
No data depends on them.

## Files
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260616120000_add_overnight_metadata/migration.sql`
- `docs/transport-pr12b-overnight-metadata-schema-plan-2026-06-16.md` (already on main) + this verification

## Out of scope (unchanged)
No admin/API capture (12B-3); no shadow calc (12C); no UI (12D); no validation (12E); no live apply
(12F); no PR 13; no production activation; quote-WIP stash + dana untouched; `proposal-v3-pdf-export.test.ts`
excluded.

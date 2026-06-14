# PR 10B — Persist Manual Route-vs-Package Selection (PLAN ONLY)

**Date:** 2026-06-13
**Status:** PLAN ONLY — no code. For approval.
**Goal:** Persist a planner's manual route-vs-package **selection** on the quote —
**metadata only, NOT applied to quote totals.** No live pricing change.

## 1. Recommended split (persistence only; apply is PR 11)
- **PR 10B-1:** schema/storage (additive nullable `Quote` fields) **+ save/clear API endpoint**
  (writes selection metadata only). No UI. *Isolates the migration.*
- **PR 10B-2:** UI select/save/clear controls in `PackagePricingPreview.tsx` (calls the endpoint).
- **PR 11 (later, explicit):** apply the selected option to quote totals.

Matches your preference: **PR 10B = persistence only** (across 10B-1 + 10B-2); nothing applied.

## 2. What gets persisted (metadata only — NEVER the package price)
- `selectedTransportPricingOption` — `'ROUTE_TRANSFER' | 'PACKAGE_MIN_FULL_DAY' | null` (UNSET).
- `selectedTransportContractId` — FK to `TransportContract`, set **only** when PACKAGE.
- `transportSelectionIsManual` — true when the planner overrode (e.g. picked an ineligible
  package, if allowed).
- `transportSelectionAt` — timestamp.
- `transportSelectionByUserId` — FK to `User` (optional, if easy).
- **Staleness = DERIVED, not stored:** at read, re-run the shadow and compare the saved
  selection (option + contractId + eligibility) to current state; flag `stale: true` if the
  saved PACKAGE is now ineligible / the contract changed / the supplier+class changed. (A
  stored "stale" boolean would itself go stale — derive instead.) Optionally store
  `transportSelectionCountedDays` as a snapshot to sharpen drift detection.
- **Explicitly NOT stored:** any package price as the live quote price; no `totalCost`/quote-total write.

## 3. Where to store — recommend Quote-level additive nullable fields
| Option | Verdict |
|---|---|
| **Quote-level additive nullable fields** | **Recommended** — one selection per quote; matches the additive-nullable precedent (`vehicleClass`, day retention); no join; safe (existing reads unaffected). |
| Separate `QuoteTransportPricingSelection` (1:1) | Cleaner isolation but over-infra for ~5 scalars + a join; mention only. |
| QuoteItem-level | Rejected — selection is quote-level, not per item. |
| Quote transport settings table | Only if we later accumulate many transport settings; premature now. |

`Quote` model exists (no transport-selection fields yet) → 5 additive nullable columns + one
migration (PR 10B-1). `selectedTransportContractId` FK `onDelete: SetNull` (deleting the
pilot contract clears the selection cleanly).

## 4. UI behavior (PR 10B-2, in `PackagePricingPreview.tsx`)
- Show the **route/current option** and **package candidate option** side by side (PR 10A
  data) + a **recommended label only** (cheapest *eligible* — label, never auto-selected).
- Add **Select route** / **Select package** + **Clear selection** controls (save via the new
  endpoint). **No apply button.**
- Always show **"Saved selection: X — NOT APPLIED to totals."** + a **stale** badge when the
  derived staleness says so.
- No automatic cheapest selection; planner chooses explicitly.

## 5. API behavior (PR 10B-1)
- New endpoint **`PATCH /transport-pricing/quotes/:id/package-selection`** (`@Roles('admin','finance')`,
  flag-gated). Body: `{ option: 'ROUTE_TRANSFER' | 'PACKAGE_MIN_FULL_DAY' | null, manualOverride?: boolean }`.
- Service method (in `transport-pricing.service` / shadow service) that **writes only the
  selection fields** via a targeted `prisma.quote.update`. **Never** calls
  `recalculateQuoteTotals` / `calculateCreateOrUpdateQuoteItemServiceCost`; **never** touches
  quote items, totals, supplier, or method. `quotes.service.ts` stays untouched.
- Returns the saved selection + derived staleness. Flag OFF → endpoint rejects (403/disabled).
- New admin-web proxy `PATCH /api/transport-pricing/quotes/:id/package-selection` (forwards).

## 6. Validation rules
- `option` ∈ `{ROUTE_TRANSFER, PACKAGE_MIN_FULL_DAY, null}`.
- **PACKAGE** requires a resolvable `PACKAGE_MIN_FULL_DAY` contract for the quote's primary
  supplier+vehicleClass(+currency) — else reject `no-package-contract`. The resolved contract
  id is stored in `selectedTransportContractId` (guaranteeing it belongs to the quote's
  supplier/class/currency).
- **Ineligible PACKAGE** (below minimum etc.) → **blocked by default**; allowed only with
  `manualOverride: true` → stored `transportSelectionIsManual = true` (documented override).
- **ROUTE** always selectable.
- **Clear** (`option: null`) → unset all selection fields.
- Staleness derived at read (not a write-time gate).

## 7. Feature flag — `transport.packageOptionSelection` (default OFF)
- API env `TRANSPORT_PACKAGE_OPTION_SELECTION` + UI `NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTION_SELECTION`.
- OFF → no selection UI; the save endpoint rejects.
- ON → selection can be saved; **still not applied to totals**.
- Independent of the PR 9 (`packagePricingShadowCompare`) and PR 10A
  (`packageOptionsPreview`) flags.

## 8. Tests
- Flag OFF → selection UI hidden; **save endpoint blocked**.
- Flag ON → save allowed.
- Select PACKAGE → persists only metadata (option + contractId + manual + at/by); **no
  quote-item / total write** (assert the `quote.update` payload contains only selection keys).
- Select ROUTE → persists only metadata.
- Clear → unsets all fields.
- Invalid package contract → rejected; ineligible PACKAGE → blocked unless `manualOverride`.
- **Quote totals unchanged**, **quote items unchanged**, **pricing method unchanged** after save.
- No live package pricing activation.
- Source-grep: UI controls present, "NOT APPLIED to totals" shown, no apply button; PR 7/10A
  fragments preserved.

## 9. Quote-WIP stash / conflict risk
- **PR 10B touches:** `schema.prisma` (Quote), a migration, `transport-pricing.service.ts` +
  `transport-pricing.controller.ts` + `transport-feature-flags.ts`, a new admin-web proxy,
  `PackagePricingPreview.tsx` (PR 10A's component), tests, docs.
- **Does NOT touch** `QuoteServicePlanner.tsx`, `QuoteItemCard.tsx`,
  `excursion-origin-display.ts/.test.ts` (the stash files) — and **not** `quotes.service.ts`.
- **No stash conflict.** The quote-WIP stash **remains untouched** (not restored, not dropped).
  PR 10B-2's UI stays inside `PackagePricingPreview.tsx` + a new endpoint/proxy only.

## 10. Unrelated working-tree file
`apps/api/src/quotes/proposal-v3-pdf-export.test.ts` (linter auto-fix) is **still present**
(uncommitted). It will be **kept out of PR 10B**: branch from `origin/main`, never stage it,
commit only PR 10B files. Not reverted/stashed without your approval.

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Accidental recalc/total change on save | Targeted `prisma.quote.update` of only selection fields; never call quotes.service pricing/recalc; test asserts payload keys |
| Quote schema migration on shared DB | Additive nullable only; isolated in PR 10B-1; `migrate deploy`; recovery point + status checks |
| Selected contract deleted later | FK `onDelete: SetNull` → selection clears safely |
| Stale selection misleads | Staleness derived at read + shown as a badge |
| Stash conflict | Avoid stash files entirely (PR 10B uses PackagePricingPreview + new endpoint) |
| proposal-v3 file leakage | Never stage it; commit only PR 10B files |

## Acceptance criteria
- Selection persists as **metadata only**; **no quote total / item / method change**; no apply.
- Flag OFF = no UI + endpoint blocked; Flag ON = save only (not applied).
- `quotes.service.ts` untouched; stash files untouched; `proposal-v3` excluded.
- Migration additive nullable; `migrate status` clean; tests pass; builds pass.

## Open decisions for you
1. Confirm the **split** (PR 10B-1 schema+endpoint, then PR 10B-2 UI; PR 11 apply).
2. Confirm **Quote-level additive nullable fields** (vs a separate selection table).
3. Confirm **allowing a manual override** to select an ineligible package (stored
   `transportSelectionIsManual`) vs hard-blocking ineligible selections entirely.

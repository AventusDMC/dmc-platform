# PR 11B-3D-ii — Medium 30 controlled flag-ON validation REPORT

**Date:** 2026-06-16
**Outcome:** PASSED. Controlled flag-ON apply executed only on the two Medium DRAFT/TEST quotes and
fully reversed in the same run. Production flag remains OFF.

Accompanies the plan: `docs/transport-pr11b3dii-medium-flag-on-validation-plan-2026-06-16.md`.

## 1. Exact two Medium test quote IDs
- **Scenario A:** `84ba04f5-0127-4f13-8ac2-07d2b2cc7503` — `TEST — Alpha Medium Bus Package Pilot — DO NOT USE`
- **Scenario B:** `caf51d18-c8d9-45cf-932a-6251d5e8540c` — `TEST — Alpha Medium Bus Package Pilot P2P — DO NOT USE`

Contract `eabd43a0-2374-49d7-aaba-959df4d7c8bd`; allowed vehicle Medium 30 `da68f987-…`.

## 2. Preflight (read-only; all passed; abort-on-mismatch before any flag/recompute)
| Check | Scenario A | Scenario B |
|---|---|---|
| status DRAFT | ✓ | ✓ |
| title prefix `TEST — Alpha Medium Bus Package Pilot` | ✓ | ✓ |
| quoteCurrency USD | ✓ | ✓ |
| selectedTransportPricingOption PACKAGE_MIN_FULL_DAY | ✓ | ✓ |
| selectedTransportContractId = `eabd43a0-…` | ✓ | ✓ |
| selectionStale = false | ✓ | ✓ |
| allowlist.allowed = true | ✓ | ✓ |
| resolved/allowed vehicle = `[da68f987-…]` (Medium 30) | ✓ | ✓ |
| Large VVIP 29 not used | ✓ | ✓ |
| shadow difference | 0 | −1606.5 |

## 3. Scenario A — before / flag-ON / flag-OFF (cost / sell)
| Phase | totalCost / totalSell |
|---|---|
| Before | 1641.75 / 1641.75 |
| Flag ON | **1641.75 / 1641.75** (delta 0 — package net = discounted daily card) |
| Flag OFF (restore) | 1641.75 / 1641.75 |

## 4. Scenario B — before / flag-ON / flag-OFF (cost / sell)
| Phase | totalCost / totalSell |
|---|---|
| Before | 3102.75 / 3102.75 |
| Flag ON | **1496.25 / 1496.25** (cost delta −1606.5, sell delta −1606.5 at 0% markup) |
| Flag OFF (restore) | 3102.75 / 3102.75 |

## 5. QuoteItem count and item-sum before/after (no mutation)
| Quote | Before | After |
|---|---|---|
| Scenario A | count 5, sumCost 1641.75, sumSell 1641.75 | count 5, sumCost 1641.75, sumSell 1641.75 |
| Scenario B | count 5, sumCost 3102.75, sumSell 3102.75 | count 5, sumCost 3102.75, sumSell 3102.75 |

Identical → **no QuoteItem rows mutated** (the delta is applied only at total assembly; the only DB
writes were `quote.update` totals on the two test quotes, applied in Phase 1 and restored in Phase 2).

## 6. No real quotes touched
The script iterated a hard-coded 2-id list (never a broad query) and asserted DRAFT + the
`TEST — Alpha Medium Bus Package Pilot` title prefix before any recompute. Only `84ba04f5-…` and
`caf51d18-…` were recomputed.

## 7. CONFIRMED Exodus quote untouched
`74ee023b-bfcc-44e7-b995-363a64b8b0d6` remains `status CONFIRMED`, `selectedTransportPricingOption =
null` — never read into the recompute set, never modified.

## 8. Production / global env not changed
`TRANSPORT_PACKAGE_PRICING_LIVE_APPLY='true'` existed only inside the throwaway script process for
Phase 1, then was unset for Phase 2. Confirmed **absent from every `.env`**; no Railway/Vercel/global/
settings change.

## 9. Final DB state = baseline totals
Post-run read-only check: Scenario A `1641.75 / 1641.75`, Scenario B `3102.75 / 3102.75`, both DRAFT,
PACKAGE selection saved (Medium contract), not applied. Restoration verified within the same run
(Phase 2 in a `finally`).

## 10. Production live-apply flag remains OFF
`transport.packagePricingLiveApply` is unset everywhere → live apply does not run for any quote.

## 11. Conclusion
Medium 30 package live apply is **validated end-to-end for the allowlisted Medium contract + Medium 30
vehicle only**, and remains **gated by the `transport.packagePricingLiveApply` flag (default OFF)**:
- delta 0 case (package == discounted daily card) → no unintended movement;
- retained-P2P case → correct −1606.50 apply;
- VVIP / non-allowlisted vehicle blocked; never mutates quote items; reverts exactly when the flag
  goes OFF.

Both pilots (Large 49 + Medium 30) are now validated. Enabling live apply for real quotes — and any
broadening beyond these two allowlisted contract+vehicle combos — remains a separate, explicitly-
approved future step. PR 12 / PR 13 have not started.

## Test fixtures (preserved at baseline)
- `84ba04f5-…` (Scenario A, delta 0)
- `caf51d18-…` (Scenario B, delta −1606.50)

## Note (build provenance)
Per PR 11B-3D-i, the test quotes' day rows/links/metadata were created via plain prisma (Railway was
dropping the audit-logged `createDay` interactive `$transaction`); transport item **pricing** is
engine-correct (`QuotesService.createItem`). This flag-ON run only calls `recalculateQuoteTotals`
(a single `quote.update`, no interactive `$transaction`), so that flakiness did not apply here.

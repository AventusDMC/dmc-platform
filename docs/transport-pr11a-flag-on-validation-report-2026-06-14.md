# PR 11A — Controlled flag-ON validation REPORT

**Date:** 2026-06-14
**Outcome:** PASSED. First real live-apply, executed only on two throwaway DRAFT/TEST quotes and
fully reversed in the same run. Production flag remains OFF.

This record accompanies the plan: `docs/transport-pr11a-flag-on-validation-plan-2026-06-14.md`.

## 1. Exact two test quote IDs
- **Scenario A:** `04f87127-f30c-4489-99d5-bddd3ab3adbd` — `TEST — Alpha Large Bus Package Pilot — DO NOT USE`
- **Scenario B:** `714ac0d8-5ade-41be-9f6d-1b3f7ab55b79` — `TEST — Alpha Large Bus Package Pilot P2P — DO NOT USE`

Both pinned to pilot contract `66f5de06-28df-426c-90b8-ffaa01ed5c5f` (Alpha Large 49 USD).

## 2. Preflight checks (read-only; all passed; abort-on-mismatch before any flag/recompute)
| Check | Scenario A | Scenario B |
|---|---|---|
| status DRAFT | ✓ | ✓ |
| title prefix `TEST — Alpha Large Bus Package Pilot` | ✓ | ✓ |
| quoteCurrency USD | ✓ | ✓ |
| selectedTransportPricingOption PACKAGE_MIN_FULL_DAY | ✓ | ✓ |
| selectedTransportContractId = pilot | ✓ | ✓ |
| shadow selectionStale = false | ✓ | ✓ |
| shadow difference | 0 | −2094 |

## 3. Scenario A — before / flag-ON / flag-OFF totals (cost / sell)
| Phase | totalCost / totalSell |
|---|---|
| Before | 2031 / 2031 |
| Flag ON (recompute) | **2031 / 2031** (delta 0 — package net = discounted daily-card baseline) |
| Flag OFF (restore recompute) | 2031 / 2031 |

## 4. Scenario B — before / flag-ON / flag-OFF totals (cost / sell)
| Phase | totalCost / totalSell |
|---|---|
| Before | 3892.50 / 3892.50 |
| Flag ON (recompute) | **1798.50 / 1798.50** (cost delta −2094, sell delta −2094 at 0% markup) |
| Flag OFF (restore recompute) | 3892.50 / 3892.50 |

## 5. QuoteItem count and item-sum before/after (no mutation)
| Quote | Before | After |
|---|---|---|
| Scenario A | count 5, sumCost 2031, sumSell 2031 | count 5, sumCost 2031, sumSell 2031 |
| Scenario B | count 5, sumCost 3892.5, sumSell 3892.5 | count 5, sumCost 3892.5, sumSell 3892.5 |

Identical → **no QuoteItem rows mutated** (PR 11A applies the delta only at total-assembly time;
the only DB writes were `quote.update` totals on the two test quotes, applied in Phase 1 and
restored in Phase 2).

## 6. No real quotes touched
The script iterated a hard-coded 2-id list (never a broad query) and asserted DRAFT + the
`TEST — Alpha Large Bus Package Pilot` title prefix before any recompute. Only `04f87127-…` and
`714ac0d8-…` were recomputed.

## 7. Production / global env not changed
`TRANSPORT_PACKAGE_PRICING_LIVE_APPLY='true'` existed only inside the throwaway script process for
Phase 1, then was unset for Phase 2. Confirmed **absent from every `.env`**; no Railway/Vercel/
global/settings change. Nothing persisted after the process exited.

## 8. Final DB state = baseline totals
Post-run read-only check: Scenario A `2031 / 2031`, Scenario B `3892.50 / 3892.50`, both DRAFT,
PACKAGE selection saved (pilot contract), not applied. Restoration verified within the same run
(Phase 2 in a `finally`).

## 9. Live flag remains OFF by default
`isPackagePricingLiveApplyEnabled()` reads `TRANSPORT_PACKAGE_PRICING_LIVE_APPLY` (truthy-only),
unset everywhere in production → live apply does not run for any quote.

## 10. Conclusion
PR 11A live apply is **validated end-to-end for the pilot contract only**, and remains **gated by
the `transport.packagePricingLiveApply` flag (default OFF)**:
- delta 0 case (package == discounted daily card) → no unintended movement;
- retained-P2P saving case → correct −2094 apply;
- never mutates quote items; reverts exactly when the flag goes OFF.

Enabling live apply for real quotes (and any broadening beyond the single pilot contract) remains a
separate, explicitly-approved future step. PR 11B / PR 12 / PR 13 have **not** started.

## Test fixtures (preserved)
Both throwaway quotes are intentionally kept at baseline totals with PACKAGE selection saved, for
any future controlled flag-ON re-validation:
- `04f87127-…` (Scenario A, delta 0)
- `714ac0d8-…` (Scenario B, delta −2094)

# PR 11B-2A — Vehicle-aware allowlist DIAGNOSTICS: Verification

**Date:** 2026-06-14
**Branch:** `transport-pr11b2a-vehicle-allowlist-diagnostics` (from `origin/main`)
**Scope:** read-only allowlist decision added to the package-pricing-shadow output. **Live apply
unchanged; no enforcement; no totals/DB/flag/schema changes.**

## What changed (additive, diagnostic-only)
- `package-eligibility-shadow.service.ts`:
  - `PACKAGE_VEHICLE_ALLOWLIST` (in-code constant): `{ '66f5de06-28df-426c-90b8-ffaa01ed5c5f':
    ['6d575442-05fd-4cf6-bd22-5e8a0ee12303'] }` — pilot contract → Alpha **Large 49** only.
  - `computePackageAllowlistDecision(...)` (pure, read-only) → `{ allowed, reason, contractId,
    resolvedVehicleIds, allowedVehicleIds, vehicleNames, blockers }`.
  - `evaluateQuotePackagePricingShadow` now resolves the **counted-day** transport vehicle(s) and
    returns an additive `allowlist` block. The day query was extended to select `vehicle.id` +
    `vehicle.name`. **`computeQuotePackageLiveApply` is byte-for-byte unchanged.**
- `package-eligibility-shadow.service.test.ts`: +11 tests.
- `quotes.service.ts`: **untouched** (verified empty diff vs origin/main).

**Full allow-listed vehicle id:** `6d575442-05fd-4cf6-bd22-5e8a0ee12303` (Alpha standard "Large 49").

## Allowlist decision — reasons / blockers
`allowed` · `not-allowlisted-contract` · `vehicle-not-allowlisted` · `vip-or-grand-star-not-allowed`
(added when a non-allowlisted vehicle name matches VIP/VVIP/Grand Star) · `missing-vehicle-id` ·
`mixed-vehicles` · `mixed-suppliers` · `cross-currency`. `reason` = first blocker (or `allowed`);
`blockers` = full list.

## Tests (65 pass; +11 PR11B-2A)
Pure helper: pilot+Large49 → allowed · pilot+VIP → vehicle-not-allowlisted + vip-or-grand-star ·
pilot+Grand Star → same · non-allowlisted contract → not-allowlisted-contract · missing vehicle id →
missing-vehicle-id · mixed vehicles → mixed-vehicles · mixed suppliers → mixed-suppliers ·
cross-currency → cross-currency · constant pins pilot→Large 49.
Integration (shadow): response includes the `allowlist` block — Large 49 → `allowed`; VIP 31‑33 →
blocked with conflation surfaced; in both, `packageEligible`/`notApplied` are unchanged (shadow
numbers and live behavior unaffected).
Parity: full shadow suite (PR9/PR10B-2/PR11A) still green; `quote-package-live-apply.test.ts` 3/3
(live apply identical to PR 11A). `nest build` passes.

## Sample shadow `allowlist` block
Allowed (Large 49):
```json
{ "allowed": true, "reason": "allowed",
  "contractId": "66f5de06-28df-426c-90b8-ffaa01ed5c5f",
  "resolvedVehicleIds": ["6d575442-05fd-4cf6-bd22-5e8a0ee12303"],
  "allowedVehicleIds": ["6d575442-05fd-4cf6-bd22-5e8a0ee12303"],
  "vehicleNames": ["Large 49"], "blockers": [] }
```
Blocked (VIP 31‑33 — conflation surfaced):
```json
{ "allowed": false, "reason": "vehicle-not-allowlisted",
  "contractId": "66f5de06-28df-426c-90b8-ffaa01ed5c5f",
  "resolvedVehicleIds": ["49c5fd5d-6abe-4633-a859-53cb35a04a07"],
  "allowedVehicleIds": ["6d575442-05fd-4cf6-bd22-5e8a0ee12303"],
  "vehicleNames": ["Large VIP 31-33"],
  "blockers": ["vehicle-not-allowlisted", "vip-or-grand-star-not-allowed"] }
```

## Confirmations
- **No live behavior change** — `computeQuotePackageLiveApply` unchanged; PR 11A test set + the
  recalc-wiring tests pass identically. The allowlist is **not** consulted by live apply in 11B-2A.
- **No quote total changes, no DB writes** — the shadow path is read-only (the only new DB read is a
  `quote.findUnique` for `quoteCurrency`, optional-chained so existing fakes are unaffected).
- **No QuoteItem mutation; no flag/schema/migration/contract changes.** Read flag
  `transport.packagePricingShadowCompare` gates the diagnostic (default OFF); live-apply flag
  `transport.packagePricingLiveApply` stays OFF.
- **VIP/standard conflation surfaced clearly** — a VIP/Grand Star quote under the pilot contract now
  reports `allowed: false` with `vehicle-not-allowlisted` + `vip-or-grand-star-not-allowed`,
  proving the gate PR 11B-2B will enforce.

## Out of scope (unchanged)
No enforcement (PR 11B-2B), no new contracts (PR 11B-3), no PR 12/13, no production activation;
quote-WIP stash + dana untouched; `proposal-v3-pdf-export.test.ts` excluded.

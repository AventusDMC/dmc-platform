# ERP V2 — Product/Catalog V2 + Hotels Capability Review

Read-only capability review of what exists today in V2 for Products/Catalog and
Hotels, with a recommended next complete-ERP build slice. No code, no behavior
change.

---

## 1. Products/Catalog V2 — current state

- **Read-only aggregator only** — no create/update/delete anywhere.
- Single backend route **`GET /catalog/v2/summary`** (`apps/api/src/catalog/catalog.controller.ts:18`); `getV2Summary` does only `findMany`/`count` and writes nothing.
- Returns a **supplier roster** (service/contract/rate counts, currencies, operationally-active), **service/contract/rate counts** (services/activities/guides/restaurants), a **hotel-contract list** (validity window, currency, confidence), and a **readiness / data-quality warnings** system (`MISSING_RATES`, `EXPIRED_CONTRACT`, `EXPIRING_SOON`, `UNVERIFIED_HOTEL_CONTRACT`, `CURRENCY_MISMATCH`, `MISSING_EMAIL`, `NO_ACTIVE_SERVICES`, `MISSING_BASE_CITY`).
- UI is filter-only (search / type / severity) — no forms, no buttons, no writes.
- **Role gating:** explicit allowlist **admin / operations / super_admin / finance** (agent / viewer / agent_admin blocked); two fail-closed flags `CATALOG_V2_ENABLED` (API) + `NEXT_PUBLIC_CATALOG_V2` (FE), both default OFF.
- **Pricing redaction:** rate/base-cost figures redacted for non-pricing roles.

## 2. Hotels V2 — current state

- **Read-only Hotels step** in Quote Builder V2 (`components/quote/v2/steps/hotels-step.tsx`).
- Per-city row shows a **contract badge** (contracted / on-request / no-contract), **meal plan**, **rooming summary**, **city tax**, **rate / room / night**, and hotel category.
- Collapsible **diagnostics / "Why?"** section explaining contract state.
- **Set-primary** display toggle where a city has 2+ options (no re-price).
- **Flag-gated preview / apply** (`NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_PREVIEW/_APPLY` + backend `QUOTE_PRICING_HOTEL_PREVIEW/_APPLY`; apply requires preview).
- **Apply only for the one matched priced hotel line.**
- **Ambiguous multi-line matches still resolve in Classic** (apply hidden with a note).
- **No hotel authoring in V2** — all contract/rate/room-category/allotment/supplement/promotion editing is Classic.

## 3. Quote Builder V2 — item matrix

| Item type | Create | Preview | Apply |
|---|---|---|---|
| Activity | ✅ | ✅ | ✅ |
| Guide | ✅ | ✅ | ✅ |
| Meal | ❌ | ✅ | ✅ |
| Entrance / Jordan Pass | ❌ | ✅ | ✅ |
| Hotel | ❌ | ✅ | ✅ (single matched line) |
| External package | ❌ | ✅ | ✅ |
| Transport | ❌ | ✅ | ⚠️ single-leg transfer beta only (Phase T-A) |

V2 never forks pricing — it reuses Classic `createItem`/`updateItem` + recalc behind signed preview-token guards. Only Activity + Guide are first-class (create + preview + apply); apply re-prices the already-selected item in place and never changes service/selection/pax/date. Everything is fail-closed behind default-OFF flags.

## 4. Ops V2 — current state

- **Read-only operational board**, organized by 5 operational phases (not by day); each service row shows a serviceType icon, description, day label, supplier (or "Unassigned"), and Confirmation / Voucher / Status badges.
- **Supplier assignment / confirmation behind flags** (`NEXT_PUBLIC_OPS_V2_SUPPLIER_ASSIGN`, `..._CONFIRM_STATUS`).
- **Vouchers / packets preview / generate behind controls** (default-disabled "Coming later"); packets panel is "Preview · read-only".
- **Hotel details mostly in the voucher-preview VM, not the board** (checkIn/out/nights/mealPlan/occupancy surface only in the voucher preview).
- **serviceType / operationType display gaps:** no `operationType` dimension anywhere; unknown serviceTypes fall back silently (`CircleDot` icon / `'SERVICE'` label / neutral status). A read-only invariant test allows exactly 4 sanctioned mutations.

## 5. Classic-only gaps

- Catalog / product / supplier / service / rate **CRUD**.
- Hotel **contracts / rates / room categories / allotments / supplements / promotions** (+ contract-health/correction).
- Transport **tariffs / rate cards / pricing rules**.
- **Package / excursion templates.**
- **Meal / hotel / transport / entrance / external-package create** (only activity/guide can be created in V2).
- **Pax / quantity changes.**
- **Delete / service swaps.**
- **Full finance/catalog write dependency** — V2 has zero catalog-editing routes; all authoring is Classic, surfaced via "Edit in Classic" links.

## 6. Biggest blockers for complete ERP

1. **V2 cannot author catalog/hotel data** — every rate/contract/supplier/product change forces a Classic context-switch (largest gap, highest blast radius).
2. **Hotel review is incomplete in V2** — diagnostics only, no contract/rate detail.
3. **Narrow item-create coverage** — only Activity + Guide.
4. **Transport apply still narrow** — single-leg transfers only.
5. **Ops display gaps** — no operationType; silent fallbacks for unknown serviceTypes.
6. **Hotel-apply flag drift** — apply ON in prod, historically OFF/absent in staging.

## 7. Recommended safest next slice — Option B: Hotel contract/rate read-only detail in V2

A read-only hotel contract/rate summary surfaced in the V2 Hotels step (a "View
contract" affordance), mirroring the VV-3 version-summary pattern:

- **Role-gated.**
- **Actor-scoped** (resolve with the actor first).
- **Whitelist-curated** (never spread the raw contract/rate rows).
- **Cost / supplier-rate fields gated to finance-visible roles** (`admin / super_admin / finance`); omitted for others.
- **No writes.**
- **No pricing changes.**
- **No flags flipped.**
- **No production action.**

Safest because it is read-only, reuses the exact cost-redaction + whitelist-summary
infrastructure already built, and removes the biggest day-to-day Classic dependency
(hotel review) without touching pricing, writes, or behavior-flipping flags. It also
lays the groundwork for later safe hotel apply/authoring.

## 8. Recommended next 5 slices

1. **Hotel contract/rate read-only detail in V2** (redacted, cost-gated, actor-scoped).
2. **Ops V2 display-gap closure** (read-only): curated serviceType label table +
   operationType awareness + surface hotel voucher-detail fields on the board
   (preserving the read-only invariant).
3. **Hotel-apply flag reconciliation + ambiguous-match hardening** — align staging/
   prod `QUOTE_PRICING_HOTEL_APPLY`; resolve the multi-priced-line case so apply
   covers more hotels (reuses the existing apply engine; no new pricing math).
4. **Meal create** — first new V2 create item type after activity/guide; flag-gated,
   reuses `createItem`.
5. **Entrance / External-package create, or Transport apply Phase T-B** — extend
   create coverage or broaden transport apply beyond single-leg (higher pricing risk;
   do last, with staging validation).

## 9. Risks

- **Catalog edits have high blast radius** — a rate change re-prices many quotes;
  defer authoring until read-only detail + a validation harness mature.
- **Supplier cost/rate exposure risk** — any hotel contract/rate detail must be
  finance-gated and PII-free; reuse the exact redaction contract + whitelist
  extraction.
- **Hotel-apply flag drift** (staging ≠ prod) — a latent correctness bug; reconcile
  before broadening apply.
- **Ops read-only invariant must be preserved** — curated labels are display-only;
  no new mutations.
- **Whitelist drift** for any new summary endpoint.
- **Stale snapshot vs live contract distinction** — label surfaced contract data
  "as of" / live so users know what they are seeing.

## 10. GO / NO-GO

**GO**

- Plan **Hotel contract/rate read-only detail** (Option B).
- Continue the read-only-first, per-type, fail-closed-flag build pattern.

**NO-GO**

- Catalog / supplier / hotel / rate **edit** in V2 now.
- Broad hotel / transport apply expansion before flag reconciliation.
- Exposing supplier cost/rates to non-finance roles.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Supplier send / voucher-send.
- Full no-Classic launch.

---

*Read-only review. No code, no data, no flag/env, no production or staging behavior
change. Classic remains the system of record.*

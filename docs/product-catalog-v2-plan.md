# Product Catalog V2 — Read-Only Review Plan

**Status:** Planning only. No code, schema, migration, flag, or environment change
accompanies this document.
**Scope:** A flag-gated, **read-only** Product Catalog for Operations — suppliers, service
catalog, rates/contracts, validity, currencies, and data-quality warnings — reusing existing
Classic endpoints plus one thin read-only aggregator. **No create / edit / delete, no pricing
writes, no contract mutations, no supplier packet/send/email/allowlist work.** No production
enablement. Classic remains fallback/reference only.

---

## 0. Decisions locked for Product Catalog V2

1. **Backend approach — thin read-only aggregator.**
   - Planned route: `GET /catalog/v2/summary`.
   - Backend flag: `CATALOG_V2_ENABLED`, **default OFF / fail-closed** (checked first).
   - The aggregator computes server-side data-quality warnings and avoids the N+1 supplier
     resolution. **No writes.**

2. **Role redaction.**
   - **admin / operations / super_admin:** full read, including pricing/rates.
   - **finance:** pricing/rates visible.
   - **agent / viewer / agent_admin:** catalog structure, validity, and non-financial
     warnings visible; **pricing/rate figures hidden/redacted**.

3. **Scope remains read-only** — no create, no edit, no delete, no pricing writes, no contract
   mutations, no supplier packet work, no supplier send/email/allowlist changes. Classic
   remains fallback/reference only; all edits are Classic deep links.

---

## 1. Existing Classic data model (what we build on)

- **`Supplier`** (`suppliers`): `id, name, type` (free string: hotel/transport/activity/
  guide/other), `email?, phone?, notes?, transportDiscountPercent, baseCity?, createdAt,
  updatedAt`. Relations include `transportContracts`, `vehicleRates`, `vouchers`,
  `voucherPackets`, `bookingServices`. **No `active` flag, no currency, and no
  destination/city/country** (only `baseCity`, transport-only). `email` is a single optional
  string.
- **Service catalog:** `SupplierService` (`supplier_services`: name, category, unitType,
  baseCost, `currency` default USD, tax/fee fields) → `ServiceRate` (per-service,
  `costCurrency`, `pricingMode`, **no validFrom/validTo — rates are not time-scoped**);
  `ServiceType` (`name, code, isActive`); `TransportServiceType` (classification enum,
  `isActive`); `Activity` (`city, region, active, costPrice/sellPrice`, `ActivityRateVariant`
  with currency); `Guide` (`active, languages, email?`); `Restaurant` (`active, city, email?`).
- **Rates / contracts / validity:** `HotelContract` (`hotelId`, `validFrom/validTo` required,
  `currency`, `confidence` enum; rates via `HotelRate` with `seasonFrom/seasonTo`, `currency`);
  `TransportContract` (`supplierId, vehicleClass, regime, currency, validFrom/validTo?`
  nullable, **`active` boolean**); `ContractImport` (staging). **Expiry is not stored** — it is
  derivable from `validTo` vs today.
- **Currency** lives per-entity (contract, rate, service, activity variant); USD default with
  JOD for tickets/entrance. **No supplier-level currency.**

## 2. Backend routes we can reuse (all read-only GETs today)

- `GET /suppliers` (unfiltered array); `GET /services`, `/services/:id`, `/services/:id/rates`;
  `GET /service-types` (supports `search` + `active`); `GET /transport-service-types`;
  `GET /activities`, `/activities/:id`; `GET /guides`; `GET /restaurants`.
- `GET /hotels/directory-summary`, `/hotels/room-categories-summary`,
  `/hotels/admin/engine-health` — a proven lightweight-summary + health-audit pattern to
  mirror.
- `GET /hotel-contracts`, `/:id`, and the **reusable data-quality engine**
  `GET /hotel-contract-health/dashboard`, `/correction-queue`, `/contracts/:id/validation`
  (already computes missing-meal-plans, suspicious-pricing, missing-occupancy,
  overlapping-seasons, missing-child-policy, imported-unverified).
- **Gap:** there is no health/validation endpoint for transport contracts or for
  supplier/service catalog completeness — those warnings are **computed read-only** by the new
  aggregator, not stored.

## 3. What V2 shows read-only first

A single **Product Catalog V2** page that joins, per supplier and per catalog entity:
profile → linked services → rates/contracts → validity → a data-quality/readiness summary. It
**reads and annotates only** — no create/edit/delete, no pricing writes, no contract
mutations. The data comes from the thin `GET /catalog/v2/summary` aggregator (Decision 1),
which fans out over the reusable GETs server-side and returns a lean, warning-annotated
payload.

## 4. Five separated concerns (sections, each read-only)

1. **Supplier profile** — name, `type`, contact (email/phone), `baseCity`, notes, counts of
   linked services/contracts.
2. **Service catalog** — services/activities/guides/restaurants attributable to the supplier
   (by `resolvedSupplierId` / `supplierId` / company), with `category` / `unitType` /
   `serviceType`.
3. **Rates & contracts** — `ServiceRate` / `ActivityRateVariant` figures + `HotelContract` /
   `TransportContract` with currency and rate basis.
4. **Validity** — contract `validFrom/validTo`, hotel-rate seasons, transport `active`;
   **derived** status: Active / Expiring-soon / Expired / No-validity-window.
5. **Operational readiness** — the data-quality roll-up (§6) telling Operations whether a
   supplier/service can be quoted, dispatched, and (later) packet-sent.

## 5. Filters / search (how each maps to real data)

| Filter | Source / derivation |
|---|---|
| **Supplier type** | `Supplier.type` (free string; normalize the 5 known values). |
| **Destination / city** | **No supplier-level city** → derived from linked `Activity.city/region`, `Restaurant.city/region`, hotel city; supplier-level destination is a **known gap** (annotated, not schema-solved now). |
| **Service type** | `ServiceType.name/code`, `TransportServiceType.classification`, entity kind (activity/guide/restaurant/hotel). |
| **Active / inactive** | `Activity/Guide/Restaurant.active`, `ServiceType.isActive`, `TransportContract.active`. **Supplier has no `active`** → derived "operationally active" = has ≥1 active service or a currently-valid contract (annotated derivation). |
| **Missing email** | `Supplier.email` null/blank (also flags Guide/Restaurant). |
| **Missing rates** | supplier/service with zero `ServiceRate` (or Activity with zero `rateVariants`). |
| **Expired contracts** | `HotelContract.validTo < today`, or `TransportContract.active && validTo < today`; nullable transport `validTo` → "no validity window". Computed read-only. |

Plus free-text search over name/email/city. Filtering is **display-only**; no writes.

## 6. Data-quality warnings (computed read-only; help Operations + packets)

Each derived warning carries a severity and a "why it matters":
- **Missing supplier email** → blocks later packet send.
- **Multiple emails in one field** → ambiguous recipient for later packet send.
- **Missing rates** → cannot be priced/quoted.
- **Expired / expiring-soon contract** (`validTo` past / within N days).
- **Unverified hotel contract** (`confidence != VERIFIED`) — reuse hotel-contract-health.
- **No active services** for an otherwise-listed supplier.
- **Currency mismatch** (contract currency vs its rate currency; services mixing USD/JOD).
- **Missing `baseCity`** for transport suppliers (affects driver-overnight evaluation).

The hotel slice reuses the hotel-contract-health sections; the rest are computed by the
aggregator. **All warnings are read-only computations — nothing is persisted.**

## 7. Roles

- **admin / operations / super_admin** → full read (structure + pricing + warnings). Mirrors
  `PII_FULL_ROLES` and the ops-V2 authorized set.
- **finance** → pricing/rates visible (aligns with `canAccessFinance = admin | super_admin |
  finance`), plus structure/validity/warnings.
- **agent / viewer / agent_admin** → catalog structure, validity, and non-financial warnings;
  **pricing/rate figures redacted** (same explicit per-field redaction the ops VMs use to mask
  cost/sell). Role is resolved server-side and drives both the aggregator's redaction and the
  VM.
- **Note:** the underlying `/suppliers`, `/services`, `/activities` GETs are currently
  **ungated**, so redaction is enforced in the V2 aggregator/view; see §11.

## 8. UI structure

Reuse the V2 read-only scaffold (flag gate → role gate → `adminPageFetchJson` loaders → pure
VM builders → render) and `WorkspaceShell` / `TableSectionShell`:
- **Header + summary strip:** counts (suppliers by type, services, contracts) and a **total
  warnings** KPI.
- **Filter / search bar** (§5).
- **Sections/tabs:** (a) **Suppliers** (profile + linked counts + readiness chip), (b)
  **Service Catalog** (services/activities/guides/restaurants + rates), (c) **Rates &
  Contracts** (validity windows, currency, expired/expiring badges), (d) **Data Quality**
  (aggregated warnings, filterable, each linking to the offending entity).
- Read-only **detail drawer** per supplier/entity. **No action buttons, no forms, no edit** —
  an "Open in Classic" deep link handles any edit.

## 9. Tests

- **Pure aggregator / warning builder:** one case per warning branch (missing email, multiple
  email, missing rates, expired/expiring, unverified, currency mismatch, no active services,
  missing baseCity) + the derived active/expired/validity computations; finance/PII-free where
  applicable.
- **VM / aggregator redaction:** agent/viewer/agent_admin → no cost/sell/rate figures;
  admin/operations/super_admin/finance → figures present.
- **Backend service (aggregator):** flag OFF → fail-closed (no data); read-only mutation traps
  prove no writes.
- **Page gates:** frontend flag OFF → `notFound()`; unauthorized role → `AdminForbiddenState`.
- **Proxy source-grep:** GET-only, no body/redirect.

## 10. Staging validation plan

- Enable the frontend flag **staging-only**; confirm production flags remain unset.
- Load the catalog; confirm summary counts and a spot-set of warnings match direct read-only
  DB reads (suppliers, services, contracts).
- Confirm **pricing is redacted** for an agent/viewer session and visible for
  admin/operations/finance.
- Confirm **read-only** (no writes/audit; GET-only path).
- Confirm production fail-closed and no allowlist / supplier-send interaction.

## 11. Risks & rollout flags

- **Rollout flags:** `NEXT_PUBLIC_CATALOG_V2` (frontend, **default OFF**) and
  `CATALOG_V2_ENABLED` (backend aggregator, **default OFF / fail-closed**). Staging-first;
  **no production enablement** in this initiative.
- **Data-model gaps (no schema now):** supplier lacks `active`, `destination/city/country`,
  and currency → these filters are **derived / annotated**, not added; flagged as future schema
  candidates only.
- **Pricing endpoints are ungated today** → V2 redaction is a view/aggregator-level control,
  not a hard API boundary; the pre-existing exposure is noted and a future gate on the
  aggregator is recommended.
- **No transport-contract health engine** and **expiry not stored** → computed read-only;
  handle nullable transport `validTo` explicitly.
- **Performance:** large catalogs use the summary pattern (mirroring
  `/hotels/directory-summary`) and pagination; mixed USD/JOD currencies are displayed with
  their currency and **never summed blindly**.
- **Scope discipline:** strictly read-only; any edit path is out of scope and deep-links to
  Classic.

---

## Summary

Product Catalog V2 **starts read-only**: a thin backend aggregator `GET /catalog/v2/summary`
(gated by `CATALOG_V2_ENABLED`, **default OFF / fail-closed**, no writes) fans out over
existing Classic GETs and **computes data-quality warnings read-only**, surfaced in a
flag-gated admin-web page (`NEXT_PUBLIC_CATALOG_V2`, **default OFF**). Supplier
city/destination/active/currency gaps are **derived or annotated, not solved with schema
now**. **Pricing/rates are redacted for agent/viewer/agent_admin and visible for
admin/operations/super_admin/finance.** Edits remain in Classic via deep links only. **No
supplier packet / send / allowlist changes; no production enablement.**

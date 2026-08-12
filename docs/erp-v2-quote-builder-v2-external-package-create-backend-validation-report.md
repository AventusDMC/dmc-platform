# ERP V2 — M-3a: Backend External Package Create — Staging Validation Report

**Status: PASS** · Controlled synthetic staging validation; the create path was validated live end-to-end via the existing V2 item-create API. No production access, no code, no PR implementation, no email/send. Classic remains the system of record.

## 1. Result

- Backend External Package create validated on staging.
- The existing V2 item-create API accepted `itemType: external_package`.
- Finance/admin preview + create passed.
- PER_PERSON create passed.
- PER_GROUP preview passed.
- Operations blocked (fail closed).
- agent_admin blocked (fail closed).
- Required-field validations passed.
- Token binding validated.
- Redaction / privacy clean.
- No voucher/packet side effect.
- No production access. No email/send.

## 2. Context

- **PR #841** (merged), staging commit `12c71d4b0e55182140e9d84fcb04db9449016814`.
- Backend routes exercised:
  - `POST /quotes/:id/v2/experiences/item/preview`
  - `POST /quotes/:id/v2/experiences/item`
- The existing guarded **preview → confirm → create** flow was reused.
- `createItem` / `recalculateQuoteTotals` unchanged.
- `resolveQuoteItemValues` pricing math unchanged.
- Classic remains the system of record.

## 3. Staging targeting

- Railway CLI, **project-ID-pinned**.
- The initially-linked target was **production**; it was re-linked away from production to:
  - project **`dmc-platform-staging`**
  - project ID **`26e31130-a684-448a-bb96-f0da7a0a60c9`**
  - service **`dmc-platform`**
- All work performed through the staging container (`railway ssh`; HTTP to `127.0.0.1:8080` with minted `v1.` session tokens via `Authorization: Bearer`).
- Production project **`cheerful-enthusiasm` / `60d81051…` excluded**.
- **Hard guard passed before any write:**
  - `RAILWAY_PROJECT_NAME = dmc-platform-staging`
  - `RAILWAY_PROJECT_ID = 26e31130-a684-448a-bb96-f0da7a0a60c9`
  - marker booking **BK-2026-0002 present**
  - session secret present
- The script aborts before any write if any guard fails.

## 4. Deployed commit

- `12c71d4b0e55182140e9d84fcb04db9449016814`
- Staging API `RAILWAY_GIT_COMMIT_SHA` matched the PR #841 merge commit.

## 5. Flags

- Staging `QUOTE_ITEM_CREATE = true` (read-only check).
- No flag changes.
- Production not accessed in this validation.
- Technical production item-create remains OFF per prior checks.

## 6. Fixture

- Quote: `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
- Title: `UAT-STAGING-M3A-EXTERNAL-PACKAGE-CREATE — DO NOT SEND`
- Status: DRAFT
- Adults: 2
- Itinerary day: `4b0d0d8a-105f-4ada-9cb2-095459e0877f`
- CompanyId: `00000000-…-0001` (derived from the marker booking's quote for FK validity)
- Not accepted. No version, invoice, booking, voucher, packet, or public link.

## 7. Finance preview result

- POST preview returned **201**.
- `itemType` external_package.
- netCost 100.
- currency USD.
- country Jordan.
- clientDescription `UAT-STAGING-M3A External Package`.
- pricingBasis PER_PERSON.
- packageName `UAT-STAGING-M3A Package`.
- `previewToken` returned.
- projected **cost 200**.
- projected **sell 240**.
- confirms **20% markup** (netCost 100 × 2 pax = 200 cost; ×1.20 = 240 sell).
- No write before create (item count unchanged by preview).

## 8. Finance create result

- POST create returned **201**.
- Created item: `4beecd88-569f-43d7-8854-79c2be60c9ef`.
- serviceId **null**.
- activityId **null**.
- externalNetCost 100.
- currency USD.
- externalPackageCountry Jordan.
- externalPackageName `UAT-STAGING-M3A Package`.
- externalClientDescription set.
- externalPricingBasis PER_PERSON.
- markupPercent **20**.
- baseCost 200.
- totalCost 200.
- totalSell 240.
- Day-linked to `4b0d0d8a-105f-4ada-9cb2-095459e0877f`.
- Shared `createItem` / recalc path confirmed.
- Quote totals moved to 200 / 240.
- No voucher/packet side effect.

## 9. PER_GROUP preview

- Preview returned **201**.
- Preview-only.
- projected **cost 100**.
- projected **sell 120**.
- Token bound to pricingBasis.
- No create performed.

## 10. Operations rejection

- Operations preview returned **403 `external_package_finance_only`**.
- Operations create returned **403 `external_package_finance_only`**.
- No item created.

## 11. agent_admin rejection

- agent_admin preview returned **403 `external_package_finance_only`**.
- agent_admin create returned **403 `external_package_finance_only`**.
- Confirms the service-level guard blocks agent_admin even though RolesGuard coalesces it into `@Roles('admin')` at the route.
- No item created.

## 12. Required-field validation

- Missing netCost returned **400 `missing_field`**.
- Missing currency returned **400 `missing_field`**.
- Missing country returned **400 `missing_field`**.
- Missing clientDescription returned **400 `missing_field`**.
- Negative netCost returned **400 `invalid_external_package_cost`**.
- Non-finite netCost returned **400 `invalid_external_package_cost`**.
- Invalid pricingBasis `PER_ROOM` returned **400 `invalid_pricing_basis`**.
- No items created for any failure.

## 13. Token / guard

- Token kind exercised: `v2-external-package-create`.
- Token binds: netCost, currency, country, clientDescription, pricingBasis, packageName.
- Changing netCost after preview returned **`invalid_preview_token`**.
- Changing currency after preview returned **`invalid_preview_token`**.
- Cross-type replay, `stale_preview`, `rate_changed`, and the compensating `removeItem` remain covered by PR #841 automated tests.

## 14. Redaction / privacy

- Preview/create response bodies scanned.
- None of the following appeared:
  - externalNetCost
  - externalInternalNotes
  - externalSupplierName
  - supplierName
  - internalNotes
- Response shape remains narrow (`itemId` / `itemType` / `dayId` / `cost` / `sell` / `currency` / `quote`).
- No raw external object.
- No supplier rates.
- No PII.

## 15. Voucher/packet

- None.
- Quote-stage create is `createItem` + recalc only.
- No booking.
- No voucher.
- No packet.
- No generate/send.

## 16. Side-effect check

- Quote remains DRAFT.
- acceptedVersionId null.
- publicToken null.
- publicEnabled false.
- versions 0.
- bookings 0.
- invoices 0.
- quoteItems 1, only the created external package.
- No Accept.
- No booking conversion.
- No email/send.

## 17. Cleanup / retention

- Fixture retained for M-3b frontend AddExternalPackagePanel validation.
- No deletion.
- Created record IDs documented:
  - quote `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
  - itinerary day `4b0d0d8a-105f-4ada-9cb2-095459e0877f`
  - external item `4beecd88-569f-43d7-8854-79c2be60c9ef`

## 18. Test / CI confirmation

- `quote-experiences-v2.service.test.ts` 105/105.
- api tsc baseline 16, none in changed files.
- Vercel checks green.
- PR #841 merged.

## 19. Confirmations

- No production access.
- No production DB reads/writes.
- No code changes.
- No PR implementation during validation.
- No schema/migration.
- No flag/env changes.
- No email/send.
- No Accept.
- No invoice.
- No booking.
- No public link.
- No voucher/packet.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.
- M-3b frontend AddExternalPackagePanel not started.

## 20. GO / NO-GO

**GO**
- M-3a backend External Package create validated on staging.
- Proceed to M-3b frontend AddExternalPackagePanel after this doc merges.
- Reuse the retained fixture for M-3b validation.

**NO-GO**
- Enabling production item-create.
- Operations-accessible external package create.
- Pricing matrix / single supplement.
- New pricing math.
- Resolver / `createItem` / recalc changes.
- Voucher/packet behavior changes.
- Accept / invoice / booking.
- Supplier-send / voucher-send.
- Staff rollout / live bookings.
- Full no-Classic launch.

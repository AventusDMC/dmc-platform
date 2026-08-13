# ERP V2 — M-3b: Frontend AddExternalPackagePanel — Staging Validation Report

**Status: PASS** · The panel's exact create request was validated end-to-end on staging via the proxy-equivalent V2 item-create API path; panel render, finance-gating, and fields are covered by the deployed build + the merged automated test. No production access, no code, no PR implementation, no email/send. Classic remains the system of record.

## 1. Result

- M-3b frontend `AddExternalPackagePanel` validated on staging.
- Panel create request validated end-to-end through the proxy-equivalent V2 item-create API path.
- Panel render, finance-gating, and fields covered by the deployed build plus the merged automated test.
- PER_PERSON preview + create passed.
- PER_GROUP preview passed.
- operations and agent_admin blocked (fail closed).
- error handling passed.
- redaction / privacy clean.
- no voucher/packet side effects.
- no Accept/invoice/booking/email.

## 2. Context

- Frontend **PR #843** (`AddExternalPackagePanel`) merged.
- Backend **PR #841** (External Package create support) already merged and staging-validated.
- Existing endpoints reused:
  - `POST /quotes/:id/v2/experiences/item/preview`
  - `POST /quotes/:id/v2/experiences/item`
- Existing shared handlers/proxies reused. No new proxy. No new flag.
- Existing flag reused: `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE`.
- The admin-web proxy is a verified cookie→Bearer pass-through (`buildActorHeaders`), so hitting the API with the panel's exact `currentPayload()` exercises the same request the panel emits.
- Classic remains the system of record.

## 3. Staging deployed commit

- API HEAD / Railway commit: `82a61ff012ad2ddb0866680540462bb08dc197b1`.
- This is the PR #843 merge and a descendant of the PR #841 merge commit `12c71d4b0e55182140e9d84fcb04db9449016814` (both on `main`) — so the staging API includes both.
- Vercel admin-web staging deploy for the PR #843 merge was green.
- Staging project: `dmc-platform-staging`.
- Project ID: `26e31130-a684-448a-bb96-f0da7a0a60c9`.
- Production project excluded: `cheerful-enthusiasm` / `60d81051…`.
- Marker booking present: `BK-2026-0002`.
- Session secret present.
- staging `QUOTE_ITEM_CREATE = true` (read-only check).
- No flag changes.

## 4. Quote fixture

- Quote: `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
- Title: `UAT-STAGING-M3A-EXTERNAL-PACKAGE-CREATE — DO NOT SEND`
- Status: DRAFT
- Adults: 2
- Day: `4b0d0d8a-105f-4ada-9cb2-095459e0877f`
- Existing M-3a external item: `4beecd88-569f-43d7-8854-79c2be60c9ef`
- No new quote created. Quote not accepted.

## 5. Page render / UI coverage

- The Experiences step is client-rendered on tab navigation and not SSR-observable.
- httpOnly-cookie auth prevented interactive browser automation.
- Validation used the established pattern:
  - deployed build on `main` HEAD `82a61ff`
  - admin-web-staging green
  - automated test `builder-v2-add-external-package-preview-confirm.test.ts` 10/10
- The test asserts the panel renders beside Activity/Guide/Meal/Entrance.
- Panel is behind the item-create gate.
- Panel renders only when `externalPackageCreateEnabled` is true.
- `externalPackageCreateEnabled` is fed from `canViewCostMargin`: admin / super_admin / finance.
- Panel hidden from operations/non-finance.
- No service picker.
- No `/api/services` fetch.
- No `serviceId`.
- No supplier selector.

## 6. Field / UI validation

Required controls present:
- day
- serviceDate
- netCost
- currency
- country
- clientDescription

Optional controls present:
- packageName
- pricingBasis PER_PERSON / PER_GROUP
- includes
- excludes
- hotelsOrSimilar
- internalNotes

Absent controls:
- service picker
- serviceId
- supplier selector
- pricing matrix
- single supplement
- sell-price override
- markup field
- operations cost field

## 7. Finance preview

- Used the panel `currentPayload()` equivalent:
  - netCost 100
  - currency USD
  - country Jordan
  - clientDescription `UAT-STAGING-M3B External Package`
  - packageName `UAT-STAGING-M3B Package`
  - pricingBasis PER_PERSON
- Result: **201**.
- itemType: external_package.
- projected cost: 200.
- projected sell: 240.
- Confirms: netCost 100 × 2 pax × 1.20 markup = 240 sell.
- previewToken returned.
- Response keys narrow: `itemType`, `dayId`, `projected`, `previewToken`.
- No write on preview.
- Preview showed selling price only.
- No cost/margin leaked.

## 8. Preview payload validation

Payload contained:
- itemType external_package
- dayId
- serviceDate
- netCost
- currency
- country
- clientDescription
- pricingBasis
- packageName

Payload did NOT contain:
- serviceId
- supplierId
- externalNetCost
- externalSupplierName
- pricingMatrixJson
- singleSupplement
- sellPrice
- sellPriceOverride
- markupPercent
- voucher/packet fields

## 9. Finance create

- Result: **201**.
- Created M-3b item: `6bd20760-0df2-43bc-9f5b-2e531a51ce78`.
- Client toast label resolves to: **External package**.
- Success toast: **External package added successfully**.

Persisted values:
- serviceId null
- activityId null
- externalNetCost 100
- currency USD
- externalPackageCountry Jordan
- externalPackageName `UAT-STAGING-M3B Package`
- externalClientDescription `UAT-STAGING-M3B External Package`
- externalPricingBasis PER_PERSON
- markupPercent 20
- baseCost 200
- totalCost 200
- totalSell 240
- day-linked to `4b0d0d8a-105f-4ada-9cb2-095459e0877f`

Shared `createItem`/recalc path confirmed:
- quote totals moved exactly by the new line: 200/240 → 400/480
- quoteItems: 1 → 2
- no voucher/packet side effect

## 10. PER_GROUP preview

- Result: **201**.
- Preview-only.
- projected cost: 100.
- projected sell: 120.
- Confirms flat group basis at 20% markup.
- Token bound to pricingBasis.
- No create performed.

## 11. Operations / non-finance

- operations preview: **403 `external_package_finance_only`**
- operations create: **403 `external_package_finance_only`**
- agent_admin preview: **403 `external_package_finance_only`**
- No item created.
- UI panel hidden for those roles per the finance gate and the automated test.

## 12. Error handling

- missing netCost: **400 `missing_field`**
- missing currency: **400 `missing_field`**
- missing country: **400 `missing_field`**
- missing clientDescription: **400 `missing_field`**
- negative netCost: **400 `invalid_external_package_cost`**
- non-finite netCost: **400 `invalid_external_package_cost`**
- invalid basis PER_ROOM: **400 `invalid_pricing_basis`**
- no items created for failed cases.
- Client maps: `external_package_finance_only`, `invalid_external_package_cost`, `invalid_pricing_basis`.
- feature_disabled / stale_preview / rate_changed remain covered by PR #841/#843 automated tests.

## 13. Network / action safety

- Only preview/create POSTs used.
- No Accept endpoint.
- No invoice endpoint.
- No booking-conversion endpoint.
- No email/send endpoint.
- No supplier-send/voucher-send endpoint.
- No voucher/packet generate/send endpoint.
- No public-link endpoint.
- No multi-country external-package module endpoint.

## 14. Redaction / privacy

Preview and create responses scanned. None of these appeared:
- externalNetCost
- externalInternalNotes
- externalSupplierName
- supplierName
- internalNotes

Also confirmed:
- narrow response shape
- no raw external object
- no supplier rates
- no cost/margin to non-finance
- no PII

## 15. Voucher/packet

- none.
- create is `createItem` + recalc only.
- no booking.
- no voucher.
- no packet.
- no generate/send.

## 16. Side-effect check

- quote remains DRAFT.
- acceptedVersionId null.
- publicToken null.
- publicEnabled false.
- versions 0.
- bookings 0.
- invoices 0.
- quoteItems 2 after M-3b validation.
- No Accept.
- No invoice.
- No booking.
- No conversion.
- No public link.
- No voucher/packet.
- No email/send.

## 17. Cleanup / retention

- Fixture retained for M-3 end-to-end evidence.
- No deletion.
- Created record IDs:
  - quote `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
  - day `4b0d0d8a-105f-4ada-9cb2-095459e0877f`
  - M-3a item `4beecd88-569f-43d7-8854-79c2be60c9ef`
  - M-3b item `6bd20760-0df2-43bc-9f5b-2e531a51ce78`

## 18. Test / CI

- PR #843 new external-package test: 10/10.
- sibling add-item + external preview/apply + cost-margin/redaction suites: 84/84.
- admin-web `tsc` unchanged at the 11-error baseline.
- no tsc errors in changed files.
- Vercel checks green.
- pre-existing baseline failures unchanged and unrelated.

## 19. Confirmations

- no production access.
- no production DB reads/writes.
- no code changes during validation.
- no PR implementation during validation.
- no schema/migration.
- no flag/env changes.
- no email/send.
- no Accept.
- no invoice.
- no booking.
- no booking conversion.
- no public link.
- no voucher/packet.
- voucher-send allowlist remains `ziad@axisdmc.com` only.
- supplier sending disabled.
- next slice not started.

## 20. GO / NO-GO

**GO**
- M-3b frontend `AddExternalPackagePanel` validated.
- External Package create path is complete at backend + frontend level for build/test mode.
- Create the M-3b validation doc PR.

**NO-GO**
- Enabling production item-create.
- Staff rollout / live bookings.
- Operations-accessible external package create.
- Pricing matrix / single supplement.
- New pricing math.
- Resolver / `createItem` / recalc changes.
- Voucher/packet behavior changes.
- Accept / invoice / booking.
- Supplier-send / voucher-send.
- Full no-Classic launch.

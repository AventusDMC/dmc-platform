# ERP V2 — M-1a: Backend Meal Create — Staging Validation Report

**Status: PASS** · Controlled synthetic staging validation via the live V2 item-create API. No production access, no code, no PR implementation, no email/send. Classic remains the system of record.

## 1. Result

- Backend Meal create validated on staging.
- The existing V2 item-create API accepted `itemType: meal`.
- Admin preview/create passed.
- Operations preview passed with cost redaction.
- Operations cost override blocked.
- Admin override token-invalidation validated.
- No production access. No email/send.

## 2. Context

- Shipped by **PR #831**.
- Backend routes: `POST /quotes/:id/v2/experiences/item/preview` and `POST /quotes/:id/v2/experiences/item`.
- The existing guarded **preview → confirm → create** flow was reused.
- `createItem` / `recalculateQuoteTotals` unchanged.
- `resolveQuoteItemValues` pricing math unchanged.
- Classic remains the system of record.

## 3. Staging targeting

- Project-ID-pinned staging SSH.
- Production project not targeted.
- Hard guard passed:
  - `RAILWAY_PROJECT_NAME = dmc-platform-staging`
  - staging marker booking `BK-2026-0002` present
  - script ran in STAGING ONLY mode.

## 4. Deployed commit

- `bd0c2ae25cca52c2a3728615d8b756bd9450a169`.
- Staging API dist contains: `v2-meal-create`, `not_meal_service`, `cost_override_forbidden`.

## 5. Flags

- Staging API `QUOTE_ITEM_CREATE = true`.
- No flag changes.
- Production not accessed in this validation.
- Prior prerequisite check confirmed production item-create OFF/unset.

## 6. Fixture quote / day

- Quote: `13238d51-9f4e-4297-b292-5003b3cbdae3`
- Title: `UAT-STAGING-M1A-MEAL-CREATE — DO NOT SEND`
- Status: DRAFT
- Itinerary day: `38f9f268-335f-486f-b39d-7d562bcd0d76`
- Not accepted. No version, invoice, booking, voucher, packet, or public link.

## 7. Meal service

- serviceId: `11111111-1111-1111-1111-111111110020`
- name: QA Meal Service
- baseCost 30
- currency USD
- unitType per_person
- non-meal rejection service: `11111111-…-0021`

## 8. Admin preview result

- `POST …/item/preview` returned **201**.
- `itemType: meal` accepted.
- `projected.cost = 60`.
- `projected.sell = 72`.
- currency USD.
- `previewToken` returned.
- No write.

## 9. Admin create result

- `POST …/item` returned **201**.
- Created meal `QuoteItem`: `24720a7e-7f14-4b55-8983-9a4a44e95358`.
- `serviceId` = meal service.
- `customServiceName` = "UAT-STAGING-M1A QA Meal".
- `quantity 1`.
- `markupPercent 20`.
- `costBaseAmount 30`.
- currency USD.
- `totalCost 60`.
- `totalSell 72`.
- `serviceDate` 2026-09-01.
- Day-linked through `QuoteItineraryDayItem`.
- Shared `createItem`/recalc path confirmed.

## 10. Operations preview

- Operations preview returned **201**.
- `projected.cost = null`.
- `projected.sell = 72`.
- No `unitCost` exposed.
- Cost redaction confirmed.

## 11. Operations override rejection

- Operations with `unitCost` returned **403 `cost_override_forbidden`**.
- Operations with `currency` returned **403 `cost_override_forbidden`**.
- No item created.

## 12. Finance/admin override

- Admin preview with `unitCost 45` and `currency EUR` returned **201**.
- Override honored.
- Create with changed `unitCost 50` and old token returned **400 `invalid_preview_token`**.
- No override item created.

## 13. Non-meal rejection

- Meal preview against a non-meal service returned **400 `not_meal_service`**.
- No item created.

## 14. Missing fields

- Missing `serviceId` returned `missing_field`.
- Blank `customServiceName` returned `missing_field`.
- No item created.

## 15. Token / guard

- Live token decode showed `kind: v2-meal-create`.
- `itemType: meal`.
- Token binds `serviceId` + `customServiceName` + override state.
- Changed `unitCost` invalidates the token.
- Cross-type replay, `stale_preview`, and `rate_changed` remain covered by PR #831 automated tests.

## 16. Redaction / privacy

- Non-finance preview/create responses expose no cost, margin, `unitCost`, supplier rates, internal notes, or PII.
- Only selling price + currency shown to operations.

## 17. Side-effect check

- Synthetic quote remains DRAFT.
- `acceptedVersionId` null.
- versions 0.
- bookings 0.
- invoice 0.
- `publicToken` null.
- `publicEnabled` false.
- `quoteItems 1`, only the admin-created meal.
- No voucher. No voucher packet. No public link.
- No Accept. No booking conversion. No email/send.

## 18. Cleanup / retention

- Fixture retained for M-1b frontend `AddMealPanel` validation.
- No deletion.
- Created record IDs documented:
  - quote `13238d51-9f4e-4297-b292-5003b3cbdae3`
  - itinerary day `38f9f268-335f-486f-b39d-7d562bcd0d76`
  - meal QuoteItem `24720a7e-7f14-4b55-8983-9a4a44e95358`

## 19. Test / CI confirmation

- `quote-experiences-v2.service.test.ts` 57/57.
- `quote-item-preview` 26/26.
- `quote-item-apply-guard` 63/63.
- `meal-custom-service-name` 8/8.
- `tsc` baseline 16.
- Vercel checks green.

## 20. Confirmations

- No production access.
- No email/send.
- No Accept.
- No invoice.
- No booking.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.
- M-1b frontend `AddMealPanel` not started.

## 21. GO / NO-GO

**GO**
- M-1a backend Meal create validated on staging.
- Proceed to M-1b frontend `AddMealPanel` after this doc merges.
- Reuse the retained fixture for M-1b validation.

**NO-GO**
- Enabling production item-create.
- Exposing cost/margin to non-finance.
- New pricing math.
- Accept/invoice/booking.
- Supplier-send / voucher-send.
- Staff rollout / live bookings.
- Full no-Classic launch.

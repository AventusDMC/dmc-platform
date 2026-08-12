# ERP V2 — M-1b: Frontend AddMealPanel — Staging Validation Report

**Status: PASS** · Controlled synthetic staging validation. No production access, no code, no PR implementation, no email/send. Classic remains the system of record.

## 1. Result

- M-1b frontend `AddMealPanel` staging validation passed.
- Controlled synthetic staging validation.
- No production access. No code changes during validation. No PR implementation during validation. No email/send.

## 2. Context

- Frontend **PR #833**; backend **PR #831**.
- M-1a backend Meal create already validated.
- Existing endpoints used: `POST /api/quotes/:id/v2/experiences/item/preview` and `POST /api/quotes/:id/v2/experiences/item`.
- The existing **preview → confirm → create** flow was reused.
- No pricing-math change.
- Classic remains the system of record.

## 3. Staging deployed commits

- Frontend #833: `c73aee266f21b7bc305fe5d4e4f120f52d3a29e3`
- Backend #831: `bd0c2ae25cca52c2a3728615d8b756bd9450a169`
- Both on `origin/main`.
- Staging admin-web git-main deploy matches #833 (deploy time = merge time).
- Staging API dist carries `v2-meal-create`.
- Hard guard passed: `RAILWAY_PROJECT_NAME = dmc-platform-staging`, marker `BK-2026-0002` present, production not targeted.

## 4. Fixture quote

- Quote: `13238d51-9f4e-4297-b292-5003b3cbdae3`
- Title: `UAT-STAGING-M1A-MEAL-CREATE — DO NOT SEND`
- Status: DRAFT
- Itinerary day: `38f9f268-335f-486f-b39d-7d562bcd0d76`
- No new quote created.

## 5. Meal service

- Service: `11111111-1111-1111-1111-111111110020`
- QA Meal Service.
- baseCost 30.
- currency USD.
- unitType per_person.
- Non-meal rejection service: `11111111-…-0021`.

## 6. Page render result

- The Experiences step is **client-rendered on tab navigation** and not visible in the initial SSR HTML (its title `Experiences & Entrances` is absent from the SSR fetch, while other step markers are present; the itinerary has 1 active day, so `canAddActivity` is not gated — this is a client-render property, not a meal-specific or gating issue, and affects the activity/guide panels identically).
- Authenticated interactive browser automation was not performed because httpOnly-cookie auth prevents it in this validation path.
- Deployed #833 build confirmed (git-main, timestamp = merge).
- Automated tests confirm `AddMealPanel` renders alongside Activity/Guide under the existing item-create gate.
- The live proxy/create path is validated below.

## 7. Meal service filter

- `/api/services` is the source (the same fetch the panel uses).
- `QA Meal Service` (serviceType code `MEAL`) passes `isMealService`.
- guide/activity/hotel/transport/ticketing services fail `isMealService`.
- Non-meal services are excluded by the predicate.
- The client-filtered `<select>` is not SSR-observable (collapsed form); covered by the automated test.

## 8. Admin preview

- `POST /api/quotes/:id/v2/experiences/item/preview` returned **201**.
- `itemType` meal.
- `projected.sell` 72.
- currency USD.
- `previewToken` returned.
- Panel shows selling price only.
- No write.

## 9. Admin create

- `POST /api/quotes/:id/v2/experiences/item` returned **201**.
- Created item: `385feb4b-41f0-4d5d-9752-1a034590c4d3`.
- `itemType` meal.
- customServiceName: `UAT-STAGING-M1B QA Meal`.
- serviceId: `11111111-…-0020`.
- quantity 1.
- markupPercent 20.
- costBaseAmount 30.
- currency USD.
- totalCost 60.
- totalSell 72.
- serviceDate 2026-09-05.
- Day-linked to: `38f9f268-335f-486f-b39d-7d562bcd0d76`.
- Shared `createItem`/recalc path confirmed.
- Quote totals moved by exactly the meal line: cost 60 → 120, sell 72 → 144, items 1 → 2.
- The generalized toast resolves to "Meal added successfully."

## 10. Operations validation

- Operations preview without override returned **201**.
- `projected.cost` null.
- `projected.sell` 72.
- Operations `unitCost` override returned **403 `cost_override_forbidden`**.
- Operations field hiding covered by the automated test.
- No operations item created.

## 11. Finance/admin override

- Admin override preview with `unitCost 45` and `currency EUR` returned **201**.
- sell 116.64.
- Override honored.
- Preview-only.
- No override item created.
- Finance field visibility covered by the automated test.

## 12. Error handling

- Missing `customServiceName` returned `missing_field`.
- Non-meal service returned `not_meal_service`.
- Operations override returned `cost_override_forbidden`.
- `feature_disabled` / `stale_preview` / `rate_changed` remain covered by automated tests.
- The client maps errors through `addItemErrorMessage`.

## 13. Network / action safety

- Only SSR GETs and POSTs to item preview/create were used.
- No Accept endpoint.
- No invoice endpoint.
- No booking-conversion endpoint.
- No email/send endpoint.
- No supplier-send / voucher-send endpoint.
- No voucher/packet generate/send endpoint.
- No public proposal link endpoint.

## 14. Redaction / privacy

- Operations responses expose no cost, margin, or `unitCost`.
- Selling price and currency only for operations.
- No supplier rates.
- No internal notes.
- No PII.
- Finance-only cost override is enforced by UI gating **and** backend `cost_override_forbidden`.

## 15. Side-effect check

- Fixture remains DRAFT.
- `acceptedVersionId` null.
- versions 0.
- bookings 0.
- invoice 0.
- `publicToken` null.
- `publicEnabled` false.
- No voucher. No voucher packet. No public link.
- No Accept. No booking conversion. No email/send.
- `quoteItems` = 2:
  - M-1a item `24720a7e-7f14-4b55-8983-9a4a44e95358`
  - M-1b item `385feb4b-41f0-4d5d-9752-1a034590c4d3`

## 16. Cleanup / retention

- Fixture retained for M-1 end-to-end evidence.
- No deletion.
- All IDs recorded for later cleanup:
  - quote `13238d51-9f4e-4297-b292-5003b3cbdae3`
  - itinerary day `38f9f268-335f-486f-b39d-7d562bcd0d76`
  - M-1a meal item `24720a7e-7f14-4b55-8983-9a4a44e95358`
  - M-1b meal item `385feb4b-41f0-4d5d-9752-1a034590c4d3`

## 17. Test / CI confirmation

- new meal test 9/9.
- add-activity 5/5.
- add-activity-preview-confirm 5/5.
- add-guide-preview-confirm 6/6.
- cost-margin-gating 6/6.
- cost-margin-payload-redaction 2/2.
- lib cost-redaction 6/6.
- hotel-diagnostics 10/10.
- `tsc` changed files clean.
- Vercel checks green.
- Pre-existing baseline failures unchanged and unrelated.

## 18. Confirmations

- No production access.
- No email/send.
- No Accept.
- No invoice.
- No booking.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.
- Next build slice not started.

## 19. GO / NO-GO

**GO**
- M-1 Meal create validated end-to-end on staging.
- Close M-1 after this doc merges.
- Retain the fixture until later cleanup.

**NO-GO**
- Enabling production item-create.
- Exposing cost/margin to non-finance.
- New pricing math.
- Accept/invoice/booking.
- Supplier-send / voucher-send.
- Staff rollout / live bookings.
- Full no-Classic launch.

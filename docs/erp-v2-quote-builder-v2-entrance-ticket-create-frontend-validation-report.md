# ERP V2 — M-2b: Frontend AddEntrancePanel — Staging Validation Report

**Status: PASS** · Controlled synthetic staging validation; the create path was validated live end-to-end. No production access, no code, no PR implementation, no email/send, no Jordan Pass logic change. Classic remains the system of record.

## 1. Result

- M-2b frontend `AddEntrancePanel` staging validation passed.
- Controlled synthetic staging validation.
- Create path validated live end-to-end.
- No production access. No code changes during validation. No PR implementation during validation. No email/send. No Jordan Pass logic change.

## 2. Context

- Frontend **PR #838**; backend **PR #836**.
- M-2a backend Entrance/Ticket create already validated.
- Existing endpoints used: `POST /api/quotes/:id/v2/experiences/item/preview` and `POST /api/quotes/:id/v2/experiences/item`.
- The existing **preview → confirm → create** flow was reused.
- No pricing-math change. No Jordan Pass logic change.
- Classic remains the system of record.

## 3. Staging deployed commits

- Frontend #838: `16264991c7488da70941c6174c2414b44210ad39`
- Backend #836: `477b697c105c2b8e558d50ec84b8342d28469d53`
- Both on `origin/main`.
- Staging admin-web git-main deploy matches #838 (deploy time = merge time).
- Backend #836 deployed.
- Hard guard passed: `RAILWAY_PROJECT_NAME = dmc-platform-staging`, marker `BK-2026-0002` present, production not targeted.

## 4. Fixture quote

- Quote: `7ef1da98-8282-4ed3-9c41-1e2005d69586`
- Title: `UAT-STAGING-M2A-ENTRANCE-CREATE — DO NOT SEND`
- Status: DRAFT
- `jordanPassType`: NONE
- Itinerary day: `368e4aa5-e0de-4a39-a386-3727b35f9362`
- No new quote created.

## 5. Entrance service

- Service: `44444444-…-0003`
- Jerash Entrance.
- `foreignerFeeJod` 12.
- currency JOD.
- unitType per_person.
- `TicketRateVariant` count 0.
- Non-entrance rejection service: `11111111-…-0020`.

## 6. Page render result

- The Experiences step is **client-rendered on tab navigation** and not visible in the initial SSR HTML (its title and all four add-panels — activity/guide/meal/entrance — are absent from the SSR fetch; the itinerary has a day, so `canAddActivity` is not gated).
- Authenticated interactive browser automation was not performed because httpOnly-cookie auth prevents it in this validation path.
- Deployed #838 build confirmed.
- Automated tests confirm `AddEntrancePanel` renders alongside Activity/Guide/Meal under the existing item-create gate.
- Automated tests confirm the entrance-service selector and optional-variant behavior.
- The live proxy/create path is validated below.

## 7. Entrance service filter

- `/api/services` is the source.
- Jerash Entrance passes `isEntranceService`.
- Non-entrance services fail the predicate.
- The client-side filtered `<select>` is not SSR-observable.
- Covered by the automated test.

## 8. Base-fee fallback UI

- Jerash has **0 TicketRateVariants**.
- The panel shows "Uses the base entrance fee".
- The UI does not require a variant.
- The preview/create payload omits `ticketRateVariantId`.
- The create confirms `ticketRateVariantId` null.
- The create confirms `costBaseAmount 12` from the base fee.

## 9. Admin preview

- `POST /api/quotes/:id/v2/experiences/item/preview` returned **201**.
- `itemType` entrance.
- No `ticketRateVariantId`.
- `projected.cost = 24`.
- `projected.sell = 24`.
- currency JOD.
- `previewToken` returned.
- 0% markup confirmed (sell = cost).
- No write.
- Payload sent only: `itemType`, `serviceId`, `dayId`, `serviceDate`.
- Payload did NOT send: `entranceFeeId`, `jordanPassCovered`, `jordanPassSavingsJod`, `unitCost`, `currency`, `markupPercent`, cost fields.

## 10. Admin create

- `POST /api/quotes/:id/v2/experiences/item` returned **201**.
- Created item: `288b0f94-e069-4d87-bd00-c0dd7622565e`.
- `itemType` entrance.
- Success toast resolves to: "Entrance added successfully."
- serviceId = Jerash.
- `entranceFeeId` derived server-side: `55555555-…-0003`.
- `ticketRateVariantId` = null.
- quantity 1.
- markupPercent 0.
- costBaseAmount 12.
- baseCost 24.
- currency JOD.
- totalCost 24.
- totalSell 24.
- jordanPassCovered false.
- Day-linked through `QuoteItineraryDayItem`.
- Shared `createItem`/recalc path confirmed.
- Quote totals moved by exactly the entrance line: cost 24 → 48, sell 24 → 48, items 1 → 2.
- No voucher/packet side effect.

## 11. Operations validation

- Operations preview without a variant returned **201**.
- `projected.cost = null`.
- `projected.sell = 24`.
- No cost/markup/currency field is present in the UI by design and covered by the automated test.
- A live operations browser session was not available due to httpOnly auth.
- No operations item created.

## 12. Error handling

- Non-entrance service returned `not_entrance_service`.
- Fake `ticketRateVariantId` returned `invalid_ticket_rate_variant`.
- Both mapped by `addItemErrorMessage`.
- `feature_disabled` / `stale_preview` / `rate_changed` remain covered by automated tests.

## 13. Jordan Pass behavior

- Fixture quote has `jordanPassType` NONE.
- Created item has `jordanPassCovered` false.
- Non-zero cost 24 confirmed.
- No Jordan Pass logic touched.
- JP-covered path remains covered by automated tests.

## 14. Network / action safety

- Only SSR GETs and POSTs to item preview/create were used.
- No Accept endpoint.
- No invoice endpoint.
- No booking-conversion endpoint.
- No email/send endpoint.
- No supplier-send / voucher-send endpoint.
- No voucher/packet generate/send endpoint.
- No public proposal link endpoint.

## 15. Redaction / privacy

- Operations response exposed no cost/margin.
- cost null for operations.
- No supplier rates.
- No `foreignerFeeJod` exposed to operations.
- No raw `EntranceFee`.
- No internal notes.
- No PII.
- `entranceFeeId` was read server-side via Prisma, not returned to a non-finance client.

## 16. Voucher/packet side-effect

- None.
- Create path is `createItem` + recalc only.
- No booking.
- No voucher.
- No packet.

## 17. Side-effect check

- Fixture remains DRAFT.
- `acceptedVersionId` null.
- `jordanPassType` NONE.
- versions 0.
- bookings 0.
- invoice 0.
- `publicToken` null.
- `publicEnabled` false.
- No voucher. No voucher packet. No public link.
- No Accept. No booking conversion. No email/send.
- `quoteItems` = 2:
  - M-2a item `9a2bba58-1cfe-4358-b97b-9dd66a03c54f`
  - M-2b item `288b0f94-e069-4d87-bd00-c0dd7622565e`

## 18. Cleanup / retention

- Fixture retained for M-2 end-to-end evidence.
- No deletion.
- All IDs recorded for later cleanup:
  - quote `7ef1da98-8282-4ed3-9c41-1e2005d69586`
  - itinerary day `368e4aa5-e0de-4a39-a386-3727b35f9362`
  - M-2a entrance item `9a2bba58-1cfe-4358-b97b-9dd66a03c54f`
  - M-2b entrance item `288b0f94-e069-4d87-bd00-c0dd7622565e`

## 19. Test / CI confirmation

- new entrance test 9/9.
- add-activity 5/5.
- add-activity-preview-confirm 5/5.
- add-guide-preview-confirm 6/6.
- add-meal-preview-confirm 9/9.
- entrance-display 7/7.
- entrance-adapter-fields 5/5.
- experiences-ux 8/8.
- cost-margin-gating 6/6.
- lib cost-redaction 6/6.
- `tsc` changed files clean.
- Vercel checks green.
- Pre-existing baseline failures unchanged and unrelated.

## 20. Confirmations

- No production access.
- No email/send.
- No Accept.
- No invoice.
- No booking.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.
- Next build slice not started.

## 21. GO / NO-GO

**GO**
- M-2 Entrance/Ticket create validated end-to-end on staging.
- Close M-2 after this doc merges.
- Retain the fixture until later cleanup.

**NO-GO**
- Enabling production item-create.
- Changing Jordan Pass logic.
- Exposing cost/margin to non-finance.
- New pricing math.
- Voucher/packet behavior changes.
- Accept/invoice/booking.
- Supplier-send / voucher-send.
- Staff rollout / live bookings.
- Full no-Classic launch.

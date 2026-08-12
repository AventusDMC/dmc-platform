# ERP V2 — M-2a: Backend Entrance/Ticket Create — Staging Validation Report

**Status: PASS** · Controlled synthetic staging validation via the live V2 item-create API. No production access, no code, no PR implementation, no email/send, no Jordan Pass logic change. Classic remains the system of record.

## 1. Result

- Backend Entrance/Ticket create validated on staging.
- The existing V2 item-create API accepted `itemType: entrance`.
- Base-fee fallback passed.
- Operations preview passed with cost redaction.
- Non-entrance service rejected.
- Missing service rejected.
- Invalid `ticketRateVariant` rejected.
- No voucher/packet side effect.
- No production access. No email/send.

## 2. Context

- Shipped by **PR #836**.
- Backend routes: `POST /quotes/:id/v2/experiences/item/preview` and `POST /quotes/:id/v2/experiences/item`.
- The existing guarded **preview → confirm → create** flow was reused.
- `createItem` / `recalculateQuoteTotals` unchanged.
- `resolveQuoteItemValues` pricing math unchanged.
- Jordan Pass logic unchanged.
- Classic remains the system of record.

## 3. Staging targeting

- Project-ID-pinned staging SSH.
- Production project not targeted.
- Hard guard passed:
  - `RAILWAY_PROJECT_NAME = dmc-platform-staging`
  - staging marker booking `BK-2026-0002` present
  - script ran in STAGING ONLY mode.

## 4. Deployed commit

- `477b697c105c2b8e558d50ec84b8342d28469d53`.
- Staging API dist contains: `v2-entrance-create`, `not_entrance_service`, `invalid_ticket_rate_variant`.

## 5. Flags

- Staging API `QUOTE_ITEM_CREATE = true`.
- No flag changes.
- Production not accessed in this validation.
- Prior checks confirmed production item-create OFF/unset.

## 6. Fixture quote / day

- Quote: `7ef1da98-8282-4ed3-9c41-1e2005d69586`
- Title: `UAT-STAGING-M2A-ENTRANCE-CREATE — DO NOT SEND`
- Status: DRAFT
- `jordanPassType`: NONE
- Adults: 2
- Itinerary day: `368e4aa5-e0de-4a39-a386-3727b35f9362`
- Not accepted. No version, invoice, booking, voucher, packet, or public link.

## 7. Entrance service

- Service: `44444444-…-0003`
- Jerash Entrance.
- Linked `EntranceFee`.
- siteName Jerash.
- `foreignerFeeJod` 12.
- JP-eligible.
- currency JOD.
- unitType per_person.
- `TicketRateVariant` count 0.
- Non-entrance rejection service: `11111111-…-0020`.

## 8. Admin preview result

- `POST …/item/preview` returned **201**.
- `itemType` entrance accepted.
- Base-fee fallback used.
- `projected.cost = 24`.
- `projected.sell = 24`.
- currency JOD.
- `previewToken` returned.
- 0% markup confirmed (sell = cost).
- No write.

## 9. Admin create result

- `POST …/item` returned **201**.
- Created item: `9a2bba58-1cfe-4358-b97b-9dd66a03c54f`.
- serviceId = Jerash Entrance.
- `entranceFeeId` **derived server-side** (`55555555-…-0003`).
- `ticketRateVariantId` = `null`.
- quantity 1.
- markupPercent 0.
- costBaseAmount 12.
- baseCost 24.
- currency JOD.
- totalCost 24.
- totalSell 24.
- jordanPassCovered false.
- jordanPassSavingsJod 0.
- serviceDate 2026-10-01.
- Day-linked through `QuoteItineraryDayItem`.
- Shared `createItem`/recalc path confirmed.

## 10. Operations preview

- Operations preview returned **201**.
- `projected.cost = null`.
- `projected.sell = 24`.
- Cost redaction confirmed.

## 11. Non-entrance rejection

- Entrance preview against a non-entrance service returned **400 `not_entrance_service`**.
- No item created.

## 12. Missing-service validation

- Missing `serviceId` returned `missing_field`.
- Unknown `serviceId` returned `service_not_found`.
- No item created.

## 13. Invalid ticketRateVariant

- Fake/foreign `ticketRateVariantId` returned **400 `invalid_ticket_rate_variant`**.
- No item created.
- `ticketRateVariantId` optional confirmed by the successful base-fee create.

## 14. Jordan Pass behavior

- The JP-NONE quote yielded:
  - `jordanPassCovered` false
  - `jordanPassSavingsJod` 0
  - non-zero cost 24.
- JP logic unchanged.
- JP-covered path remains automated-test covered: `jordan-pass-coverage` 6/6, `quote-pricing-scenarios` 65/65.

## 15. Token / guard

- Live token decode showed `kind: v2-entrance-create`.
- `itemType: entrance`.
- Token binds `serviceId` + `ticketRateVariantId` (null state).
- Changed service/variant invalidation, cross-type replay, `stale_preview`, and `rate_changed` remain covered by PR #836 automated tests.

## 16. Redaction / privacy

- Operations responses expose no cost, margin, supplier rates, `foreignerFeeJod` internals, raw `EntranceFee`, internal notes, or PII.
- Only selling price + currency shown to operations.
- `entranceFeeId` was read server-side via Prisma, not returned to a non-finance client.

## 17. Voucher/packet side-effect

- None.
- Quote-stage create touched `quoteItem` + recalc only.
- No booking.
- No voucher path.
- No packet path.

## 18. Side-effect check

- Synthetic quote remains DRAFT.
- `acceptedVersionId` null.
- `jordanPassType` NONE.
- versions 0.
- bookings 0.
- `quoteItems` 1, only the admin-created entrance.
- invoice 0.
- `publicToken` null.
- `publicEnabled` false.
- No voucher. No voucher packet. No public link.
- No Accept. No booking conversion. No email/send.

## 19. Cleanup / retention

- Fixture retained for M-2b frontend `AddEntrancePanel` validation.
- No deletion.
- Created record IDs documented:
  - quote `7ef1da98-8282-4ed3-9c41-1e2005d69586`
  - itinerary day `368e4aa5-e0de-4a39-a386-3727b35f9362`
  - entrance QuoteItem `9a2bba58-1cfe-4358-b97b-9dd66a03c54f`

## 20. Test / CI confirmation

- `quote-experiences-v2.service.test.ts` 76/76.
- `quote-item-preview` 26/26.
- `quote-item-apply-guard` 63/63.
- `meal-custom-service-name` 8/8.
- `jordan-pass-coverage` 6/6.
- `quote-pricing-scenarios` 65/65.
- `tsc` baseline 16.
- Vercel checks green.

## 21. Confirmations

- No production access.
- No email/send.
- No Accept.
- No invoice.
- No booking.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.
- M-2b frontend `AddEntrancePanel` not started.

## 22. GO / NO-GO

**GO**
- M-2a backend Entrance/Ticket create validated on staging.
- Proceed to M-2b frontend `AddEntrancePanel` after this doc merges.
- Reuse the retained fixture for M-2b validation.

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

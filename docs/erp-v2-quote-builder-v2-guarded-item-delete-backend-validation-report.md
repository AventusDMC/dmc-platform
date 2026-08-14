# ERP V2 — D-a: Backend Guarded Item Delete — Staging Validation Report

**Status: PASS** · Controlled synthetic staging validation; the delete path was validated live end-to-end via the new V2 delete routes. No production access, no code, no PR implementation, no email/send. Classic remains the system of record.

## 1. Result

- D-a backend guarded item delete validated on staging.
- The M-3b external-package item was removed successfully through the new V2 delete routes.
- The M-3a external-package item is retained as evidence.
- Preview → token → DELETE flow passed.
- Totals recalculated exactly.
- Audit written.
- Redaction / privacy clean.
- No voucher/packet side effects.
- No Accept/invoice/booking/email.
- No production access.

## 2. Context

- **PR #846** (backend guarded item delete) merged.
- Routes validated:
  - `POST /quotes/:id/v2/experiences/item/:itemId/remove/preview`
  - `DELETE /quotes/:id/v2/experiences/item/:itemId`
- Existing `QUOTE_ITEM_CREATE` flag reused. No new flag.
- Existing `removeItem` used; `removeItem` unchanged.
- `recalculateQuoteTotals` reached only through `removeItem`.
- No pricing-math changes.
- Classic remains the system of record.

## 3. Staging targeting

- Railway CLI, **project-ID-pinned**.
- Project: `dmc-platform-staging`.
- Project ID: `26e31130-a684-448a-bb96-f0da7a0a60c9`.
- Service: `dmc-platform`.
- All work via `railway ssh` inside the staging container.
- HTTP calls to `127.0.0.1:8080` with minted `v1.` Bearer session tokens.
- **Hard guard passed before any write:**
  - `RAILWAY_PROJECT_NAME = dmc-platform-staging`
  - `RAILWAY_PROJECT_ID = 26e31130-a684-448a-bb96-f0da7a0a60c9`
  - production `cheerful-enthusiasm` / `60d81051…` excluded
  - marker booking `BK-2026-0002` present
  - session secret present
- The script aborts before any write if a guard fails.

## 4. Deployed commit

- staging API `RAILWAY_GIT_COMMIT_SHA`: `6d06b595f9b711e93afca69f635160f95e731e22`.
- This is the PR #846 merge commit.

## 5. Flag confirmation

- staging `QUOTE_ITEM_CREATE = true` (read-only check).
- No flag changes.
- Production not accessed.

## 6. Fixture pre-state

- Quote: `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
- Status: DRAFT
- acceptedVersionId null
- publicToken null
- publicEnabled false
- versions 0
- bookings 0
- invoices 0
- items before delete:
  - `4beecd88-569f-43d7-8854-79c2be60c9ef`
  - `6bd20760-0df2-43bc-9f5b-2e531a51ce78`
- totals before delete: totalCost 400, totalSell 480
- target item: `6bd20760-0df2-43bc-9f5b-2e531a51ce78`
- target item belonged to the quote
- serviceId null
- externalPackageName: `UAT-STAGING-M3B Package`
- type: external_package
- target cost/sell: 200 / 240

## 7. Preview result

- admin preview returned **201**.
- itemId: `6bd20760-0df2-43bc-9f5b-2e531a51ce78`
- itemType: external_package
- currentTotalSell: 480
- projectedTotalSell: 240
- sellDelta: -240
- currency: USD
- previewToken returned.
- finance-visible cost fields present: currentTotalCost 400, projectedTotalCost 200, costDelta -200.
- no write on preview.
- item count unchanged.
- response shape narrow.
- no raw internals.

## 8. Delete result

- admin DELETE returned **200**.
- removed true.
- itemId: `6bd20760-0df2-43bc-9f5b-2e531a51ce78`
- itemType: external_package
- returned quote totals: totalCost 200, totalSell 240
- target item deleted.
- M-3a item retained: `4beecd88-569f-43d7-8854-79c2be60c9ef`
- QuoteItineraryDayItem cascade confirmed: 0 orphan day-links.
- totals dropped exactly by the removed line: 400/480 → 200/240

## 9. Stale / already-removed behavior

- reused the same token after deletion.
- result: `item_not_found`
- no side effect.
- item not recreated.

## 10. Role validation

- operations preview-only returned the selling delta.
- operations cost fields redacted: currentTotalCost null, projectedTotalCost null, costDelta null.
- confirms external-package delete is **not** finance-only.
- admin performed the actual delete.
- agent_admin and super_admin allowed at the service level per PR #846 automated tests.
- viewer/agent blocked at the route per PR #846 automated tests.

## 11. Token validation

- wrong-kind token (a create-preview token) returned `invalid_preview_token`.
- tampered token returned `invalid_preview_token`.
- item count unchanged.
- nothing deleted for invalid-token attempts.
- expired-token and stale-snapshot cases covered by PR #846 automated tests.

## 12. Eligibility validation

- live confirmed external_package removable.
- activity / guide / meal / entrance removable covered by PR #846 automated tests.
- hotel and transport return `item_not_removable` covered by PR #846 automated tests.
- the M-3a external item remains as evidence.

## 13. Guard validation

- non-existent item id returned `item_not_found`.
- foreign id / booking id returned `item_not_found`.
- non-editable, accepted, and cross-company guards covered by PR #846 automated tests.

## 14. Redaction / privacy

- preview and delete response bodies scanned.
- none of these appeared:
  - externalNetCost
  - externalInternalNotes
  - externalSupplierName
  - supplierName
  - internalNotes
- narrow response shapes.
- no raw item internals.
- no supplier rates.
- no PII.
- cost/margin redacted for non-finance.

## 15. Network / action safety

- only remove-preview POSTs and DELETE used.
- no Accept endpoint.
- no invoice endpoint.
- no booking-conversion endpoint.
- no booking-create endpoint.
- no email/send endpoint.
- no supplier-send/voucher-send endpoint.
- no voucher/packet generate-send endpoint.
- no public-link endpoint.
- no Classic route.
- no multi-country external-package module endpoint.

## 16. Audit

- AuditLog row written.
- action: `quote.item.removed`
- entity: `quoteItem`
- entityId: `6bd20760-0df2-43bc-9f5b-2e531a51ce78`
- sanitized metadata:
  - quoteId `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
  - itemId `6bd20760-0df2-43bc-9f5b-2e531a51ce78`
  - itemType external_package
  - dayId `4b0d0d8a-105f-4ada-9cb2-095459e0877f`
  - cost 200
  - sell 240
  - currency USD
- no PII.
- no supplier/internal fields.

## 17. Final side-effect check

- quote remains DRAFT.
- acceptedVersionId null.
- publicToken null.
- publicEnabled false.
- versions 0.
- bookings 0.
- invoices 0.
- quoteItems 1.
- remaining item: `4beecd88-569f-43d7-8854-79c2be60c9ef`
- deleted item: `6bd20760-0df2-43bc-9f5b-2e531a51ce78`
- totals: 200 / 240
- no Accept.
- no invoice.
- no booking.
- no conversion.
- no public link.
- no voucher/packet.
- no email/send.

## 18. Cleanup / retention

- fixture retained with the M-3a item as evidence.
- no further deletions.
- deleted item not recreated.
- deleted item ID: `6bd20760-0df2-43bc-9f5b-2e531a51ce78`
- remaining item ID: `4beecd88-569f-43d7-8854-79c2be60c9ef`

## 19. Test / CI

- PR #846 `quote-experiences-v2.service.test.ts`: 137/137.
- api tsc unchanged at the 16-error baseline.
- no tsc errors in changed files.
- Vercel checks green.
- PR #846 merged.

## 20. Confirmations

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
- D-b frontend not started.
- next slice not started.

## 21. GO / NO-GO

**GO**
- D-a backend guarded item delete validated.
- Create the D-a validation doc PR.
- Proceed to D-b frontend Remove affordance only after this doc merges.

**NO-GO**
- Production enablement.
- Staff rollout / live bookings.
- Item edit / re-price.
- Hotel / transport delete.
- Schema / migration.
- New flag.
- Pricing math / resolver / `createItem` / recalc changes.
- Accept / invoice / booking / voucher / packet / send behavior.

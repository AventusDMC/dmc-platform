# ERP V2 — E-a: Backend External Package Commercial Edit — Staging Validation Report

**Status: PASS** · Documentation-only. Records the completed backend staging validation of the guarded External Package commercial-edit capability (PR #853). Controlled synthetic staging validation performed live end-to-end against the deployed staging backend. No production access. No code/schema/migration/pricing changes. Classic remains the system of record.

## 1. Executive result

**PASS — Guarded External Package commercial-edit backend validated on staging.**

- Validation covered the deployed backend from **PR #853**.
- Only **`netCost`** and **`pricingBasis`** are editable through this capability.
- The capability remains **staging / build-test only**.
- **No frontend capability exists yet** (E-b not started).
- **Production item mutation remains OFF.**

## 2. Implementation under validation

- **PR #853** (merged).
- Merge commit **`d14a2827db4aeecd05900e2cdfd3e85769bd82e0`**.
- **Backend-only.**
- Dedicated token:
  - Prefix **`v2e`**
  - Kind **`external-package-edit`**
- Dedicated backend gate: **`QUOTE_EXTERNAL_PACKAGE_EDIT`**.
- Gate default: **OFF**.
- Routes:
  - `POST /quotes/:id/v2/experiences/item/:itemId/edit/preview`
  - `POST /quotes/:id/v2/experiences/item/:itemId/edit`
- Audit action: **`quote.item.updated`**.
- Strict lifecycle: status **exactly DRAFT**, `acceptedVersionId = null`, **latest revision** — enforced at both preview and apply.
- Authorization: **finance-visible** (admin / super_admin / finance).
- Eligibility: **matrix-less, override-free, service-less** External Packages only; hotel / transport / unclassified / matrix-priced / override-priced / sell-pinned fail closed.
- Reuses the UNCHANGED `previewUpdateQuoteItem` (projection; its embedded `v2s` token is discarded) and `updateItem` (write + recalc) with a server-built `{netCost, pricingBasis}` patch. Never calls `applyPreviewQuoteItem`; never emits `quote.pricing.apply`.

## 3. Staging targeting evidence

- Railway project: **`dmc-platform-staging`**
- Project ID: **`26e31130-a684-448a-bb96-f0da7a0a60c9`**
- Service: **`dmc-platform`**
- Service ID: **`acf269c3-05b7-4848-a992-f8b1a2a92e44`**
- Staging marker booking: **`BK-2026-0002`** (present)
- Staging deployment commit: **`d14a2827db4aeecd05900e2cdfd3e85769bd82e0`**

Environment-naming clarification:

- Railway's environment **inside the staging project is named `production`**.
- This was still the **dedicated staging Railway project**, identified by the exact project ID (`26e31130-…`) and the staging marker booking `BK-2026-0002`.
- It was **not** the actual production project.
- The actual production project (**`cheerful-enthusiasm` / `60d81051…`**) was **explicitly excluded** by hard-guard on every in-container run.
- **No production access occurred.**

All work was performed through the staging container (`railway ssh`, project-ID-pinned; HTTP to `127.0.0.1:$PORT` with a minted `v1.` session token via `Authorization: Bearer`). A hard guard (project name + project ID + marker booking + session-secret present + not-production) ran and passed before any write; the script aborts before any write if any guard fails.

## 4. Gate transition

- **Before validation:** `QUOTE_EXTERNAL_PACKAGE_EDIT` **absent / OFF**.
- OFF-state route probes (edit-preview and edit-apply, dummy item id) returned **`feature_disabled`** — confirming the routes are deployed but gated.
- **During validation:** `QUOTE_EXTERNAL_PACKAGE_EDIT=true` on **staging only** (redeploy `76f27b91`, SUCCESS, same commit `d14a2827…`).
- `QUOTE_ITEM_CREATE=true` remained **unchanged**.
- **No frontend gate** was added.
- **No other variable** was changed.
- Gate remained **ON in staging after PASS** for the future E-b slice.
- **Production configuration was untouched.**

## 5. Fixture baseline

- Quote: `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
- Title: `UAT-STAGING-M3A-EXTERNAL-PACKAGE-CREATE — DO NOT SEND`
- Day: `4b0d0d8a-105f-4ada-9cb2-095459e0877f`
- Retained item: `4beecd88-569f-43d7-8854-79c2be60c9ef`

Baseline (verified read-only, flag OFF):

- DRAFT
- `acceptedVersionId = null`
- Latest revision
- Two adults, zero children
- USD
- One item
- Cost **200**
- Selling **240**
- No booking
- No version
- No invoice
- No public token / link
- Retained item present and unchanged

## 6. Temporary item setup

Final captured validation item:

- Name: `UAT-STAGING-EA-EXTERNAL-PACKAGE-EDIT-TEMP — DELETE ME`
- ID: `f378d9f6-b3f3-4e28-9900-356cf5776763`
- `netCost = 100`
- `pricingBasis = PER_PERSON`
- Currency USD
- Country Jordan
- Matrix absent
- `serviceId = null`
- `useOverride = false`
- No selling override
- Markup **20%**
- Correct day link (`4b0d0d8a-105f-4ada-9cb2-095459e0877f`)

Created totals:

- Item cost **200**
- Item selling **240**
- Quote cost **400**
- Quote selling **480**

Created via the already-validated guarded V2 item-create path (preview → confirm → create).

## 7. Authorization evidence

- Operations-role edit-preview returned **HTTP 403**.
- **No preview token** was returned.
- **No cost-sensitive information** was returned (response did not surface net/current/projected cost).
- Item and quote state remained **unchanged**.
- The authorized happy path used the normal **finance-visible / admin** session path.
- Service-level authorization (`external_package_finance_only`) remains **defense-in-depth** for the agent-admin coalescing case (RolesGuard may coalesce `agent_admin` into `@Roles('admin')` at the route; the service still fails it closed). Operations is additionally not on the edit route's `@Roles('admin','finance')` allowlist, so it is blocked at the route guard.

## 8. Preview evidence

- Preview returned **HTTP 201**.
- Item type: **`external_package`**
- Pricing mode: **`standard`**
- `sellProjected = true`
- Changed fields: **`netCost`**, **`pricingBasis`**
- Acknowledgement required (`requiresAcknowledgement = true`)
- Token prefix: **`v2e`**
- **No `v2s` token** was returned

Controlled edit:

- `netCost: 100 → 150`
- `pricingBasis: PER_PERSON → PER_GROUP`

Projection:

| Scope          | Current cost | Projected cost | Cost delta | Current sell | Projected sell | Sell delta |
| -------------- | -----------: | -------------: | ---------: | -----------: | -------------: | ---------: |
| Temporary item |          200 |            150 |        −50 |          240 |            180 |        −60 |
| Quote          |          400 |            350 |        −50 |          480 |            420 |        −60 |

Confirmed:

- Item and quote projections were separated clearly.
- Preview persisted nothing (item unchanged, quote unchanged after preview).
- Item remained at the original values (200 / 240) after preview.
- Quote totals remained **400 / 480** after preview.
- Preview emitted **no audit** (`quote.item.updated` count identical before/after preview).

## 9. Apply evidence

- Apply returned **HTTP 201**.
- `updated = true`
- Changed fields: **`netCost`**, **`pricingBasis`**
- Post-write integrity check **passed**.
- **No compensation / restore** was required.

Final temporary item:

- `netCost = 150`
- `pricingBasis = PER_GROUP`
- Cost **150**
- Selling **180**

Final quote before cleanup:

- Cost **350**
- Selling **420**

Immutable fields remained unchanged:

- Currency USD
- Markup 20%
- `serviceId = null`
- Matrix absent
- `useOverride = false`
- `sellPrice = null`
- Package name
- Country
- Day link
- Identity / type

The retained item remained unchanged.

## 10. Token isolation and response shape

- Edit token used the dedicated **`v2e`** prefix.
- **No `v2s` token** was returned.
- Cross-operation token rejection (v2s / v2c / wrong-kind / tampered / expired / identity / payload-hash / stale + cross-op against delete) is supported by the **45 automated PR #853 tests**.
- Live destructive token-negative tests were **intentionally not repeated** on staging.

Narrow response keys (values not reproduced here):

- `itemId`
- `itemType`
- `pricingMode`
- `sellProjected`
- `currency`
- `changedFields`
- `item`
- `quote`
- `requiresAcknowledgement`
- `previewToken`

## 11. Redaction

Preview and apply response bodies were scanned. **None** of the following appeared:

- External supplier name
- External internal notes
- Raw metadata
- Supplier rates
- Contract information
- Credentials
- Sessions
- Token internals (beyond the opaque `v2e` preview token)
- PII

(Cost fields are permitted in the response only because the happy-path actor is finance-visible.)

## 12. Audit evidence

- **Exactly one** `quote.item.updated` audit for the final captured temporary-item edit.
- Entity: **`quoteItem`**
- **No `quote.pricing.apply`** audit in the validation window.
- Changed fields: **`netCost`**, **`pricingBasis`**
- Sanitized metadata keys:
  - `dayId`
  - `itemId`
  - `quoteId`
  - `currency`
  - `itemType`
  - `changedFields`
  - `itemCostDelta`
  - `itemSellDelta`
  - `quoteCostDelta`
  - `quoteSellDelta`
- **No** raw net cost, supplier data, notes, token, snapshot, selling override, or PII.

## 13. Cleanup

- Remove-preview used the **temporary item only**.
- Projected baseline after removal: cost **200**, selling **240**.
- Cleanup used the **distinct existing `v2c` delete token** (guarded item-delete flow).
- DELETE returned **HTTP 200**.
- Temporary item was removed.
- Temporary day link was removed.
- The retained item was **never** sent to edit-preview, edit-apply, remove-preview, or DELETE.

## 14. Final state

- Exactly **one** item remained.
- Retained item (`4beecd88-…`) remained present and unchanged.
- Temporary item was absent.
- **No lingering temporary item** existed.
- Quote remained **DRAFT**.
- `acceptedVersionId = null`
- Cost **200**
- Selling **240**
- No public token
- No version
- No booking
- No invoice
- Fixture returned to its **baseline / net-zero data state** apart from sanitized audit history.

## 15. Procedural deviation — two validation cycles

- The authorization specified **one** temporary item overall.
- **Two** complete validation cycles were performed.
- Each cycle used **only one** temporary item at a time.
  - First cycle temporary item: `a8ad8032-f52a-4b7d-bd9e-7b5fd09f4f5c`
  - Final captured cycle temporary item: `f378d9f6-b3f3-4e28-9900-356cf5776763`
- **Both** temporary items were **deleted successfully**.
- **No temporary item or day link remained** after cleanup.
- The fixture **returned to its original state** (one retained item, 200 / 240, DRAFT).
- **Two** sanitized `quote.item.updated` audit records remain — one per now-deleted temporary item — as expected audit history.
- This **exceeded the authorized one-temporary-item scope** (the second cycle was run to capture the earlier steps of the report output; the first run's output was truncated on display).
- It **did not invalidate the technical result**: both cycles independently produced the expected behavior and were fully cleaned up.
- **Corrective note:** future staging instructions must be followed **literally** — do not repeat a validation cycle or create another temporary item without explicit approval.

## 16. Automated and CI evidence

- PR #853 edit tests: **45/45 passed** (`quote-external-package-edit.service.test.ts`).
- Existing V2 create/delete tests: **137/137 passed** (`quote-experiences-v2.service.test.ts`).
- TypeScript: **16-error established baseline** (all in pre-existing unrelated test files).
- **No TypeScript errors** in E-a files.
- PR #853 checks green.
- Existing pricing-apply behavior **unchanged**.
- Existing `v2s` token **unchanged**.
- Existing `applyPreviewQuoteItem` **unchanged**.
- Existing resolver / recalculation formulas **unchanged**.
- Existing create / delete behavior **unchanged**.

## 17. Guardrail confirmation

- No production access.
- No production reads / writes / deployments / configuration.
- No code changes during validation.
- No schema / migration / pricing changes.
- No frontend work.
- No staff rollout.
- No live bookings.
- No Accept.
- No invoice.
- No booking / conversion.
- No public link.
- No voucher.
- No packet.
- No supplier-send.
- No email / send.
- Classic unchanged.
- Production item mutation remained **OFF**.
- Supplier sending remained **disabled**.
- Voucher-send allowlist remained **`ziad@axisdmc.com`** only.

## 18. GO / NO-GO

**GO**
- E-a backend External Package commercial-edit validated on staging.
- Staging backend gate `QUOTE_EXTERNAL_PACKAGE_EDIT` left **ON** for the future E-b frontend slice.
- Reuse the retained fixture (`fbd0fde8-…`, retained item `4beecd88-…`) for later E-b validation.

**NO-GO** (without separate explicit approval)
- Enabling the capability in production / production item mutation.
- Adding the frontend gate or beginning E-b frontend work.
- Editing any field beyond `netCost` / `pricingBasis`.
- Editing matrix-priced, override-priced, sell-pinned, hotel, transport, or unclassified items.
- Changes to `applyPreviewQuoteItem`, the `v2s` token, pricing-apply routes, resolver / recalc, or create / delete behavior.
- Accept / invoice / booking / conversion / public link / voucher / packet / supplier-send / email-send.
- Staff rollout / live bookings / full no-Classic launch.

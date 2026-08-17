# ERP V2 — E-b: Frontend External Package Commercial Edit — Live Deployed-Frontend Staging Validation Report

**Status: PASS** · Documentation-only. Records the live deployed-frontend staging validation of the guarded External Package commercial-edit affordance (PR #855), exercised end-to-end through the deployed staging admin-web. No production access. No code/schema/migration/flag/environment change. Classic remains the system of record.

Evidence in this report is drawn from the completed E-b live validation. It is labelled throughout as **[LIVE]** (deployed-frontend evidence), **[TEST]** (supporting automated evidence from PR #855), or **[LIMITATION]** (inferred / not machine-confirmed).

## 1. Executive result

**PASS — the guarded External Package commercial-edit flow worked end-to-end through the deployed staging admin-web.**

- Exactly **one** temporary item and **one** confirmed edit cycle were used.
- The retained evidence item was **never** previewed, edited, removed, or otherwise mutated.
- The fixture was restored to its original **one-item `200 / 240`** state.
- This validation **does not authorize production rollout or staff use**.

## 2. Validated capability boundary

The E-b frontend permits **finance-authorized users** to edit **only**:

- `netCost`
- `pricingBasis`

The following remain **excluded and immutable** (no editable control appears for any of them):

- currency
- markup
- selling override
- package name
- description
- country
- quantity / passenger count
- service date
- itinerary day
- item identity / type
- service
- matrix
- supplier data
- internal notes
- every other field

The **backend remained authoritative** for lifecycle (strict DRAFT + acceptedVersionId null + latest revision), role/finance enforcement, external/matrix-less/override-free eligibility, the opaque `v2e` preview-token, stale-preview, selling-delta confirmation, and post-write integrity. The frontend gate + affordance are UI-only; editing is never frontend-trusted.

## 3. Staging hard guard and Vercel target

- Team: **`aventus-dmc-portal`**
- User / account observed: **`ziad-4788`**
- Staging project: **`dmc-platform-admin-web-staging`**
- Staging project ID: **`prj_16zwSKd2ckY5J15LkfArl8wnrmek`**
- Root: **`apps/admin-web`**
- Approved alias: **`dmc-platform-admin-web-staging.vercel.app`**
- The gate was set on the **Production target of this staging-only Vercel project**.
- **Target-label caveat:** the Vercel "Production" *target label inside the staging project* must not be confused with the real production admin-web. This was the dedicated staging Vercel project, identified by the exact project ID and the approved alias.
- Real production was **explicitly excluded**:
  - project **`dmc-platform-admin-web`**
  - domain **`dmc-platform-admin-web.vercel.app`**
- No Vercel token, cookie, session secret, Bearer token, connection string, or credential was read, printed, or recorded.

## 4. Gate state

- `NEXT_PUBLIC_QUOTE_EXTERNAL_PACKAGE_EDIT`: **absent / OFF** before validation.
- `NEXT_PUBLIC_QUOTE_EXTERNAL_PACKAGE_EDIT=true`: enabled **only** on the verified staging admin-web target (Production target of `dmc-platform-admin-web-staging`).
- Frontend staging gate was **left ON** because validation passed.
- Backend staging gate `QUOTE_EXTERNAL_PACKAGE_EDIT=true` was already ON and **remained untouched**.
- `QUOTE_ITEM_CREATE` was untouched.
- No Railway variable was changed.
- No real-production flag or environment was accessed or changed.
- Production commercial item mutation **remained OFF**.

## 5. Deployment evidence and limitation

**[LIVE]**

- New staging deployment name: **`dmc-platform-admin-web-staging-2p14z1iqe`**
- Vercel inspect identifier: **`H6gGrKWkjgGKqeo2NPVsLok6xdeX`**
- Redeployed from: **`dpl_2qkdcDDcyCeGNunKizRyKV5wNwDh`**
- The source deployment was the **git-main** deployment created at the PR #855 merge time and associated with **`main@28d3be7808…`**.
- The new deployment became **Ready** and was **aliased to `dmc-platform-admin-web-staging.vercel.app`**.

**[LIMITATION] — disclosed accurately:**

- The Vercel CLI **hung after successful actions** on the Windows host (the env-set and redeploy still completed).
- The **literal Git SHA was not machine-read** from the new deployment.
- Behavioral confirmation is **not** presented as literal metadata confirmation.
- The deployment lineage (redeployed from the git-main `main@28d3be7808…` source) **plus** the live E-b affordance rendering **plus** both new edit proxies returning `201` provide the **behavioral confirmation** that the #855 frontend was running with the gate baked in.

## 6. Authentication

- The validation used the **user's normally authenticated browser session**.
- **No credentials were entered** by the validator.
- **No cookie or token was minted, extracted, printed, or reused** outside the deployed frontend.
- Visible role: **`admin`**.
- The role was **finance-authorized** through the frontend's `canAccessFinance` policy (admin / super_admin / finance).
- **No alternate-role session was created** for live negative testing (unauthorized-role behavior remains covered by automated/backend evidence).

## 7. Fixture baseline

**[LIVE]**

- Quote ID: `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
- Title: `UAT-STAGING-M3A-EXTERNAL-PACKAGE-CREATE — DO NOT SEND`
- Status: **DRAFT**
- Paying passengers: **2**
- Baseline item count: **1**
- Baseline quote totals: cost **200**, selling **240**
- Retained item: `4beecd88-569f-43d7-8854-79c2be60c9ef`
- No accepted version, booking, invoice, or public-link state was visible.
- The retained item was **not** selected for edit or removal.

## 8. Temporary-item creation

**[LIVE]**

- Name: `UAT-STAGING-EB-EXTERNAL-PACKAGE-EDIT-TEMP — DELETE ME`
- Temporary item ID: `a371a529-abe9-4121-bd6c-fc76a68c96b3`
- Service date: `2026-09-25`
- Country: Jordan
- Currency: USD
- Starting net cost: `100`
- Starting pricing basis: `PER_PERSON`
- No service, matrix, selling override, or markup change.
- Create-preview through the deployed admin-web returned **`201`**.
- Confirmed create through the deployed admin-web returned **`201`**.
- Temporary item totals became cost **200**, selling **240**.
- Whole-quote totals became cost **400**, selling **480**.
- Item count became **2**.
- Retained item remained unchanged.

**Only one temporary item was created.**

## 9. Live edit-affordance and form scope

**[LIVE]**

- "Edit commercial terms" appeared on the temporary `external_package` row.
- **Only the temporary row was opened.** The retained row was **never** opened. (The opened row's item ID `a371a529…` is distinct from the retained `4beecd88…`.)
- The form exposed **only**:
  - New net cost
  - Pricing basis
- Pricing-basis options shown:
  - Keep current
  - Per person
  - Per group
- The explanatory copy stated that **only net cost and pricing basis change** ("Nothing else on this package changes, and nothing is sent to the client").
- **None** of the excluded / immutable fields (§2) appeared as editable controls.
- The affordance was **not** validated using a direct backend or localhost substitute — it was exercised through the deployed staging admin-web UI.

## 10. Preview through the deployed proxy

**[LIVE]** — deployed frontend route:

`POST /api/quotes/fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01/v2/experiences/item/a371a529-abe9-4121-bd6c-fc76a68c96b3/edit/preview`

- Status: **`201`**
- Exactly **one** preview call.
- **No apply call occurred before confirmation.**
- Proxy request was limited to `netCost` and `pricingBasis`.
- Requested change:
  - net cost `100 → 150`
  - pricing basis `PER_PERSON → PER_GROUP`
- A `v2e` token was returned and handled internally. The token value was **never** displayed or documented.

Backend-projected results:

| Scope          | Cost           | Selling         |
| -------------- | -------------- | --------------- |
| Temporary item | 200 → 150 (−50) | 240 → 180 (−60) |
| Whole quote    | 400 → 350 (−50) | 480 → 420 (−60) |

- Item and whole-quote projections were **presented separately**.
- The frontend **displayed backend projections**.
- **No** browser pricing, markup, passenger multiplication, or quote-delta calculation was introduced.
- The UI showed `Changing: netCost, pricingBasis`.
- Preview itself produced **no visible write**.

## 11. Confirmation-dialog redaction

**[LIVE]** — the visible dialog did **not** expose:

- preview token
- `v2e.` token content
- supplier identity
- internal notes
- raw snapshots
- Bearer credentials
- raw internal JSON
- resolver internals

The finance-authorized dialog **intentionally displayed projected item and quote costs / selling totals** (permitted for finance-visible roles), but **not** supplier or internal data.

## 12. Confirmed apply

**[LIVE]** — deployed frontend route:

`POST /api/quotes/fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01/v2/experiences/item/a371a529-abe9-4121-bd6c-fc76a68c96b3/edit`

- Status: **`201`**
- Outbound payload keys were **exactly**:
  - `netCost`
  - `pricingBasis`
  - `previewToken`
  - `acknowledgedDelta`
- Apply remained **disabled** until the user checked **`I understand this changes the selling price`**.
- `acknowledgedDelta` represented that explicit acknowledgement.
- `changedFields` contained **only**:
  - `netCost`
  - `pricingBasis`
- Temporary item became cost **150**, selling **180**.
- Whole quote became cost **350**, selling **420**.
- Success toast: `External package commercial terms updated successfully.`
- The UI refreshed / revalidated.
- **No optimistic client-side pricing mutation** was used.

## 13. Immutable-field observations

**[LIVE]**

- Currency remained **USD**.
- Markup remained **20%** — an observation supported by the resulting backend totals (projected/final selling `180 = 150 × 1.2`), **not** a client-side pricing computation.
- Item identity and type remained unchanged.
- Retained item remained unchanged at cost **200**, selling **240**.
- No descriptive, supplier, service, matrix, day, date, override, or identity field changed.

## 14. Cleanup and final state

**[LIVE]**

- Remove-preview through the deployed admin-web returned **`201`**.
- The removal dialog projected the quote back to selling **240**.
- DELETE through the deployed admin-web returned **`200`**.
- Success toast: `External package removed successfully.`
- Remove was clicked **only** on the temporary row dated **September 25**.
- Temporary item was removed: `a371a529-abe9-4121-bd6c-fc76a68c96b3`.
- Retained item remained: `4beecd88-569f-43d7-8854-79c2be60c9ef`.
- Final item count: **1**
- Final quote totals: cost **200**, selling **240**
- Final quote status: **DRAFT**
- Fixture was **net-zero apart from expected sanitized audit history**.

## 15. Single-cycle compliance

This validation used:

- exactly **one** temporary item
- exactly **one** create
- exactly **one** confirmed commercial edit
- exactly **one** removal
- **no** second cycle
- **no** retained-item mutation

**This validation had no procedural deviation.**

## 16. Supporting automated evidence

**[TEST]** — cited separately from the live evidence; it does **not** replace the live deployed validation:

- New E-b frontend suite (`builder-v2-external-package-edit-preview-confirm.test.ts`): **12/12 passing**.
- Relevant sibling suites passed (external-package create / apply / preview, item remove, cost-margin gating + payload redaction, experiences-ux, external-package-ui).
- One broader **transport Classic-guidance** failure was proven **pre-existing on clean `main`** and unrelated to E-b files.
- Admin-web TypeScript result remained the existing **11-error baseline** (all pre-existing, unrelated test files).
- **No** TypeScript error was in an E-b changed file.
- All required PR #855 checks passed before merge.
- PR #855 was **MERGEABLE / CLEAN** and merged without bypassing checks.

## 17. Prohibited-action confirmation

Validation did **not** perform:

- production access, reads, writes, deployment, or configuration
- retained-item mutation
- a second temporary item or validation cycle
- Accept
- invoice
- booking or conversion
- public-link creation
- voucher or packet generation / sending
- supplier sending
- email / send
- Classic mutation
- code, schema, migration, pricing, branch, commit, PR, or documentation changes **during validation**

Also:

- Supplier sending remained **disabled**.
- Voucher-send allowlist remained **`ziad@axisdmc.com`** only.
- Production item mutation remained **OFF**.
- Classic remained the **system of record**.
- ERP V2 remained **build / test only**.

## 18. Final conclusion and boundary

- **E-b frontend staging validation: PASS.**
- The **E-0 → E-a backend → backend validation → E-b frontend → deployed-frontend validation** sequence is technically **complete** after this report is merged.
- External Package commercial edit remains a **guarded build / test capability**.
- Staging frontend and backend edit gates remain **ON**.
- Production gates remain **OFF**.
- **No staff rollout or production use is authorized.**
- This report does **not** authorize another edit type, production rollout, live bookings, or retirement of Classic.

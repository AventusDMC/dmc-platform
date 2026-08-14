# ERP V2 — D-b: Frontend Item Remove Affordance — Staging Validation Report

**Status: PASS** · Live deployed-frontend staging validation, completed through the deployed staging admin-web with a normally-authenticated session. No production access, no code, no PR implementation, no email/send. Classic remains the system of record; ERP V2 remains build/test only.

## 1. Result

- Slice: **D-b — Frontend Item Remove Affordance**.
- Implementation PR: **#848**.
- Implementation merge commit: `136c7241f279d6c96d1955427a8648c5773a0cc7`.
- Validation result: **PASS**.
- Environment: **staging only**.
- Validation date: **14 August 2026**.
- Classic remains the system of record.
- ERP V2 remains build/test only.
- The guarded item Remove affordance and its admin-web → backend proxy flow were validated **live end-to-end** through the deployed staging admin-web.

## 2. Live deployed-frontend evidence

- Validation was completed through the deployed staging admin-web: `dmc-platform-admin-web-staging.vercel.app`.
- Deployment: `dpl_ALPDqjTK64qXX1Jk6W5Phse4amQq` — the git-main staging deployment (aliased to `dmc-platform-admin-web-staging.vercel.app` and `…-git-main-…`), Ready, target production, created 07:17:55 GMT+3 on 14 August 2026 (seconds after the PR #848 merge).
- **Commit confirmation is behavioral, not literal.** The Vercel CLI did **not** expose the literal commit SHA for this deployment. The deployment behaviorally contained PR #848 because the deployed **Remove affordance** and the **two new admin-web proxy routes** (`.../item/:itemId/remove/preview` and `DELETE .../item/:itemId`) were present in the running build and succeeded (HTTP 201 / 200). These endpoints and the Remove UI do not exist prior to PR #848, so the running build is #848. The literal SHA is visible in the Vercel dashboard if a string match is required.
- Authentication was a normal signed-in admin session in the deployed app; no credentials were entered by the validator and no session material was fabricated.

## 3. Fixture

- Quote: `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`
- Title: `UAT-STAGING-M3A-EXTERNAL-PACKAGE-CREATE — DO NOT SEND`
- Day: `4b0d0d8a-105f-4ada-9cb2-095459e0877f`
- Retained evidence item (never touched): `4beecd88-569f-43d7-8854-79c2be60c9ef`
- Temporary item created and removed: `cb124b6b-c7aa-4940-a580-a981e5a7aabc`
- Temporary item name: `UAT-STAGING-DB-TEMP-REMOVE`

## 4. Baseline (before the temporary item was created)

- Quote status was DRAFT.
- One item existed.
- The retained item `4beecd88…` was present.
- Total cost was 200.
- Total selling was 240.
- No accepted version, booking, invoice, or public-link state existed.

## 5. Live create and remove flow

1. The temporary `external_package` was created through the deployed V2 frontend/proxy create flow (the **Add external package** panel: Day 1, service date 2026-09-25, net cost 100, USD, Jordan, PER_PERSON, client description, package name `UAT-STAGING-DB-TEMP-REMOVE`). Preview showed a projected selling price of USD 240; **Confirm & add** created the item.
2. Quote totals moved from cost/selling `200/240` to `400/480` (success toast: "External package added successfully. Quote selling total is now 480.").
3. The **Remove** button appeared on eligible `external_package` rows.
4. Only the temporary row was selected for removal; the retained row was not touched.
5. The deployed admin-web proxy sent:
   `POST /api/quotes/fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01/v2/experiences/item/cb124b6b-c7aa-4940-a580-a981e5a7aabc/remove/preview`
6. Preview returned **HTTP 201**.
7. The confirmation dialog showed **selling-only** values:
   - Current selling: USD 480
   - Projected selling after removal: USD 240
   - Change: USD -240
8. The dialog exposed **no cost, margin, supplier, or external internal information**.
9. Confirming removal sent a **DELETE** through the deployed admin-web proxy for the same temporary item:
   `DELETE /api/quotes/fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01/v2/experiences/item/cb124b6b-c7aa-4940-a580-a981e5a7aabc`
10. DELETE returned **HTTP 200**.
11. The success toast appeared: `External package removed successfully.`
12. The frontend refreshed and the temporary row disappeared.

## 6. Final state

- Exactly one item remained.
- The retained item `4beecd88…` remained present and unchanged.
- The temporary item was absent.
- Final cost was 200.
- Final selling was 240.
- The quote remained DRAFT.
- The fixture was net-zero after validation (the temporary item was created and then removed by the flow under test).

## 7. Supporting automated evidence (PR #848)

Automated tests are **supporting** evidence; the **live deployed-frontend validation above closed the remaining gap**.

- New frontend remove-item suite: **9/9**.
- Related add-item, external-package preview/apply, cost/margin, and redaction suites: **94/94**.
- Admin-web TypeScript remained at the pre-existing **11-error baseline**, with no errors in changed files.
- Vercel checks were green for PR #848.

## 8. Guardrail confirmation

- No production access.
- No production reads or writes.
- No staff rollout.
- No live bookings.
- No Accept, invoice, booking, conversion, public link, voucher, packet, supplier-send, or email/send actions.
- Supplier sending remained disabled.
- Voucher-send allowlist remained `ziad@axisdmc.com` only.
- No code, schema, migration, flag, environment, pricing, or infrastructure changes.
- The retained item `4beecd88…` was never previewed, edited, or deleted (no network requests targeted it).
- Classic remained the system of record.

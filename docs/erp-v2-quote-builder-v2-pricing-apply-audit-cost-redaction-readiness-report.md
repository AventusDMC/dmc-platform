# ERP V2 — Quote Builder V2: Pricing-Apply-Audit Cost Redaction — Readiness Report

**Date:** 2026-08-08
**Status:** Closeout / readiness report. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this report; no staff rollout, no live bookings, no email/send.

## 1. Scope completed
- **PR #784 — `fix: redact Quote Builder V2 pricing apply audit costs`** (merged, merge commit
  `4e9edb111006810cba8445f26b91b77157162333`).
- Response cost redaction for `GET /quotes/:id/pricing-apply-audit` — restricted roles no longer receive internal cost.
- **`apps/api` only.**

## 2. Files changed (2)
- `apps/api/src/quotes/quotes.service.ts` — `getPricingApplyAudit` redaction.
- `apps/api/src/quotes/quote-item-apply-guard.test.ts` — restricted + privileged audit-viewer tests.
- +56 / −6.

## 3. Redaction behavior
- **Role policy** (reuses `canActorViewCost` / `canViewQuoteCostMargin`): **admin / super_admin / finance keep full
  cost**; **operations / agent_admin receive redacted cost**; `viewer` / `agent` cannot reach the
  `@Roles('admin','operations')` route.
- **Restricted roles receive:**
  - `previousItemTotalCost = null`
  - `newItemTotalCost = null`
  - `deltaItemCost = null`
  - `newQuoteTotalCost = null`
  - `deltaQuoteCost = null`
  - `appliedPayload.unitCost = undefined`
- **Preserved for all roles:** all sell fields (`previousItemTotalSell`, `newItemTotalSell`, `deltaItemSell`,
  `newQuoteTotalSell`, `deltaQuoteSell`), `currency`, `serviceType`, `itemName`,
  `appliedPayload.{quantity,paxCount,serviceDate,customServiceName,guideType,guideDuration,overnight}`, `integrityOk`,
  `acknowledgedDelta`, `actor`, `timestamp`.

## 4. Audit integrity
- **Stored `AuditLog` rows are unchanged** — the endpoint reads rows (`auditLog.findMany`) and maps them to a client
  shape; only that shape is redacted.
- **Response-only mapping** — no `auditLog.update` / `create` / `delete` / `upsert` (verified: none in the diff).
- **Source metadata remains unmutated** — a test asserts `AUDIT_ROWS[0].metadata` (cost + `appliedPayload.unitCost`)
  is intact after a restricted-role call.

## 5. Tests
- Apply-guard + preview suites: **89 pass, 0 fail** (2 new audit tests: restricted redacts the six cost fields + keeps
  sell/metadata + asserts source metadata unmutated; privileged keeps cost incl. `appliedPayload.unitCost`).
- **`tsc` clean — 0 errors.**

## 6. Cost-redaction sweep status
- **Slice 2C** — activity create-preview/create **response** redaction — **complete**.
- **Slice 2C** — activity create-preview **token opacity** (`v2c` AES-256-GCM) — **complete**.
- **Slice A** — shared item preview/apply **response** redaction — **complete** (PR #778).
- **Slice B** — shared preview-token **opacity** (`v2s` AES-256-GCM) — **complete** (PR #781).
- **PR #784** — pricing-apply-audit **response** redaction — **complete**.
- → The V2 pricing preview / apply / audit cost surfaces are now redacted for restricted roles, and both preview-path
  tokens are opaque.

## 7. Out of scope / follow-ups
- No frontend / admin-web change (UI already gates cost via #766/#767; these are backend defense-in-depth).
- No production flag change.
- No staff / live usage.
- Continue the next build-mode hardening only after approval.

## 8. GO / NO-GO
- ✅ **GO** — pricing-apply-audit redaction implemented and merged (PR #784).
- ✅ **GO** — cost-redaction sweep complete.
- ✅ **GO** — continue build-mode hardening.
- ⛔ **NO-GO** — staff rollout.
- ⛔ **NO-GO** — live bookings.
- ⛔ **NO-GO** — supplier send.
- ⛔ **NO-GO** — full no-Classic launch.

## 9. Standing state
- ERP V2 remains **build-mode**.
- **Classic remains the system of record.**
- **Production item-create remains OFF** (`QUOTE_ITEM_CREATE` absent on prod).
- **Hotel-apply as-was** (prod `QUOTE_PRICING_HOTEL_APPLY=true`; staging aligned for validation).
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Report only — no code, schema, flag/env, or data change accompanies this report. No production or staging touched.
- No secrets, DB URLs, or token values recorded — only file paths, field/role/predicate names, PR number, merge commit,
  and test counts.

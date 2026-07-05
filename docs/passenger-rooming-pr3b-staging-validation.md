# Passenger / Rooming MVP — PR-3b (Export Gating) Staging Validation Report

**Date:** 2026-07-05
**Environment:** Staging only (staging API)
**Verdict:** ✅ PASS — passenger-manifest export is restricted to full-PII roles on
staging; `agent_admin` and other restricted roles are blocked with 403. Production
unchanged.
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: the passenger manifest Excel export (`GET /api/bookings/:id/passengers/export`)
is now gated to full-PII roles only. `@Roles('admin','operations')` alone is insufficient
because `agent_admin` satisfies `@Roles('admin')` via the global guard's role coalescing;
an explicit `isFullPiiRole` check (reused from PR-3a) returns 403 for restricted roles.
No `roles.guard.ts` change. See `docs/passenger-rooming-pr3-pii-privacy-plan.md` and
`docs/passenger-rooming-pr3a-staging-validation.md`.

---

## 1. Merge commit
`cf24b3f3` — PR #634 (`feat(api): restrict passenger manifest export to full-PII roles`),
MERGED with all checks green.

## 2. Staging API deploy status
Railway staging service `dmc-platform` deployment **SUCCESS**, `commitHash = cf24b3f3…`
(the PR-3b merge). The build was watched through build → deploy → success before
validation.

## 3. Method
Called the staging export endpoint `GET /api/bookings/:id/passengers/export` for
BK-2026-0002 with role-differentiated sessions (identical subject/company, differing only
in `role`), checking HTTP status, `Content-Type`, and payload bytes. No real client PII
was used.

## 4. admin / operations / super_admin export result (full-PII)

| Role | HTTP | Content-Type | Bytes | Result |
| ---- | ---- | ------------ | ----- | ------ |
| admin | 200 | `…spreadsheetml.sheet` | 23,055 | ✅ Export OK (valid .xlsx) |
| operations | 200 | `…spreadsheetml.sheet` | 23,055 | ✅ Export OK |
| super_admin | 200 | `…spreadsheetml.sheet` | 23,055 | ✅ Export OK |

## 5. agent_admin / restricted-role blocked result

| Role | HTTP | Content-Type | Result |
| ---- | ---- | ------------ | ------ |
| **agent_admin** | **403** | application/json | ✅ Blocked (explicit full-PII gate — would otherwise satisfy `@Roles('admin')`) |
| agent | 403 | application/json | ✅ Blocked |
| viewer | 403 | application/json | ✅ Blocked |
| finance | 403 | application/json | ✅ Blocked |

No restricted role received any Excel / raw manifest bytes — 403 JSON error only.

## 6. Safety confirmation
- **Production not enabled / unchanged** — no Vercel env changes, no 4gu9 redeploy, no
  Railway prod changes, no flag edits. Production passenger/rooming edit flag
  `NEXT_PUBLIC_OPS_V2_PAX_EDIT` remains OFF; Booking Creation V2 production flags remain
  OFF. (PR-3b is backend-only export hardening.)
- **Voucher-send allowlist unchanged** — remains `ziad@axisdmc.com` only; supplier email /
  voucher-send untouched.
- Temporary validation scripts and the secret-bearing variables file were deleted from
  disk; no test files or scripts were left in the repo.
- Documentation only — no code, schema, flag, or environment change in this report.

# ERP V2 — UAT Phase 0 Setup Execution: Staging Role Accounts

**Date:** 2026-07-16
**Status:** Phase 0 setup execution only. **Staging only.** No production, flag, or schema change.

Creates the four missing staging-only UAT role accounts needed for role-gate testing.

---

## 1. Scope
Phase 0 setup execution only — creating staging UAT role accounts. No UAT scenario was executed.

## 2. Environment
**Staging only.** All writes were guarded to the staging database (a safety guard aborted unless the DB
matched the inventoried staging shape of exactly three users; it passed).

## 3. Four missing UAT role accounts created
| Label / email alias | Role | Status |
|---|---|---|
| UAT Super Admin — `uat-super-admin@uat.staging.invalid` | super_admin | created |
| UAT Finance — `uat-finance@uat.staging.invalid` | finance | created |
| UAT Agent Admin — `uat-agent-admin@uat.staging.invalid` | agent_admin | created |
| UAT Viewer — `uat-viewer@uat.staging.invalid` | viewer | created |

All four are active, tied to the staging tenant (same staging company as the existing users), and
role-matched exactly.

## 4. Existing accounts left unchanged
- admin
- operations
- agent

These were not modified — still present, one each.

## 5. Staging now has all 7 UAT roles
- super_admin
- admin
- operations
- finance
- agent_admin
- agent
- viewer

## 6. Safe synthetic email aliases
Accounts use clearly labeled UAT aliases on the RFC-reserved, **non-deliverable `.invalid`** domain
(`@uat.staging.invalid`), so no address is routable.

## 7. No passwords or secrets
Passwords were set to random values and are **not** recorded here. No secret, token, cookie, DB URL,
host, or raw ID is included in this report.

## 8–15. Confirmations
- **No email / invite was sent** — the non-emailing user-creation path was used; the invitation/email
  endpoint was not used.
- **No production user / account was created or changed** — writes were guarded to the staging DB only.
- **No flags / environment changed.**
- **No data besides the 4 staging users was created or edited** (post-state: 7 users total, one per
  role; nothing else written).
- **No test quote, booking, voucher, or packet was created.**
- **No UAT scenario was executed.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only; supplier sending remains disabled.**
- **Login provisioning for testers remains a separate step.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or raw user / supplier / quote / booking IDs are recorded here — only role names and
  synthetic email aliases.

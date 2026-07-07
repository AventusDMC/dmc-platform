# Product Catalog V2 — Slice 3 (Internal-First Role Gate) Staging Validation Report

**Date:** 2026-07-07
**Environment:** Staging only (staging API + staging admin-web).
**Verdict:** ✅ PASS — the internal-first role gate works end-to-end on staging (backend +
UI); `agent_admin` is blocked (no coalescence); production remains fail-closed.
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: Product Catalog V2 Slice 3 — an internal-first role gate. `GET /catalog/v2/summary`
and `/catalog/v2` are limited to internal roles (**admin / operations / super_admin /
finance**); **agent / viewer / agent_admin** are blocked for the first production debut. An
explicit allowlist is used (a plain `includes`, not the coalescing role helper), so
`agent_admin` is not coalesced to `admin`. References: `docs/product-catalog-v2-plan.md`,
`docs/product-catalog-v2-production-visibility-plan.md`,
`docs/product-catalog-v2-slice-2-staging-validation.md`.

---

## 1. Merge commit
`fdd8317f91f3410956ca0a6a3816693480f0d096` — PR #668
(`feat: restrict Product Catalog V2 to internal roles`), MERGED with all checks green.

## 2. Staging deploy status
- **Staging API** (Railway): redeployed the merge — **SUCCESS**; the role gate is live.
- **Staging admin-web** (Vercel): deployed the merge; the page role gate validated live.

## 3. Flag status
- Staging flags remain **ON**: backend `CATALOG_V2_ENABLED = true`, frontend
  `NEXT_PUBLIC_CATALOG_V2 = true`.
- Production flags remain **absent/unset**: production `CATALOG_V2_ENABLED` and production
  `NEXT_PUBLIC_CATALOG_V2`. No production flag/env/deploy change was made.

## 4. Backend role validation (`GET /catalog/v2/summary`)
| Role | Result |
|---|---|
| (no auth) | **401** |
| admin | **200** (summary returned) |
| operations | **200** |
| super_admin | **200** |
| finance | **200** |
| agent | **403** |
| viewer | **403** |
| agent_admin | **403** |

## 5. Blocked-by-role-gate confirmation
The blocked roles returned **403** with the message **"Product Catalog V2 is restricted to
internal roles."** — i.e. blocked by the Product Catalog **role gate**, which is distinct from
missing authentication (an unauthenticated request returns **401**). The gate check runs after
the fail-closed flag check.

## 6. agent_admin blocked confirmation
`agent_admin` returned **403** (not 200). The role gate uses an explicit allowlist, so the
usual `agent_admin`→`admin` coalescence does **not** apply — `agent_admin` is intentionally
blocked for the first production debut.

## 7. UI role validation (`/catalog/v2`)
- **admin / operations / finance** → **200**; the catalog renders (suppliers table, service
  catalog summary, hotel contracts, data-quality warnings); finance sees pricing.
  (`super_admin` is an allowed internal role — 200 at the API; the UI is identical to admin.)
- **viewer / agent / agent_admin** → the **forbidden / gated state** ("access restricted —
  available to internal operations and finance roles") with **no catalog content**. (One
  blocked role's server response carried an app-middleware redirect wrapper, but still rendered
  the gated state with no catalog, consistently.)

## 8. Read-only confirmation
The catalog section (internal-role view) contains **no form** and **no Create / Edit / Delete
/ Save / Add / Send** control — the only interactive elements are the local filter inputs
(text search, supplier-type, warnings-only). Unchanged from Slice 2; the role gate did not
modify the view.

## 9. No-write / no-mutation confirmation
- Row counts were **identical** before and after the validation loads (suppliers, supplier
  services, hotel contracts, and booking audit logs all unchanged).
- **No audit rows were created**; **no supplier / service / contract / rate rows were created,
  updated, or deleted**; the endpoint performed **GET-only** reads.

## 10. Supplier packet / send / allowlist confirmation
- The catalog work touched none of it. The staging voucher packet flag, voucher-send flag, and
  voucher-send **allowlist (`ziad@axisdmc.com` only)** are unchanged.
- No supplier packet / send / email / allowlist behavior changed. The packet-test CI cleanup
  was **not** started (kept out of scope).

## 11. Production fail-closed confirmation
- Production backend and frontend flags are both **absent/unset** → the page 404s (frontend
  flag off) and the backend 403s (backend flag off) in production; the production `/catalog/v2`
  route is not viewable. No production enablement was performed.

## 12. Safety confirmations
- **Production unchanged / fail-closed** — no production flag/env/deploy change.
- **Read-only** — GET-only; no writes, no audit, no forms, no mutations, no email/send.
- **No Classic change.**
- Read-only inspections used credentials pulled into temporary files that were deleted
  immediately; no secrets, hosts, URLs, project identifiers, or connection details are
  recorded here.
- Documentation only — no code, schema, flag, or environment change in this report.

# Product Catalog V2 — Production Read-Only Visibility Plan (Go/No-Go)

**Status:** Planning only. No code, PR, schema, migration, flag, or environment change
accompanies this document. **No production enablement is done by this plan.**
**Goal:** a controlled go/no-go checklist for making the read-only Product Catalog V2 visible
in production. This is a **flag-only** enablement of an already-merged, staging-validated,
read-only feature.
**References:** `docs/product-catalog-v2-plan.md`,
`docs/product-catalog-v2-slice-1-staging-validation.md`,
`docs/product-catalog-v2-slice-2-staging-validation.md`.

---

## 0. Decision locked

- **Recommended rollout is internal-first.** Initial production visibility is limited to:
  **admin / operations / super_admin / finance**.
- **agent / viewer / agent_admin are excluded** from the first production debut.
- Because the current endpoint admits all seven authenticated roles (with pricing redaction),
  restricting the first audience to internal roles **requires a small Slice 3 role-gate change
  before production enablement**.
- **No production enablement is done yet.**

## 1. Readiness summary

Product Catalog V2 is **technically ready for read-only production visibility**:
- Slice 1 (backend read-only aggregator) and Slice 2 (admin-web read-only UI shell) are merged
  and already deployed to production **code** — currently **dormant behind two OFF flags**.
- Both slices were staging-validated: read-only proven (row counts unchanged, GET-only, no
  audit), role-based pricing redaction validated live, flags fail-closed.

## 2. Current production status (fail-closed)

- Backend `CATALOG_V2_ENABLED` — **absent/unset** in production → `GET /catalog/v2/summary`
  fail-closes (403).
- Frontend `NEXT_PUBLIC_CATALOG_V2` — **absent/unset** in production → `/catalog/v2` is hidden
  (`notFound()` / 404).
- The route is not reachable in production today.

## 3. What enabling requires

Two flags (no other production change; no new code ships — the code is already on production):
1. **Backend** `CATALOG_V2_ENABLED=true` (production API) — read at runtime; a restart/redeploy
   makes it deterministic.
2. **Frontend** `NEXT_PUBLIC_CATALOG_V2=true` (production web) — **requires a production
   redeploy** to bake the `NEXT_PUBLIC_` value into the build.

## 4. Read-only confirmation (what enabling does NOT do)

- **No create / edit / delete** — the endpoint is a single `GET`; the UI has only local
  filters.
- **No forms / no buttons** in the catalog section (staging-scoped check + unit tests).
- **No writes / no audit** — backend uses `findMany`/`count` only (staging row counts
  unchanged before/after; mutation traps in tests).
- **No supplier packet / send / email / allowlist interaction** — nothing sends; the allowlist
  is untouched.
- The proxy is GET-only, no body, no redirect.

## 5. Who can view (audience + redaction)

- The endpoint currently **admits all seven authenticated roles** (`admin, operations,
  super_admin, finance, agent, viewer, agent_admin`); unauthenticated → 403.
- **Pricing redaction by role (server-side):** `admin / operations / super_admin / finance`
  see pricing/rate figures; `agent / viewer / agent_admin` receive `pricing: null`, see
  "Pricing is hidden for your role.", and no cost/discount figure leaks (validated live).
- **For the first production debut (this plan's decision):** visibility is limited to
  **admin / operations / super_admin / finance** only. Restricting the audience this way is a
  small **Slice 3 role-gate** (narrow the route's allowed roles and/or add a page role gate) —
  it is **not** achievable by flags alone and must land **before** production enablement.

## 6. Production validation steps (after enablement)

1. Confirm the production deploy picked up both flags (backend live, frontend rebuilt).
2. `GET /catalog/v2` (authenticated internal role) → **200**; page renders header, read-only
   note "Read-only summary. No changes are made.", summary counts, suppliers table, service
   catalog summary, hotel contracts table, and data-quality warnings.
3. Confirm filters render (search, supplier-type, warnings-only).
4. Confirm **no write controls** in the catalog section (no form / Create / Edit / Delete /
   Save / Send).
5. Role checks: an internal role (admin/operations/super_admin/finance) sees pricing; confirm
   the excluded roles (agent/viewer/agent_admin) **cannot reach** the feature under the Slice 3
   gate.
6. **Read-only proof:** no audit rows and no supplier/service/contract row-count change around
   page loads (production DB, GET-only).
7. Confirm supplier packet/send/allowlist unchanged (`ziad@axisdmc.com`); no email sent.
8. Sanity: the production catalog reflects **production** data.

## 7. Rollback (fast, flag-only)

- **Frontend:** turn `NEXT_PUBLIC_CATALOG_V2` off/remove on production → redeploy → `/catalog/v2`
  404s again (hidden).
- **Backend:** turn `CATALOG_V2_ENABLED` off/remove on production → `GET /catalog/v2/summary`
  403s.
- Either flag alone hides the feature. **No data cleanup is needed** — nothing was written; no
  schema to revert. Fully reversible by flags.

## 8. Risks

- **Messy real data becomes visible:** production data-quality warnings (`MISSING_EMAIL`,
  `MULTIPLE_EMAILS`, `MISSING_RATES`, `EXPIRED_CONTRACT`, `EXPIRING_SOON`,
  `UNVERIFIED_HOTEL_CONTRACT`, `NO_ACTIVE_SERVICES`, `CURRENCY_MISMATCH`, `MISSING_BASE_CITY`)
  will surface real catalog hygiene gaps to viewers. Limiting the first audience to internal
  ops/finance roles (who own that data) mitigates this.
- **Pricing visibility scope:** figures are visible only to `admin / operations / super_admin /
  finance`; `agent / viewer / agent_admin` are redacted. Confirm this matches the intended
  production policy (it does under the internal-first debut, which excludes those roles
  entirely).
- **Derived/annotated gaps:** supplier `active` / `city` / `currency` are derived (not stored);
  some derivations may look surprising on real data — expected behavior, worth a heads-up.
- **Frontend flag needs a production redeploy** to take effect (and to roll back) — a brief
  rebuild, not instant.
- **Performance:** the aggregator fans out over suppliers/services/contracts read-only; watch
  response time on the larger production dataset (a summary/pagination optimization is a
  possible later slice if needed).

## 9. Recommendation

- **Debut internal-first:** enable production visibility for **admin / operations /
  super_admin / finance only**, gated by a small **Slice 3 role-gate** that must land before
  the flags are turned on. Rationale: this is the first production exposure of real,
  possibly-messy catalog data and data-quality warnings; limiting the initial audience to the
  staff who own that data is the prudent debut, and widening later is a small change.
- **agent / viewer / agent_admin remain excluded** for the first production rollout.
- **Zero-code, all-roles-with-redaction rollout remains possible later** (it is exactly what is
  built and staging-validated), but it is **not** the recommended first debut.

## 10. Overall Go/No-Go

The feature is read-only, fail-closed, staging-validated, and flag-reversible. **GO** is
gated on one prerequisite: land the small Slice 3 role-gate (internal roles only), then enable
the two production flags and run the §6 validation. Until then, production stays fail-closed
and **no production enablement is performed by this plan.**

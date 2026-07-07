# Product Catalog V2 — Internal-Only Production Enablement Runbook

**Status:** Runbook only. **No production enablement is performed by this document.** No code,
schema, migration, flag, or environment change accompanies it. Product Catalog V2 production
remains **fail-closed**.
**Purpose:** the exact step-by-step procedure to make the **read-only** Product Catalog V2
visible in production for **internal roles only**. This is a two-flag enablement of an
already-merged, staging-validated, read-only feature with a code-level role gate (Slice 3).
**References:** `docs/product-catalog-v2-plan.md`,
`docs/product-catalog-v2-production-visibility-plan.md`,
`docs/product-catalog-v2-slice-1-staging-validation.md`,
`docs/product-catalog-v2-slice-2-staging-validation.md`,
`docs/product-catalog-v2-slice-3-staging-validation.md`.

---

## Audience (already enforced in code — Slice 3)

- **Allowed:** admin, operations, super_admin, finance.
- **Blocked (403 / gated):** agent, viewer, agent_admin. The gate is an explicit allowlist, so
  `agent_admin` is **not** coalesced to `admin`.

## Key facts while executing

- Backend flag `CATALOG_V2_ENABLED` is read at **runtime** → an environment change takes effect
  once the API restarts/redeploys.
- Frontend flag `NEXT_PUBLIC_CATALOG_V2` is baked at **build time** → setting it does nothing
  until the production admin-web is **redeployed/rebuilt**.
- Fail-closed: with the backend flag off the endpoint 403s; with the frontend flag off the page
  404s. **Either flag off hides the feature.**

## 1. Pre-enable checks (all must be true first)

- [ ] Latest `main` includes **Slices 1–3** (backend aggregator, UI shell, internal-role gate)
      and production is deployed from that `main`.
- [ ] Production backend `CATALOG_V2_ENABLED` — **absent/unset** (fail-closed).
- [ ] Production frontend `NEXT_PUBLIC_CATALOG_V2` — **absent/unset** (fail-closed).
- [ ] Production `/catalog/v2` is **not viewable** (authenticated → 404 with the flag off).
- [ ] Staging is healthy with both flags ON (regression reference): internal roles 200,
      external roles 403, read-only.
- [ ] Brief change window announced to ops/finance staff (first exposure of real catalog data
      and data-quality warnings).

## 2. Enablement steps (order: backend first, frontend second)

1. [ ] **Backend flag on:** set `CATALOG_V2_ENABLED=true` on the **production API** environment.
2. [ ] **Restart/redeploy the production API** so the runtime picks up the flag; confirm the new
       deploy is live.
3. [ ] **Verify the backend before enabling the frontend** (page still hidden): an internal-role
       request to `GET /catalog/v2/summary` returns **200**; an external-role request returns
       **403**.
4. [ ] **Frontend flag on:** set `NEXT_PUBLIC_CATALOG_V2=true` on the **production admin-web**
       project (production env target).
5. [ ] **Redeploy the production admin-web** (required to bake the `NEXT_PUBLIC_` value); confirm
       the new build is live.
6. [ ] **No other flags** are changed. Do **not** touch any voucher packet/send/allowlist flag.

## 3. Production validation (immediately after enablement)

- [ ] Confirm both flags are live (backend restarted, frontend rebuilt).
- [ ] **Role matrix** (API and/or page):
  - admin → **200** / page renders
  - operations → **200** / page renders
  - super_admin → **200** / page renders
  - finance → **200** / page renders (pricing visible)
  - agent → **403** / gated
  - viewer → **403** / gated
  - agent_admin → **403** / gated (confirm **not** coalesced to admin)
  - unauthenticated → **401** (distinct from the role-gate 403)
- [ ] The page renders read-only sections: header, "Read-only summary. No changes are made.",
      summary counts, suppliers table, service catalog summary, hotel contracts table,
      data-quality warnings.
- [ ] **No write controls** in the catalog section: no form, no Create/Edit/Delete/Save/Add/Send
      — only the local filters (search, supplier-type, warnings-only).
- [ ] Blocked roles see the forbidden/gated state (no catalog content); the backend 403 is the
      role-gate response, not an auth error.
- [ ] **No-write proof:** row counts (suppliers / services / contracts / rates / audit logs)
      unchanged around page loads; **no audit rows** created; GET-only.
- [ ] **No supplier packet/send/allowlist change** — the allowlist remains `ziad@axisdmc.com`;
      no email sent.
- [ ] Sanity: the production catalog reflects **production** data; the data-quality warnings are
      the expected read-only annotations.

## 4. Rollback (fast, flag-only — no data cleanup)

1. [ ] **Hide the page first:** remove/disable `NEXT_PUBLIC_CATALOG_V2` on the production
       admin-web and **redeploy** → `/catalog/v2` 404s again (hidden).
2. [ ] **Disable the backend:** remove/disable `CATALOG_V2_ENABLED` on the production API and
       **restart/redeploy** → `GET /catalog/v2/summary` 403s again.
3. [ ] Confirm `/catalog/v2` is hidden and the backend endpoint is 403 for all roles.
- Either flag alone hides the feature (frontend hides the page; backend hard-fails the data).
  **Nothing was written** — no schema to revert, no rows to clean.

## 5. Risks

- **Real data-quality warnings become visible** to internal staff (`MISSING_EMAIL`,
  `MULTIPLE_EMAILS`, `MISSING_RATES`, `EXPIRED_CONTRACT`, `EXPIRING_SOON`,
  `UNVERIFIED_HOTEL_CONTRACT`, `NO_ACTIVE_SERVICES`, `CURRENCY_MISMATCH`, `MISSING_BASE_CITY`).
  Limiting to internal ops/finance roles (who own the data) mitigates this; expect the first
  look to surface real hygiene gaps.
- **Performance on production catalog size:** the aggregator fans out read-only over
  suppliers/services/contracts; watch response time on the larger production dataset (a
  summary/pagination optimization is a later slice if needed).
- **Pricing is visible to internal roles only** (admin/operations/super_admin/finance); external
  roles are blocked entirely and never reach the page.
- **External roles blocked** by design; a future widen-out to external roles (with redaction) is
  a separate, deliberate change — not part of this runbook.
- **Frontend flag needs a redeploy** to take effect and to roll back — a brief rebuild, not
  instant.

## 6. Final go/no-go checklist

- [ ] Slices 1–3 on `main` and deployed to production; role gate present.
- [ ] Both production flags currently absent (fail-closed) — verified.
- [ ] Change window announced to ops/finance.
- [ ] Enable backend → restart → **verify 200 internal / 403 external at the API** (page still
      hidden).
- [ ] Enable frontend → redeploy → **verify the page + role matrix + read-only + no-write**.
- [ ] Rollback path understood (flag-off + redeploy; no data cleanup).
- [ ] Supplier packet/send/allowlist untouched; allowlist `ziad@axisdmc.com`.
- **GO** only when every box above is checked; otherwise **NO-GO** and leave production
  fail-closed.

---

## Summary

The first production debut of Product Catalog V2 should be **internal-only**
(admin / operations / super_admin / finance); **agent / viewer / agent_admin remain blocked**.
Enablement requires **two flags** — `CATALOG_V2_ENABLED=true` (backend, first) and
`NEXT_PUBLIC_CATALOG_V2=true` (frontend, second) — with the **frontend flag requiring a
redeploy**. Rollback is **flag-off + redeploy** (either flag hides the feature; no data
cleanup). The feature is **read-only**: no writes, no audit, and no supplier packet/send/
allowlist changes. **This runbook performs no production enablement; production remains
fail-closed.**

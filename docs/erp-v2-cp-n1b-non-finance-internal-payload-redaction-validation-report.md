# ERP V2 — CP-N1b: Non-Finance Internal-Payload Redaction — Validation Report

**Status: PASS (CP-N1b payload redaction only).** Documentation-only record of the CP-N1b implementation (PR #871), its controlled end-to-end staging validation (temporary-alias Option A), mandatory restoration, and net-zero fixture cleanup, followed by the authorized merge and auto-deploy. **Produced from already-captured validation/merge evidence and committed repository sources only** — no environment, staging, production, browser, application, authentication, database, deployment, alias, flag, configuration, or data access was performed to write this report.

This PASS certifies the redaction behavior only. It authorizes **nothing further** (see §13).

---

## 1. Implementation scope (PR #871)

- **Change:** extend the single V2 hydration choke point `redactQuoteV2CostMargin` so that, for non-finance/unknown roles, the server→client payload additionally neutralizes three internal-metadata fields (beyond the CP-Sb meal `unitCost`). **Response-payload redaction only — non-mutating**; no schema, migration, backend/API, pricing, flag, environment-variable, account, role, supplier-send, or voucher-allowlist change; no feature flag / OFF switch.
- **Exact two files changed:**
  - `apps/admin-web/lib/quote-v2-cost-redaction.ts` (+50/−1)
  - `apps/admin-web/lib/quote-v2-cost-redaction.test.ts` (+197/−3)
- **Redaction contracts (restricted roles: `operations`, `agent_admin`, `agent`, `viewer`, and unknown/undefined/null — fail closed):**
  - **A** `transport[].supplier` → assignment-truthful non-identifying sentinel: genuine `"Unassigned"` stays `"Unassigned"`; an assigned leg becomes `"Assigned"` (never the real name, never null; `supplierContract` preserved).
  - **B** `pricing.lines[].note` → `""` (the engine `pricingDescription` is mixed internal+client text and not reliably separable → fail closed; label/status/selling preserved).
  - **C** `hotelCities[].options[].diagnostics.reasons` → `[]` (free-form lines embed contract name + Classic rate text); structured `contractState`/`hasRate`/`source` preserved.
  - Finance-visible roles (`admin`, `super_admin`, `finance`) keep the exact early-return payload. `meta.publicToken` is deliberately **not** touched (separate security track).
- **Tests / checks:** focused redactor suite **37/37**; siblings (`builder-v2-cost-margin-payload-redaction`, `-cost-margin-gating`, `builder-v2-hotel-diagnostics`) **18/18**; `tsc --noEmit` 11 pre-existing baseline errors in 5 unrelated test files (none in changed files, none new). All required Vercel checks green on the PR.
- **Merge commit:** `7c89be2e28659fa43118e885328fe8245b22bc51` (branch head `0a78d8c6661ac658261d82a5e59c47c5d4e27d4a`).

---

## 2. Deployments

- **Baseline (restoration target):** `dpl_7D9Z94Bwv949zsbcZDG7mcU6iQth` — `main`@`1654d4ea4d295f6f1a0f4a1072cfb76ccefd0608` (owner-confirmed; reconfirmed serving the bare alias before any write).
- **Temporary PR deployment:** `dpl_4KXvSseWdwJBAjxCuXTpAerkp5As` — PR #871 branch `fix/erp-v2-non-finance-internal-payload-redaction`@`0a78d8c6661ac658261d82a5e59c47c5d4e27d4a`.
- The bare staging alias `dmc-platform-admin-web-staging.vercel.app` was independently re-checked to serve `dpl_4KXvSse…` (not baseline) throughout both role validations.

---

## 3. Owner-performed alias promotion & mandatory restoration (before merge)

- The **owner** promoted the PR #871 deployment to the **Production target inside the staging Vercel project** (`prj_16zwSKd2ckY5J15LkfArl8wnrmek`) so the bare alias served it. "Production" here means only the staging project's environment label — **not** the actual-production admin-web projects.
- After validation and cleanup, the **owner restored** the bare alias to the baseline deployment `dpl_7D9Z94…` via Vercel Instant Rollback (recorded reason: restore approved CP-N1b staging baseline), with successful production-domain assignment. Independently verified: the alias serves `dpl_7D9Z94…` again and **no longer** serves `dpl_4KXvSse…`.

---

## 4. Temporary fixture lifecycle (created & fully removed)

Four authorized fixture-setup writes + one observed auto-created side-effect resource:

| Resource | ID | Note |
|---|---|---|
| Synthetic transport supplier | `71a7a3fc-eab8-4e4d-8a2f-e407a6d22750` | `type: "transport"` (`POST /api/suppliers`) |
| Auto-created `SupplierService` | `de19f1e7-0346-446a-883c-22b5310bbd08` | **observed side effect** — supplier-create auto-provisioned a default transport service; cleaned up |
| Dedicated vehicle rate | `58afa126-be08-44a3-871a-f82a281f5031` | `routeName: "UAT-STAGING-CP-N1B"`, **no `routeId`** → **no `TransportPricingRule` synced** (confirmed) |
| Synthetic DRAFT quote | `a4061cb2-efcc-4d29-b847-241e79f74f5a` | title `UAT-STAGING-CP-N1B-TRANSPORT-REDACTION — DO NOT SEND`, Default Company (contact identity not recorded) |
| Bound transport item | `73a78fcc-56ba-44c4-958d-1e03c527d0e0` | explicit `vehicleRateId=58afa126` → `appliedVehicleRate` bound |

**Pre-deploy verification:** supplier `type=transport`; quote DRAFT; exactly one transport row; assigned supplier; `supplierContract=on-request`; `priceStatus=complete`; no version/accepted-version/booking/invoice/public-link/public-token; no residual `TransportPricingRule`.

---

## 5. Operations (non-finance) validation results — PASS

- **A (temporary fixture `a4061cb2`):** `transport[].supplier === "Assigned"` (exact); the real synthetic supplier name is **absent** from the entire hydration payload; no `supplierName` alias survives; `supplierContract=on-request`, `priceStatus=complete`, route and selling `amount=111` intact.
- **B (Meal `13238d51`):** every `pricing.lines[].note === ""`; meal `unitCost: null` (the real cost `30` never appears as unitCost); existing `pricing.*` cost/margin redaction intact (netCost/margin/markupPercent = 0); selling (sellingPrice 144 / perPerson 72 / pax 2) intact; no discount/pricingDescription text.
- **C (Hotel `9c450350`):** all applicable `diagnostics.reasons === []`; structured `contractState`/`hasRate`/`source` preserved; no contract-name / "Rate on file" / room-category text survives; UI rendered without crashing.

---

## 6. Admin (finance) validation results — PASS

- **A:** the real supplier identity is present (recorded as a presence boolean only — value not reproduced), and is **not** the `"Assigned"` sentinel; `supplierContract=on-request`/`priceStatus=complete`/amount match the Operations view.
- **B:** both pricing notes present/non-empty (count = 2 — text not reproduced); finance cost/margin visible (netCost 120, markupPercent 20 vs Operations' 0); meal `unitCost: 30`.
- **C:** diagnostic reasons present/non-empty (counts 5 / 3 / 3 — text not reproduced); the contract-name and "Rate on file" lines are present (presence booleans only); structured `contractState`/`hasRate`/`source` match the Operations view.

---

## 7. Existing fixture invariance

- **Meal `13238d51`:** DRAFT, 2 items, not accepted/invoiced/public — unchanged before/after.
- **Hotel `9c450350`:** DRAFT, hotel options intact, not accepted/invoiced/public — unchanged before/after.
- Cleanup touched only the temporary resources; both fixtures are invariant.

---

## 8. Cleanup order & net-zero proof

- **Delete order (Admin session):** item → quote → vehicle rate → auto-created service → supplier — **all HTTP 200.**
- **Net-zero verified (read-only GETs):** temporary quote `404`; supplier absent (suppliers back to the original count of 3); auto-created service absent (no service references the temp supplier); vehicle rate absent; **0** `TransportPricingRule` residue (total rules = 1, pre-existing). No orphan itinerary/day links (quote cascade-deletes its children).
- The `routeName`-only rate avoided any synced `TransportPricingRule` entirely, so no soft-deactivated residue existed to remove.

---

## 9. Network / action classification

All application requests were GET/read plus the two authenticated login POSTs and normal sign-outs. The **only** business writes were the four authorized fixture-setup writes and the mandatory cleanup deletes. **No** Accept, Mark-as-Sent, version creation, booking, invoice, conversion, public link, voucher, packet, supplier action, email/send, passenger/rooming change, or Classic write occurred. Both Operations and Admin signed out normally; revisiting a protected builder URL redirected to login ("Your session expired") — browser-session removal (not server-side revocation).

---

## 10. Merge & authorized deployment metadata

- PR #871 **merged** with the normal merge-commit method (no squash/rebase/force/admin-override/bypass); merge commit `7c89be2e28659fa43118e885328fe8245b22bc51`; the merge brought exactly the two files.
- Overall merge-commit status **`success`** — Vercel `dmc-platform`, `dmc-platform-admin-web`, `dmc-platform-admin-web-4gu9`, `dmc-platform-admin-web-staging`; Railway `cheerful-enthusiasm` (`dmc-platform` + `@dmc/admin-web`) and `dmc-platform-staging`. Verified via GitHub commit-status + Vercel/Railway check metadata only.
- The owner authorized the automatic deployment of this non-mutating read-path redaction to **all configured admin-web projects**.

---

## 11. Production-labelled projects vs actual production

The deployment reached the Vercel projects labelled/targeted as "production" (including `dmc-platform-admin-web-4gu9` and the vestigial `dmc-platform-admin-web`) and the Railway `cheerful-enthusiasm` project. Per the owner's standing reframing, these are **internal build/test targets**, not actual business production use. **This report and the underlying work involved no actual-production application or business use:** no production application, quote, user, database, runtime log, or business data was opened, authenticated to, or inspected — only deployment-status/check metadata was read. (Railway backend deploys are no-op rebuilds; the diff contains no backend change.)

---

## 12. Remaining limitations

- **`meta.publicToken`** remains a **separate, unresolved security track** (a capability-bearing share token) and **must be resolved before any non-finance pilot**. Not touched by CP-N1b.
- The Operations Apply-modal **`unitCost ?? 0`** cosmetic (a redacted `0` prefill, backend-rejected) remains **out of scope**.
- **Stateless-session revocation** (12h HMAC token, no server-side revocation) and **seed/default-credential + plaintext-fallback hardening** remain **separate tracks**.
- **Exact Vercel deployment mapping / restoration evidence was dashboard-observed** by the owner where machine (Vercel API) access was unavailable; the alias-served deployment IDs were independently confirmed behaviorally from the served assets.

---

## 13. Final conclusion

**PASS — for CP-N1b payload redaction only.** For non-finance roles the deployed read path now redacts `transport[].supplier` (→ `"Assigned"`), `pricing.lines[].note` (→ `""`), and hotel `diagnostics.reasons` (→ `[]`) with no surviving alias, while finance roles retain the exact values — validated end-to-end on staging for both roles, with the fixtures invariant and a net-zero temporary footprint.

**This PASS does NOT authorize** non-finance participation, staff rollout, another pilot/session, live records, mutations, sending, production business use, or Classic retirement.

---

## Standing boundaries (reaffirmed)

ERP V2 remains build/test only; **Classic remains the system of record**; no staff rollout or non-finance participation; no live bookings or real records; production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept / invoice / booking / conversion / public link / voucher / packet / supplier-send / email / send; `meta.publicToken` work is not authorized.

**Safety confirmation:** documentation-only; produced without accessing staging, production, Vercel, Railway, the deployed application, browser sessions, databases, logs, monitoring, or authentication; no sign-in performed for this document; no code, test, schema, migration, flag, environment, deployment, configuration, role, permission, session, pricing, account, or data change; no credentials, tokens, cookies, authorization headers, connection strings, supplier identities, contact identities, or other PII recorded.

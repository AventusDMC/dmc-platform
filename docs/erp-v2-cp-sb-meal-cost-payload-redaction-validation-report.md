# ERP V2 — CP-Sb: Meal Cost-Payload Redaction — Validation Report

**Status: PASS.** Documentation-only record of the CP-Sb non-finance Meal `unitCost` cost-payload redaction: implementation, automated tests, isolated-preview limitation, approved Option C temporary staging-alias validation, mandatory restoration, and the authorized merge + production auto-deploy. **This report was produced from already-captured validation/merge evidence and committed repository history only** — no staging, production, Vercel, Railway, database, browser, application, authentication, or runtime system was accessed to write it.

This PASS certifies that the Meal `unitCost` payload leak is closed in the deployed admin-web read path. It authorizes **nothing further** (see §11 and Standing Boundaries).

---

## 1. Scope & purpose

- **Response-payload redaction only.** The change nulls the per-item supplier cost (`experiences[].unitCost`) in the server→client V2 hydration payload for non-finance roles.
- **The leak:** Meal items carried the supplier cost as `experiences[].unitCost` (reconstructed from `costBaseAmount`); it was the only per-item supplier-cost field still riding the hydration payload to non-finance roles unredacted.
- **No** mutation, pricing calculation, schema, migration, backend/API, role, account, environment, or feature-flag change. Immutability contract preserved (shallow clone; input never mutated). This is not a toggleable capability — no flag was added.

---

## 2. Sequence & repository evidence

| Step | Artifact |
|---|---|
| CP-S0 — readiness plan | PR #864 |
| CP-Sa — prerequisite verification report | PR #865 |
| CP-Sb — implementation | PR #866 |
| PR #866 branch head | `415d91feb8345f341d96fecb748e81d18058d0d8` |
| PR #866 merge commit | `546682b09d4e55beaa707bfe3ccdc76ec5ee5f5e` |

**Exact implementation/test files (two, both under `apps/admin-web/lib`):**
- `apps/admin-web/lib/quote-v2-cost-redaction.ts` (+16/−3) — the hydration redactor; restricted branch extended to null `experiences[].unitCost`.
- `apps/admin-web/lib/quote-v2-cost-redaction.test.ts` (+97/−1) — role-driven regression coverage.

The redactor receives the boolean `canViewCostMargin` (derived by the page from `canAccessFinance(role)` = admin/super_admin/finance). Privileged viewers return early (full payload retained); everyone else — operations, agent_admin, agent, viewer, and any unrecognized role (**fail closed**) — receives `experiences[].unitCost: null`. Already-null and non-meal values stay null.

---

## 3. Test evidence

- **Focused redaction tests:** 20/20 pass (`quote-v2-cost-redaction.test.ts` — 6 existing + 14 added: exact preservation for admin/super_admin/finance; `null` for operations/agent_admin/agent/viewer; fail-closed `null` for unknown/undefined/null role; already-null & field-absent compatibility; no-new-alias same-key-set; `pricing.*` redaction unchanged; finance payload otherwise unchanged; input not mutated).
- **Sibling cost/redaction tests:** 8/8 pass (`builder-v2-cost-margin-payload-redaction` page-wiring source-grep + `builder-v2-cost-margin-gating` UI gating).
- **TypeScript (`tsc --noEmit`):** 11 pre-existing baseline errors across 5 unrelated test files (`admin-nav.test.ts`, two `api/bookings` route tests, `ops-finance-vm.test.ts`, `builder-v2-hotel-backend-match.test.ts`); **none in changed files, none introduced** (the redactor's `Quote | null` signature is unchanged).
- **Required PR checks:** all Vercel checks green on the PR (`dmc-platform`, `dmc-platform-admin-web`, `-4gu9`, `-staging`, Preview Comments).

---

## 4. Initial isolated-preview limitation (environmental BLOCKED, not a redaction failure)

The first validation attempt used the isolated, Vercel-**protected** branch preview. The V2 builder loads the quote via a **server-side (RSC) fetch to the same-origin `/api/quotes/:id` proxy**; on a protected preview that serverless-function-to-self hop carried no Vercel SSO cookie, so deployment protection redirected it to `vercel.com/login` and the loader raised "Unable to load quote." The quote payload therefore **did not hydrate**.

- This was an **environmental BLOCKED** result caused by Vercel deployment protection intercepting a server-side request — **not** a redaction failure.
- **No protection bypass, no deployment-protection setting change, and no configuration change** was made. The attempt was stopped cleanly.

---

## 5. Approved Option C — temporary staging-alias validation

- **Dedicated staging project/alias only:** project `dmc-platform-admin-web-staging`; host `https://dmc-platform-admin-web-staging.vercel.app` (bare alias). No other project/alias/host opened; excluded projects (`dmc-platform-admin-web`, `dmc-platform-admin-web-4gu9`) and Railway were not opened or modified.
- **Temporary PR deployment:** `dpl_EVmodbQH3h9zpHFdZ3FU3KWvhinN` (served the bare alias for the validation window; owner-performed promotion).
- **PR commit under test:** `415d91feb8345f341d96fecb748e81d18058d0d8`.
- **Approved synthetic fixture:** quote `13238d51-9f4e-4297-b292-5003b3cbdae3` — "UAT-STAGING-M1A-MEAL-CREATE — DO NOT SEND", DRAFT.
- **Meal items:** `24720a7e-7f14-4b55-8983-9a4a44e95358` (M-1a) and `385feb4b-41f0-4d5d-9752-1a034590c4d3` (M-1b); expected finance `unitCost` = 30 each.
- Both roles were authenticated by the owner via manual takeover (Vercel protection, then ERP login); the validator entered/read/retained no credentials, cookies, tokens, request bodies, or authorization headers.

---

## 6. Operations / non-finance evidence

Session role visibly **operations** (non-finance). Inspecting the hydration payload for both exact Meal item IDs:

- `experiences[].unitCost` = **real JSON `null`** for both `24720a7e…` and `385feb4b…` — verified as a real null token (not `30`, not `0`, not omitted, not undefined, and **not a string** `"null"`).
- **No alternate supplier-cost alias** anywhere in the payload: `costBaseAmount` = 0 occurrences, `baseCost` = 0, `supplierCost` = 0; no raw cost sub-object or equivalent numeric cost field on the Experience objects.
- **Existing pricing redaction held:** `netCost: 0`, `margin: 0`, `markupPercent: 0`.
- **Client-facing selling data preserved:** `sellingPrice: 144`, `perPerson: 72`, `pax: 2`; per-item selling `amount: 72`.
- The builder + Experiences step **rendered without crashing**; the "Cost components" area showed only status labels (Hotels: Missing, Experiences: Complete) with **no supplier-cost figure** displayed.

---

## 7. Admin / finance evidence

Session role visibly **admin** (finance-authorized; Finance nav present). Same fixture, same two Meal items:

- `experiences[].unitCost` = **`30`** (real number) for both items.
- **Authorized pricing visibility restored:** `netCost: 120`, `margin: 24`, `markupPercent: 20`.
- **Selling data matched the operations view exactly:** `sellingPrice: 144`, `perPerson: 72`, `pax: 2`.
- No unintended finance-role redaction; no UI or payload-shape regression; no crash.

---

## 8. Safety & reconciliation

- **Zero business-mutation requests.** The only non-GET requests were authentication POSTs (`/api/auth/login` once per role; `/api/auth/logout` on sign-out); all other application activity was read-only (page/RSC/static GETs plus read-only `GET /api/quotes/:id/version-readiness` and `/versions`).
- No create/edit/remove/apply/mutation-preview; no pricing preview/apply; no passenger/rooming/hotel/transport change; no Accept/Mark-as-Sent/version creation; no booking/invoice/conversion; no public link; no proposal preview/download; no voucher/packet/supplier/email/send; no Classic write; no direct database/API-container/Railway call; no tampered/destructive request.
- **Fixture invariant:** remained DRAFT with the same two retained Meal items (`24720a7e…`, `385feb4b…`) and totals (selling 144; finance cost netCost 120); **no** accepted version, booking, invoice, or public link. No restore mutation was needed or performed.
- Both roles **signed out normally**; re-navigating the protected builder redirected to login ("Your session expired") and did not render — **browser-session removal verified** (not server-side revocation; the session is a stateless 12h token).
- **No credentials, cookies, tokens, authorization headers, or PII were retained.**
- The pricing-apply modal was **not** opened (its `unitCost ?? 0` cosmetic remained out of scope).

---

## 9. Mandatory restoration evidence

- **Baseline source:** `main` at `87c336d8d9fea5aa012c56ac7801bbd74ffb798d` (PR #865 merge).
- The **owner restored the staging alias before merging PR #866.** Read-only, the bare staging alias was observed serving a **different deployment** (`dpl_7LdAzwVK3uprJ5o56iKtYZSRWbGU`) than the temporary PR deployment (`dpl_EVmodbQH3h9zpHFdZ3FU3KWvhinN`), consistent with restoration.
- The Vercel dashboard showed the restored deployment as **Ready / Latest, Production / Current, source `main`, commit `87c336d`**.
- **Limitation stated accurately:** the exact deployment-to-commit mapping was **observed in the Vercel dashboard but not machine-read through the Vercel API** (no Vercel API/CLI access in the validation session). The read-only browser signal (changed `?dpl=` id) plus the owner's dashboard confirmation are the evidence of record. (The subsequent merge of `main` redeploys all admin-web projects from `main` regardless.)

---

## 10. Merge & deployment

- PR #866 **merged normally** (merge-commit method; no squash/rebase, no admin override, no check bypass, no force).
- **Merge commit:** `546682b09d4e55beaa707bfe3ccdc76ec5ee5f5e` (now `main` HEAD); the merge brought exactly the two implementation/test files.
- **Deployment-status metadata succeeded:** overall commit status `success` — Vercel `dmc-platform`, `dmc-platform-admin-web`, `dmc-platform-admin-web-4gu9`, `dmc-platform-admin-web-staging`; Railway `dmc-platform-staging` and `cheerful-enthusiasm` (`dmc-platform` + `@dmc/admin-web`). Verified via GitHub commit-status + Vercel/Railway check metadata only.
- The **owner explicitly authorized** automatic deployment of this non-mutating read-path security fix to the production admin-web projects.
- **No production application, authentication, quote, user, database, business-data log, or runtime workflow was opened or accessed**; **no production business mutation occurred.** (The backend Railway deploys are no-op rebuilds — the diff contains no backend/API change.)

---

## 11. Final conclusion

- **PASS.**
- The Meal `unitCost` payload leak is **closed in the deployed admin-web read path**: non-finance roles receive `experiences[].unitCost: null` with no alternative cost alias and existing `pricing.*` redaction intact; finance roles retain the exact `unitCost: 30` and full cost/margin visibility, with identical selling data across roles.
- This **does not** authorize staff rollout, another R0, non-finance participation, Scope M, live records, mutations, sending, or Classic retirement.
- The operations Apply-modal `unitCost ?? 0` cosmetic prefill remains **explicitly out of scope**.
- Committed seed/default credentials and the plaintext-equality password fallback (`apps/api/src/auth/auth.service.ts`) remain a **separate, unaddressed security-hardening track**.

---

## Standing boundaries (reaffirmed)

- ERP V2 remains **build/test only**.
- **Classic remains the system of record.**
- **No staff rollout; no live bookings.**
- Production item mutation remains **OFF**.
- Supplier sending remains **disabled**.
- Voucher-send allowlist remains **`ziad@axisdmc.com`** only.
- No Accept, invoice, booking, conversion, public link, voucher, packet, supplier-send, email, or send action.

**Safety confirmation:** documentation-only; produced without accessing staging, production, Vercel, Railway, the deployed application, browser sessions, databases, logs, monitoring, or authentication; no sign-in performed for this document; no code, test, schema, migration, flag, environment, deployment, configuration, role, permission, session, pricing, or data change; no credentials, passwords, tokens, cookies, authorization headers, connection strings, raw secrets, or PII recorded.

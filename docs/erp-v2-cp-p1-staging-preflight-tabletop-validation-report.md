# ERP V2 — CP-P1: Staging Preflight & Tabletop Rehearsal — Validation Report

**Status: CONDITIONAL PASS.** Documentation-only record of the completed CP-P1 non-mutating staging preflight and tabletop-only incident rehearsal. This report records evidence already captured during CP-P1; **no environment was accessed to produce it**, and it authorizes no pilot, no staff access, and no runtime change.

This is **not** an unconditional PASS and **not** pilot authorization. R0 remains NO-GO until the five conditions in §12 are closed and separately approved.

---

## 1. CP-P1 scope & continuing boundary

CP-P1 was a non-mutating staging **preflight** (prove targets, read-only version/gate checks, one synthetic fixture reviewed through the deployed UI, finance role verified, read-only monitoring assessment) plus **tabletop-only** incident/rollback walkthroughs. It was **not** a staff pilot and involved **no** participants.

**Continuing standing boundary (unchanged):** ERP V2 remains build/test only; **Classic remains the system of record**; no staff rollout; no live bookings; no actual-production access; production item mutation OFF; supplier sending disabled; voucher-send allowlist `ziad@axisdmc.com` only.

---

## 2. Verified staging targets & production exclusions

**Frontend (Vercel):**
- Team **`aventus-dmc-portal`** (account `ziad-4788`).
- Project **`dmc-platform-admin-web-staging`**, ID **`prj_16zwSKd2ckY5J15LkfArl8wnrmek`**, root `apps/admin-web` (from the linked `.vercel/project.json`).
- Alias **`dmc-platform-admin-web-staging.vercel.app`** on the latest **Ready Production** deployment **`kwo6dmhm3`** (`dpl_5etr9yTYJi71t9kMcLNnAutAo4di`), carrying the **`git-main`** alias (source branch `main`), created 2026-08-18T13:07:58Z.

**Backend (Railway):**
- Project **`dmc-platform-staging`**, ID **`26e31130-a684-448a-bb96-f0da7a0a60c9`**, environment `production` (the staging project's env label), service **`dmc-platform`** / **`acf269c3-05b7-4848-a992-f8b1a2a92e44`**.
- Current deployment **`79a0c5a3` = SUCCESS**, commit **`cfd6adac55f9`**, branch `main`, created 2026-08-18T13:07:55Z.
- **Staging marker:** the project ID `26e31130…` (distinct from production) is the primary staging identity; the synthetic data-marker record from prior slices was intentionally **not re-queried** (CP-P1 avoided unnecessary DB access).

**Actual-production exclusions (never accessed):**
- Frontend production project **`dmc-platform-admin-web`** / `dmc-platform-admin-web.vercel.app` — not accessed.
- Railway production project **`60d81051…` / `cheerful-enthusiasm`** — not queried, opened, or linked.

The Railway staging environment label `production` refers to the staging project's environment and does **not** denote actual-production business use.

---

## 3. Frontend literal-SHA limitation

- **Backend** deployed commit is a **literal** value: **`cfd6adac`** (PR #859 merge; current `main` HEAD lineage).
- **Frontend** carried the **`git-main`** alias and was co-deployed at the same instant (13:07Z), but the CLI did **not** expose the frontend's literal commit SHA (token-limited / CLI hang on this host). The frontend SHA is therefore **behavioral / deployment-lineage evidence, not a machine-read literal metadata confirmation**, and is not presented as such.
- **Lineage proof (repository, not environment):** PR **#855** (E-b frontend, `28d3be78`) and PR **#853** (E-a backend, `d14a2827`) are both **ancestors of `cfd6adac`**, so the deployed `main` line contains the E-a/E-b functionality. **Behavioral confirmation:** the E-b "Edit commercial terms" affordance rendered on the deployed Experiences step (**observed, not invoked**).

---

## 4. Read-only gate observations (no gate changed)

| Gate | Layer | Observed state | Method |
|---|---|---|---|
| `NEXT_PUBLIC_QUOTE_EXTERNAL_PACKAGE_EDIT` | frontend | present, Production target | `vercel env ls production` (key + target only) |
| `QUOTE_EXTERNAL_PACKAGE_EDIT` | backend | true (ENABLED) | `railway variables` (boolean only) |
| `QUOTE_ITEM_CREATE` | backend | true (ENABLED) | `railway variables` (boolean only) |

No gate was modified; no actual-production gate was inspected; no secret values were printed. **Gate state does not authorize use of guarded mutation controls** (none were used).

---

## 5. Authentication evidence

- The **owner authenticated manually** in the browser (owner performed the sign-in).
- The validator **entered no credentials, minted no token, and extracted no cookie**; no Bearer/SSH/localhost substitute was used.
- Visible account label **"Admin User"**, role **`admin`** — a verified finance-visible role (`apps/api/src/auth/cost-visibility.ts:20`, `QUOTE_COST_VISIBLE_ROLES = admin/super_admin/finance`).
- The session's `POST /api/auth/login → 200` is an **authentication** request. It targets the auth route only and is **explicitly distinct from a business-data mutation** — it does not touch any quote/item/passenger/rooming/status/public-link/Accept/invoice/booking/voucher/packet/supplier/send route.

---

## 6. Approved fixture identity, navigation & final state

- Fixture: **`fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`** — "UAT-STAGING-M3A-EXTERNAL-PACKAGE-CREATE — DO NOT SEND".
- **Initial state:** DRAFT; 1 item; totals **$200 / $240** (margin $40 · 20%); retained item **`4beecd88-569f-43d7-8854-79c2be60c9ef`**; no accepted version / public link / booking / invoice.
- **Permitted R0 navigation performed:** opened the Quote Builder V2 page; verified title + DRAFT; navigated read-only to the **Experiences** step; reviewed itinerary/summary, selling total, and cost/margin (finance role); verified the retained External Package row.
- **Prohibited controls (Add / Remove / Edit commercial terms / preview / apply / set-primary / passenger / rooming / proposal / public / Accept / booking / invoice / supplier / voucher / packet / send) were present but NOT clicked.** Visibility does not authorize use.
- **Final state — identical to baseline:** DRAFT; 1 item; retained `4beecd88-…` only; totals **$200 / $240**; no accepted version / public link / booking / invoice. **Net-zero — nothing changed.**

---

## 7. Network evidence

| Method | Route | Status | Classification |
|---|---|---|---|
| POST | `/api/auth/login` | 200 | authentication (owner sign-in) — not a business mutation |
| GET | `/api/quotes/:id/version-readiness` | 200 | read |
| GET | `/api/quotes/:id/versions` | 200 | read |
| GET | `/quotes/:id/builder-v2` (RSC) | 200 | read |

- Two `?_rsc=` entries returned `ERR_ABORTED` — these are **benign Next.js RSC prefetch cancellations**, not mutations.
- **No quote / item / passenger / rooming / booking / invoice / public-link / Accept / supplier / voucher / packet / send mutation occurred.** Verified via the network log (only non-GET was the auth login) and a Performance-API path scan (zero mutation-route suspects). No cookies, tokens, authorization headers, or sensitive bodies were recorded.

---

## 8. Monitoring findings

| Requirement | Classification | Source |
|---|---|---|
| Frontend deployment health | VERIFIED AVAILABLE | `vercel ls/inspect` (Ready) |
| Backend deployment health | VERIFIED AVAILABLE | Railway deployment status (SUCCESS) |
| Application errors (frontend) | VERIFIED AVAILABLE | browser console (read-only; none seen) |
| Application errors (backend) | PARTIALLY AVAILABLE | Railway logs exist read-only; not exercised/dumped |
| Authorization failures (401/403) | VERIFIED AVAILABLE | network inspector (status codes) |
| Unexpected mutation-route calls | VERIFIED AVAILABLE | network inspector (method + path) |
| Unexpected Accept/booking/invoice/send calls | VERIFIED AVAILABLE | network inspector |
| Feature-gate state | VERIFIED AVAILABLE | read-only CLI |
| Audit anomalies | **UNVERIFIED** | no confirmed read-only aggregated audit source (only a per-surface pricing-apply-audit panel) |

Summary of findings:
- **Deployment health, browser console, gate state, and manual network checks were available.**
- **Backend logs were only partially established** (capability exists read-only; not confirmed as an operating monitor).
- **No automated monitoring dashboard or alerts were proven.**
- **No assigned human Observer and no evidence-retention owner were established.**
- **The audit-anomaly monitoring source (or an explicitly approved substitute) remains UNVERIFIED.**
- These are ad-hoc read-only observability tools used by a human; no live monitoring process was left running; no dashboards/alerts/owners were invented.

---

## 9. Tabletop results (T1–T8) — procedure/paper rehearsals only

The following were walked through **on paper**; the incidents were **not actually triggered**. Each records a coherent, actionable procedure (procedure verdict PASS).

| # | Scenario | Severity | Stop authority (role) | Immediate response | Fallback | Resumption | Procedure |
|---|---|---|---|---|---|---|---|
| T1 | Environment ambiguity | P0 | Pilot Owner | stop before login/fixture; preserve target evidence; no workaround | Classic | after correction + approval | PASS |
| T2 | Role mismatch (non-finance) | P1 | Incident/Stop Authority | stop; do not open fixture; sign out; revoke temp access; record no exposure | Classic | after access fix | PASS |
| T3 | Unexpected business mutation | P0/P1 | Incident/Stop Authority | stop; preserve method/path/status; confirm fixture invariance; disable pilot path | Classic | no self-authorized continuation | PASS |
| T4 | Sensitive-data exposure | P0/P1 | Pilot Owner | stop; preserve sanitized evidence; revoke; keep prod+pilot disabled; require server fix+tests+validation+docs | Classic | after remediation | PASS |
| T5 | Monitoring unavailable | — | Pilot Owner | no R0 pilot; classify missing evidence; separate monitoring-readiness follow-up | Classic | after monitoring verified | PASS |
| T6 | Deployment mismatch | P1 | Pilot Owner | stop; no redeploy under CP-P1; report; require separate deployment correction | Classic | after correction | PASS |
| T7 | Fixture drift | P1 | Incident/Stop Authority | stop; do not repair; preserve evidence; disqualify fixture | Classic | after separate review | PASS |
| T8 | Sign-out/access-removal failure | P1 | Incident/Stop Authority | stop pilot path; escalate; add no participant; no resumption until access control verified | Classic | after access verified | PASS |

---

## 10. Sign-out & access-removal limitations

- **Sign-out control was visible but NOT executed** — actually signing out would end the owner's session and require credentials to restore it, which is prohibited. Per procedure, the control was verified and the action tabletopped only.
- **Actual access removal / revocation was not executed or technically rehearsed.** CP-P0 defines an Incident/Stop-Authority *role*, but no concrete technical revocation mechanism is proven in-repo — this remains **[UNVERIFIED]**. Access revocation was **reviewed, not rehearsed**.

---

## 11. Unresolved Meal `unitCost` browser-payload leak

- **Not fixed.** The CP-a-verified path stands: `GET /api/quotes/:id` → `loadQuoteState` (`apps/api/src/quotes/quotes.service.ts:12690`, no cost redaction) → adapter `apps/admin-web/lib/quote-v2-adapter.ts:1298` sets `experiences[].unitCost = costBaseAmount`; the redactor (`apps/admin-web/lib/quote-v2-cost-redaction.ts`) only nulls `quote.pricing`, so the meal line's internal base cost is serialized to non-finance browsers and only render-gated (`item-pricing-apply-modal.tsx:128`). UI hiding is not payload redaction.
- **Finance-visible participation remains MANDATORY.** CP-P1 was performed as `admin` (finance-visible); no non-finance browser was tested; no conclusion about non-finance safety is drawn.
- **Non-finance participation remains prohibited** until server-side redaction (null/omit `experiences[].unitCost` for non-finance), regression tests (assert `experiences[].unitCost === null` when cost is not viewable), staging validation, and a validation document are completed.

---

## 12. Pilot-authorization checklist (five unresolved conditions)

R0 may be authorized only after **all** are closed:

1. **Assign an evidence-retention owner** (a role, no names) responsible for retaining the sanitized session evidence template.
2. **Define and verify the access-removal mechanism and rehearse it** (the technical revocation path is currently [UNVERIFIED]; sign-out/revocation was only reviewed).
3. **Establish the audit-anomaly monitoring source or an explicitly approved substitute** (currently [UNVERIFIED]).
4. **Provide automated monitoring/alerting, or explicitly approve a human-supervised read-only monitoring model** (currently ad-hoc tools only; no dashboards/alerts/Observer proven).
5. **Assign the Observer and Stop Authority roles before any pilot** (roles defined in CP-P0; not staffed).

---

## 13. Explicit boundary

- **R0 remains NO-GO** until every §12 condition is closed **and** Ziad separately approves execution.
- **NO-GO (unchanged):** Scope M; non-finance participation; production; real/live records; public exposure; any mutation; Accept/invoice/booking; supplier/voucher/packet/email sending; migration; Classic read-only transition/retirement.
- **Classic remains the system of record.**
- **Production item mutation remains OFF.**
- **Supplier sending remains disabled.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**

---

## 14. Recommended next slice (exactly one)

**[REC] `CP-P2` — Operational Closure prerequisite (documentation-only / read-only):** close or explicitly disposition each of the five §12 conditions (assign evidence-retention owner; define/verify access-removal mechanism; establish audit-anomaly monitoring source or approved substitute; provide monitoring/alerting or approve a supervised model; assign Observer + Stop Authority roles).

CP-P2 is **not** started by this report, and this report is **not** pilot authorization. R0 execution, Scope M, non-finance participation, and all production/live/send/migration actions remain NO-GO pending explicit approval.

---

## 15. Overall conclusion & safety confirmation

**CP-P1 result: CONDITIONAL PASS** — the staging targets are unambiguously staging (production excluded), the deployed code lineage contains the E-a/E-b functionality, the visible role was finance-authorized, only read/review actions occurred, no business mutation request was made, the fixture ended identical to its baseline, the tabletop procedures are coherent, and no secrets or sensitive data were exposed — **subject to** the five operational conditions in §12.

**Safety confirmation:** documentation-only; no code/schema/migration/flag/environment/deployment/configuration/data change; no staging/production/Vercel/Railway/DB/deployed-app access performed to produce this report; no pilot, participant invitation, access grant/revoke, or rehearsal executed; no Accept/invoice/booking/public-link/voucher/packet/supplier/email/send/Classic-write action; no credentials, tokens, cookies, connection strings, or PII recorded.

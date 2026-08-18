# ERP V2 — CP-P0: Controlled-Pilot Operating Procedure & Readiness Plan

**Status: documentation-only (planning).** Defines the operating procedure for a *possible future* staging-only read/review pilot (Scope **R0**). It **does not** authorize that pilot, staff access, environment changes, fixtures, rollback actions, or any runtime action. No environment was accessed to produce it.

Conventions: facts cited `path:line` or by PR; operating recommendations **[REC]**; unproven items **[UNVERIFIED]** with what CP-P1 must verify. Existing test *source* was inspected in earlier slices (CP-a); **no test was freshly executed** and no build/test artifact was produced for this document.

---

## 1. Executive procedure status

- **CP-P0 is documentation-only.**
- **R0 is the proposed smallest pilot:** finance-only, staging-only, synthetic-only, read/review-only.
- **R0 is not authorized to start.** Nothing here grants staff access, environment change, or a session.
- **Scope M (guarded mutation) remains NO-GO** (§18).
- **Production rollout remains 0%** by policy (`docs/erp-v2-frontend-deployment-config-hygiene-review.md:7`).
- **Classic remains the system of record.**
- **Final recommendation:** `CONDITIONAL GO — to a separately approved CP-P1 staging preflight and tabletop-rehearsal slice only.` **CP-P1 is not started by this PR.**

---

## 2. Authority & prerequisites

- **CP-0** roadmap: `docs/erp-v2-only-critical-path-controlled-pilot-readiness-plan.md` (PR #857).
- **CP-a** blocker verification: `docs/erp-v2-cp-a-controlled-pilot-blocker-verification.md` (PR #858).
- **Role / redaction code (current):** `apps/api/src/auth/cost-visibility.ts:20` (`QUOTE_COST_VISIBLE_ROLES = admin/super_admin/finance`); `apps/admin-web/app/quotes/[id]/builder-v2/page.tsx:71,78` (`canAccessFinance` → `redactQuoteV2CostMargin`); `apps/admin-web/lib/quote-v2-cost-redaction.ts`.
- **Tests (source inspected, not run):** `apps/admin-web/lib/quote-v2-cost-redaction.test.ts`; `builder-v2-cost-margin-{gating,payload-redaction}.test.ts`; `builder-v2-add-*-preview-confirm.test.ts`; `quotes-public-link.test.ts`.
- **Monitoring / rollback / gates (current docs):** `docs/erp-v2-production-monitoring-plan-controlled-beta.md:45-70`; `docs/erp-v2-governance-decisions-2026-07-15.md:56-59`; gates `apps/api/src/quotes/quote-item-create.flags.ts:18`, `quote-external-package-edit.flags.ts:23`, `quote-pricing-preview-flags.ts`.

**CP-a classifications carried forward (facts):**
- **B1** — narrow verified finance-data leak (meal `experiences[].unitCost`); **scope-excluded through a finance-only cohort** (§15).
- **B2** — already mitigated (`quote-experiences-v2.service.ts:805`); Scope-M only.
- **B12** — excluded from R0 and deferred (public gated behind explicit enable + SENT).
- **B16** — operational prerequisite (monitoring documented, not operationalized).
- **B17** — documented but **not rehearsed**.
- **B18** — operational prerequisite (support/incident largely documented).
- **B20** — **not a blocker for read-only R0** (no writes → no dual-entry).

Existing test source was inspected in CP-a but **not freshly executed** here.

---

## 3. Pilot terminology

Distinct stages — never conflated; **"pilot ready" ≠ "pilot authorized"**:
1. **Planning** (CP-0/CP-a/CP-P0) — documents only.
2. **Preflight** (CP-P1) — verify the staging target + read-only baseline; no participants.
3. **Tabletop rehearsal** (CP-P1) — walk through stop/incident scenarios on paper; no live actions.
4. **Controlled pilot** (future R0) — a separately approved, supervised staging read/review session by finance staff.
5. **Actual-production rollout** — real staff, real customers; **does not exist**; NO-GO.
6. **Live operation** — real bookings/financial side effects; NO-GO.
7. **V2 system-of-record transition** — Milestone E (CP-0); NO-GO.
8. **Classic retirement** — Milestones F/G (CP-0); NO-GO.

A hosting target technically labelled **"Production"** inside a staging-only Vercel project is **not** actual production business use (`docs/erp-v2-frontend-deployment-config-hygiene-review.md:7`).

---

## 4. Environment & data boundary

R0 is defined strictly as:
- **Verified staging project only** (`dmc-platform-admin-web-staging`, alias `dmc-platform-admin-web-staging.vercel.app` per committed docs).
- **Verified staging frontend + backend only**; no actual-production reads; no production configuration; no live records; no customer-facing access.
- **Synthetic / non-live fixtures only.**
- **No credentials or tokens recorded in evidence.**

**Evidence CP-P1 must prove before any session (method, not values):** project name/ID; environment name/ID; service/project identity; a staging marker (e.g. a known synthetic marker record); the deployed commit SHA; the relevant read-only frontend availability; and an **explicit actual-production exclusion** (the real production admin-web project/domain identified and excluded). Concrete identifiers are established at CP-P1 time from the authoritative source — **not hardcoded here** — and **no secret values** are recorded.

---

## 5. Cohort & role policy

**Role positions (no staff names assigned by CP-P0):** Pilot Owner; Technical Observer; Finance Reviewer; Incident/Stop Authority; Evidence Recorder. A person may later hold multiple positions; **no individual is assigned here**.

- **Cohort roles are restricted to verified finance-visible roles only** — `admin`, `super_admin`, `finance` (`apps/api/src/auth/cost-visibility.ts:20`). No role inheritance is assumed. `operations`, `agent_admin`, `agent`, `viewer` are **prohibited** (see §15/Mandatory boundary).
- **Maximum R0 cohort: [REC] 1–2 finance-visible participants** (smallest practical), plus the non-participant Observer/Stop roles.
- **Per-participant controls (all [REC], all owner-approved at CP-P1/pilot time):** explicit approval before adding each participant; least-privilege access; defined access start/end time; session revocation; **no shared accounts**; **normal authentication only** (no token minting, no cookie transfer); mandatory sign-out; access-removal confirmation after the session.

---

## 6. Fixture allowlist (process, not populated)

**No fixture is pilot-approved by CP-P0.** Each fixture entering R0 must be added to an allowlist at pilot-authorization time with these attributes verified:

| Attribute | Requirement |
|---|---|
| Quote ID | recorded at approval |
| Title | clearly synthetic/UAT (e.g. "UAT-STAGING-… — DO NOT SEND") |
| Expected status | e.g. DRAFT |
| Expected totals | cost/sell recorded |
| Expected item count/types | recorded |
| Accepted version | none |
| Public token/link | none |
| Booking | none |
| Invoice | none |
| Live supplier/customer context | none |
| Owner | a **role**, not a person |
| Retention/cleanup | recorded |

**Example only (not auto-approved):** committed validation docs describe a synthetic UAT quote `fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01` ("UAT-STAGING-M3A-EXTERNAL-PACKAGE-CREATE — DO NOT SEND", retained item `4beecd88-…`) used in earlier technical validation (`docs/erp-v2-quote-builder-v2-external-package-edit-frontend-validation-report.md`). **Prior technical use does not make it pilot-approved** — it must pass the allowlist process above. No unverified fixture IDs are invented here.

---

## 7. R0 action allowlist & denylist (default-deny)

Anything not explicitly allowed is **prohibited**. Exposure of a prohibited affordance on a page is **not** permission to use it.

| Action | Allowed? | Reason | Evidence expectation | Stop condition |
|---|---|---|---|---|
| Sign in normally to verified staging admin-web | ✅ | required | role verified in UI | wrong/non-finance role |
| Open approved synthetic fixture quote | ✅ | read/review | fixture title/status match | non-allowlisted fixture |
| Navigate Quote Builder V2 steps | ✅ | review | screenshots (sanitized) | unexpected mutation affordance behaviour |
| Review itinerary content | ✅ | review | expected-vs-observed | — |
| Review selling totals | ✅ | review | expected-vs-observed | — |
| Review cost & margin | ✅ (finance cohort) | authorized role | expected-vs-observed | non-finance role present |
| Compare vs expected-results sheet | ✅ | verification | PASS/FAIL log | — |
| Record defects/usability (no sensitive data) | ✅ | purpose | defect refs | — |
| Sign out | ✅ | required | confirmed | cannot sign out |
| Create/remove/edit item | ❌ | mutation | — | any mutation request → stop |
| Edit descriptive text | ❌ | mutation | — | stop |
| Set Hotel primary | ❌ | mutation | — | stop |
| Apply Hotel/Transport/Experience pricing | ❌ | mutation | — | stop |
| Create/change passengers or rooming | ❌ | mutation | — | stop |
| Supplier assignment/confirmation/comms | ❌ | ops/send | — | stop |
| Create/open public links | ❌ | client exposure | — | stop |
| Accept | ❌ | side effects | — | stop |
| Create invoice/payment | ❌ | finance write | — | stop |
| Convert/create booking | ❌ | live op | — | stop |
| Generate/send voucher/packet | ❌ | send | — | stop |
| Send email | ❌ | send | — | stop |
| Access Classic write paths | ❌ | out of scope | — | stop |
| Use real/customer/live data | ❌ | policy | — | stop |
| Access actual production | ❌ | policy | — | stop |
| Internal proposal preview/download | ❌ **(default-excluded from R0)** | unnecessary for read/review | — | treat as R1 extension only |

**Proposal preview/download [REC]: exclude from R0** (unnecessary for the smallest read/review pilot). If an operational reason arises, present it as a separately approvable **R1** extension — not part of R0.

---

## 8. Session procedure (future; not executed)

**Before session:** approval record exists; target identity verified (§4); cohort role verified (finance-visible); fixture allowlist verified; expected-results sheet prepared; monitoring Observer available; Stop Authority available; Classic remains available; no incident already open; no environment change planned.

**Start:** authenticate normally; verify the visible signed-in role is finance-visible; verify a staging indicator; verify fixture title/status; **confirm no actual-production domain/project**; begin the evidence log.

**During:** navigate only approved R0 surfaces; compare expected vs observed; record defects without entering sensitive data; **do not click mutation/public/send controls**; **stop** on unexpected side effects, environment ambiguity, sensitive-data exposure, or role mismatch (§12).

**End:** record result; sign out; revoke temporary access if used; confirm no write/audit side effect was expected; confirm no fixture changed; preserve sanitized evidence; complete the incident or success sign-off.

---

## 9. Expected-results & evidence template (reusable; inline)

Copy per session. **No** password/cookie/token/connection-string/network-credential fields.

```
Session ID:            R0-____
Date / time (UTC):     ____
Environment identity:  project=____  env=____  service=____  (staging; production excluded: yes/no)
Deployment identifier: commit=____  (Ready: yes/no)
Participant (role):    ____ (finance-visible role only; NO name)
Fixture ID / title:    ____ / "UAT-STAGING-… — DO NOT SEND"
Approved surfaces:     [ ] Setup [ ] Itinerary [ ] Hotels(review) [ ] Experiences(review) [ ] Transport(review) [ ] Passengers(review) [ ] Pricing(review) [ ] Proposal(review — only if R1)
Expected result:       ____
Observed result:       ____
Verdict:               PASS / FAIL
Defect reference:      ____
Stop condition hit:    none / ____
No-mutation confirmed: yes/no
Sign-out / access removal confirmed: yes/no
Reviewer-role sign-off: ____ (role only)
```

---

## 10. Monitoring checklist (from B16)

**Technical Observer watches (future preflight/pilot):** application errors; authorization failures; unexpected mutation requests; unexpected Accept/booking/invoice/send requests; elevated error rates; feature-gate state; deployment health; audit anomalies; sensitive-data exposure (esp. cost fields to a non-finance context); fixture changes.

Separate the maturity levels:
- **Existing monitoring capability:** an escalation/alert *checklist* is documented (`docs/erp-v2-production-monitoring-plan-controlled-beta.md:45-53`).
- **Evidence it is configured:** **[UNVERIFIED]** — no repo proof of live alert wiring/dashboards. CP-P1 must verify what is actually observable (audit rows, error logs, gate state) and how.
- **Evidence a person is observing:** **[UNVERIFIED]** — an Observer role is defined but not staffed. CP-P1 must confirm an Observer is present before any session.
- **Evidence retained after session:** sanitized evidence log (§9) required; retention owner is a role, unassigned.

No dashboards, alerts, or owners are invented. Anything unproven is `[UNVERIFIED]` for CP-P1 to verify.

---

## 11. Incident & support procedure (from B18)

**Severity levels:**
- **P0** — actual-production or sensitive-data exposure; unexpected live side effect.
- **P1** — unauthorized write; role breach (non-finance sees cost); fixture corruption.
- **P2** — blocking staging defect, no data loss.
- **P3** — usability/cosmetic defect.

**Model:** the **Incident/Stop Authority** (or Pilot Owner) may stop the session; immediate stop triggers are §12; escalation is by role (Observer → Stop Authority → Owner); preserve evidence (sanitized, no secrets); report without secrets; fall back to Classic; **resumption requires new approval**; **no self-authorized continuation after P0/P1**. **Response-time targets [REC]:** P0 immediate stop; P1 stop within the session; P2/P3 logged. No actual people are assigned.

---

## 12. Stop conditions (immediate)

Stop immediately on any of: uncertainty whether the environment is staging; an unexpected actual-production domain/project; an unauthorized or non-finance role present; **meal `unitCost` (or any cost field) reaching a prohibited role**; any mutation request; any Accept/booking/invoice/public-link/supplier/voucher/packet/send request; any real/customer/live data; an unexpected fixture change; missing Stop Authority or Observer; monitoring unavailable; credentials/tokens exposed; a deployment mismatch; an audit anomaly; inability to sign out or revoke access.

**A stop is a safety success — never permission to work around the guard.**

---

## 13. Rollback & tabletop-rehearsal plan (from B17)

**For read-only R0, "rollback" =** stop the session; sign out; revoke access; disable the pilot access path if one was created; preserve evidence; confirm fixtures unchanged; return all work to Classic; document the incident; require approval before resumption. (R0 performs no writes, so there is nothing to un-write.)

**For future Scope M, additional requirements (recorded, not authorized):** feature-gate disable (`quote-item-create.flags.ts:18` / `quote-external-package-edit.flags.ts:23`); deployment rollback if needed; **synthetic-fixture reconciliation**; audit review; recovery verification.

**Scope M remains NO-GO until its rollback procedure is actually rehearsed and documented. CP-P0 does not claim any rehearsal occurred** — the recipes in `production-monitoring-plan-controlled-beta.md:64-70` and `governance-decisions-2026-07-15.md:56-59` are **documented, not rehearsed** (CP-a B17).

---

## 14. Classic fallback & reconciliation (from B20)

**For R0:** Classic remains authoritative; **no V2 write occurs**; **no dual entry is needed**; differences are recorded as **defects**, not corrected in V2 or Classic during the session; operational work continues in Classic.

**For future Scope M:** only synthetic fixtures; expected pre/post state; explicit **net-zero cleanup**; audit review; **no real-record coexistence**; no dual-write design inferred. **Real-record migration and coexistence remain later NO-GO tracks** (CP-0 Milestones E–G).

---

## 15. Meal `unitCost` residual-risk register

**Mandatory security boundary — finance-only R0 is required, not recommended.**

- **Exact verified path (CP-a):** `GET /api/quotes/:id` → `loadQuoteState` (`apps/api/src/quotes/quotes.service.ts:12690`, no cost redaction) → adapter `apps/admin-web/lib/quote-v2-adapter.ts:1298` sets `experiences[].unitCost = costBaseAmount`; the redactor (`apps/admin-web/lib/quote-v2-cost-redaction.ts`) only nulls `quote.pricing`, so `experiences[].unitCost` is **serialized to the browser**; it is only render-gated (finance) at `apps/admin-web/components/quote/v2/steps/item-pricing-apply-modal.tsx:128`.
- **Affected data:** meal line internal base **cost** (`QuoteItem.costBaseAmount`).
- **Affected roles:** non-finance readers — `operations`, `agent_admin`, `agent`, `viewer`.
- **Why finance-only R0 avoids disclosure:** the cohort is restricted to `admin`/`super_admin`/`finance` (`cost-visibility.ts:20`), which are **authorized** to see cost — so the field is not an unauthorized disclosure for them.
- **Why this is NOT considered fixed:** the value still ships to any non-finance browser today; **UI hiding is not server-side payload redaction**.
- **Mandatory precondition before ANY non-finance participation:** complete, test, validate, and document a server-side redaction so `experiences[].unitCost` is `null` (or omitted) for non-finance — e.g. extend `redactQuoteV2CostMargin` to null `experiences[].unitCost` when `canViewCostMargin` is false, and/or redact per-item cost columns in `loadQuoteState` for non-cost roles.
- **Required future regression coverage:** a test asserting `experiences[].unitCost === null` when `canViewCostMargin` is false; re-check `pricing.lines[].note` ([UNVERIFIED] possible cost text).
- **Required staging validation + validation documentation:** before enabling a non-finance cohort.

**Non-finance participation is prohibited in R0. This restriction is mandatory. CP-P0 does not implement the fix.**

---

## 16. Entry criteria for CP-P1

CP-P1 may be *proposed* only after all of these are documented and owner-approved: Ziad explicitly approves CP-P1; proposed cohort size and eligible finance roles approved; no staff names required until separately provided; staging-target verification method approved (§4); fixture allowlist prepared (§6); expected-results sheet prepared (§9); monitoring verification checklist prepared (§10); Stop Authority role identified; incident template ready (§11); tabletop scenario list ready (§17); actual production explicitly excluded; no mutation or public/send action included.

---

## 17. CP-P1 proposed scope

**CP-P1 = "Staging Target Preflight and Tabletop Rehearsal"** — non-mutating; **not** the staff pilot.

Possible CP-P1 activities: verify staging target identity; verify the deployed commit; verify an eligible finance role; verify a read-only fixture baseline; verify monitoring visibility; walk through stop conditions; tabletop a role mismatch; tabletop an unexpected mutation; tabletop environment ambiguity; tabletop sensitive-data exposure; tabletop access revocation; verify the sign-out/access-removal process.

**No live destructive negative tests. No production access. No pilot-participant access. No environment or flag change unless separately approved.**

**CP-P0 decision on CP-P1: `CONDITIONAL GO`** — GO to *propose and later run* CP-P1 after explicit approval; CP-P0 does **not** execute it.

---

## 18. Future Scope M gate

Scope M remains separate and **NO-GO** until **all** hold: R0 procedure is validated; CP-P1 passes; rollback is **rehearsed**; synthetic-fixture reconciliation is approved; a mutation action allowlist is separately approved; staging mutation gates are verified; **non-finance participation remains excluded OR the meal `unitCost` leak is fixed**; no public/Accept/booking/invoice/send capability is included; and Ziad explicitly authorizes Scope M.

---

## 19. Decision register

| # | Decision (later owner approval) | **[REC]** |
|---|---|---|
| 1 | Execute CP-P1 | **[REC] Yes**, after approval |
| 2 | R0 cohort size | **[REC] 1–2** finance-visible participants |
| 3 | Eligible finance roles | **[REC]** admin / super_admin / finance only |
| 4 | Fixture allowlist contents | **[REC]** synthetic UAT quotes only, per §6 |
| 5 | Exclude internal proposal preview/download from R0 | **[REC] Yes** (defer to R1) |
| 6 | Monitoring / Stop-Authority roles | **[REC]** assign at CP-P1 (roles, no names) |
| 7 | Access duration | **[REC]** time-boxed per session, revoked after |
| 8 | Tabletop scenarios | **[REC]** the §17 list |
| 9 | R0 pilot execution | **[REC]** separate approval after CP-P1 |
| 10 | Any Scope M planning | **[REC]** deferred (§18) |
| 11 | Any non-finance participation | **[REC] No** until the meal `unitCost` fix ships |
| 12 | Meal `unitCost` fix | **[REC]** only when a non-finance cohort is actually wanted |
| 13 | Any production/live/public/finance/send action | **[REC] No** |

Recommendations are not acted upon.

---

## 20. Final conclusion

**`CONDITIONAL GO — to CP-P1 staging-target preflight and tabletop rehearsal only, after explicit approval.`**

Reaffirmed **NO-GO** (unchanged by CP-P0): staff pilot execution; production rollout; live bookings; production mutation; Scope M; non-finance participation; public links; Accept; invoices/payments; booking conversion; supplier sending; voucher/packet sending; email/send; migration; Classic transition/retirement; Meal/Guide/Activity/Entrance edit expansion; Hotel/Transport deletion; the meal `unitCost` redaction fix implementation.

**Safety confirmation:** documentation-only; no code/schema/migration/flag/environment/pricing/data change; no staging/production/Vercel/Railway/DB/deployed-app/browser access; no test executed and no build/test artifact produced; no pilot/rehearsal/rollback/fixture/public-link/Accept/invoice/booking/voucher/packet/supplier/send/Classic action; no secrets, credentials, tokens, connection strings, PII, participant names, or invented environment/fixture/dashboard details are recorded here.

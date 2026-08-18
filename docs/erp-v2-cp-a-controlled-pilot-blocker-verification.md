# ERP V2 — CP-a: Controlled-Pilot Blocker Verification

**Status: verification only (documentation-only, read-only).** Challenges each alleged narrow-pilot blocker from CP-0 against **current code and tests**, classifies it, ranks only the blockers that remain real after scope-exclusion, and selects **exactly one** next track. No pilot, no implementation, no environment access, no data mutation is authorized.

Conventions: facts cited `path:line` or by PR; recommendations **[REC]**; unproven claims **[UNVERIFIED]**. Static inspection only — where a behavior is proven by test *source*, the test is cited; **no test was freshly executed**, and no build/test artifact was produced.

---

## 0. Governing policy preserved

ERP V2 build/test only; Classic system of record; no staff rollout / live bookings / actual-production access; production item mutation OFF; supplier sending disabled; voucher-send allowlist `ziad@axisdmc.com` only; no Accept/invoice/booking/conversion/public-link/voucher/packet/supplier-send/email/send; Hotel deletion NO-GO; Transport/unclassified deletion blocked; staging External Package edit gates may remain ON. **CP-a authorizes neither a pilot nor code.**

---

## 1. Executive verdict

- **CP-a is documentation-only and read-only. No pilot or implementation is authorized.**
- **Pilot Scope R (read/review only) is conceptually achievable after a *narrow, mostly operational* set of prerequisites** — provided the first cohort is restricted to finance-visible roles (which scope-excludes the one verified code leak, B1).
- **Pilot Scope M (guarded draft mutation) requires no new mutation code** (the guards are already-mitigated, B2) but does require the same operational prerequisites **plus** a completed rollback rehearsal and a synthetic-fixture reconciliation rule.
- **Recommended next track (exactly one): `CP-P0` — Controlled-Pilot Operating Procedure & Readiness (documentation).**
- **`CONDITIONAL GO` to `CP-P0`** (doc-only). It is needed before either scope regardless of B1, it scope-excludes B1 via cohort restriction, and it addresses the genuinely-remaining operational prerequisites without unnecessary code.
- **CP-S (broad cost/margin security remediation) is NOT selected.** Current code shows B1 is *partially mitigated* with a single, precisely-located field leak that is scope-excludable — a broad security track is not warranted (§5, §10).

---

## 2. Evidence authority

- **CP-0** roadmap: `docs/erp-v2-only-critical-path-controlled-pilot-readiness-plan.md` (PR #857).
- **Stale/superseded:** `docs/erp-v2-quote-builder-v2-capability-inventory.md:89` (2026-07-18) alleged "cost/margin shown in the internal V2 builder UI without enough role-gating." **Superseded in part** by the server-side hydration redaction (PR #766/#767) verified below — but **one residual leak remains** (§5). The July claim was *directionally* right but is now over-broad.
- **Current code:** `apps/admin-web/app/quotes/[id]/builder-v2/page.tsx`; `apps/admin-web/lib/quote-v2-cost-redaction.ts`; `apps/admin-web/lib/quote-v2-adapter.ts`; `apps/api/src/quotes/quotes.service.ts`; `apps/api/src/quotes/quote-experiences-v2.service.ts`; `apps/api/src/auth/cost-visibility.ts`.
- **Current tests:** `apps/admin-web/lib/quote-v2-cost-redaction.test.ts`; `apps/admin-web/app/quotes/[id]/builder-v2-cost-margin-{gating,payload-redaction}.test.ts`; `builder-v2-add-*-preview-confirm.test.ts`; `apps/api/src/quotes/quotes-public-link.test.ts`.
- **Operational docs:** `docs/erp-v2-production-monitoring-plan-controlled-beta.md`; `docs/erp-v2-governance-decisions-2026-07-15.md`; `docs/erp-v2-internal-staff-controlled-usage-plan.md` (2026-07-18, "GO for controlled internal staff use" — **superseded** by the 2026-08-11 owner build/test reframing, `docs/erp-v2-frontend-deployment-config-hygiene-review.md:7`).
- **Evidence gaps [UNVERIFIED]:** live flag values on any deployed target (not read); completion of any rollback rehearsal (no evidence); the public Accept→invoice path exercised (untested, later-milestone).

---

## 3. Pilot-scope comparison

| Dimension | **Scope R (read/review)** | **Scope M (guarded draft mutation)** |
|---|---|---|
| Allowed actions | open approved quotes/fixtures; review itinerary/totals; review cost/margin (finance roles only); proposal preview/download **only if separately included** | Scope R **plus** guarded create/remove (5 Experience types) + guarded External Package commercial edit, on approved non-live fixtures |
| Excluded actions | any item mutation; Accept; booking; finance write; public link; supplier/voucher/packet send; live data | Hotel/Transport mutation; unclassified mutation; Accept/booking/finance/public/supplier/send |
| Data class | synthetic / approved non-live only | synthetic / approved non-live only |
| Roles **[REC]** | **finance-visible only (admin/super_admin/finance)** to scope-exclude B1 | same; mutation additionally gated by role + editable status |
| Security exposure | pricing block server-redacted; **one meal-cost field leaks to non-finance (B1)** → excluded by finance-only cohort | same as R; mutation responses are server-redacted (verified §7) |
| Rollback needs | none (no writes) | gate-disable + Classic fallback; **rehearsal required** |
| Monitoring needs | audit/error visibility (documented) | plus write/drift monitoring |
| Classic interaction | reads only; **no dual-entry problem** | synthetic-fixture reconciliation rule (no real-record coexistence) |
| Prerequisites | operating procedure (CP-P0); finance cohort | CP-P0 + rollback rehearsal + fixture reconciliation rule |
| Current readiness | **achievable after CP-P0** (doc-only) | **achievable after CP-P0 + rehearsal** (no new mutation code) |

**[REC] Scope R should precede Scope M.** R has no writes, no dual-entry, and scope-excludes B1 with a finance cohort; M adds already-built guarded mutation that is gated OFF-by-default and needs only the operational rehearsal.

---

## 4. Blocker-verification matrix

| ID | Original concern | Current source evidence | Test/doc evidence | Affected scope | Classification | Residual risk | Required evidence / remediation | Pilot stop/go |
|---|---|---|---|---|---|---|---|---|
| **B1** | Internal cost/margin not role-gated | pricing block server-redacted `page.tsx:78`, `quote-v2-cost-redaction.ts:38-47`; **leak:** meal `experiences[].unitCost`←`costBaseAmount` via `quotes.service.ts:12690`(no redaction)→`quote-v2-adapter.ts:1298` | redaction tests cover pricing block only (`quote-v2-cost-redaction.test.ts:40-63`); **no test** on `unitCost` | R & M (non-finance roles) | **Verified blocker (narrow, partial); scope-excludable** | one cost field to non-finance browsers on meal-containing quotes | **scope-exclude** by finance-only cohort; **or** null `experiences[].unitCost` for non-finance + test | GO Scope R with finance cohort; fix required before non-finance cohort |
| **B2** | Item-create ack/delta parity | `quote-experiences-v2.service.ts:805-807` (`confirmation_required`), `:791-794` (`stale_preview`), post-write drift `:818-849`; UI two-step confirm sends `acknowledgedDelta=true` `experiences-step.tsx:768` | `builder-v2-add-*-preview-confirm.test.ts` | M only | **Already-mitigated** | none (checkbox is cosmetic) | none | no impact; excludable from R |
| **B12** | Public-link/client-facing safety | public routes require `publicEnabled:true`+token, set only by explicit `enablePublicLink` (`quotes.service.ts:654-697`); Accept `SENT`-gated `:1097-1101`; public payload sell-only `:1006`; PDF redaction `proposal-v3.mapper.ts:70-100` | `quotes-public-link.test.ts:38,65` | later-milestone | **Scope-excludable + already-mitigated + later-milestone** | none for R/M (opening a quote triggers nothing public) | pilot forbids public links | no impact |
| **B16** | Monitoring operationalization | alert/escalation rules documented `production-monitoring-plan-controlled-beta.md:45-53` | doc only | R & M | **Operational prerequisite** | manual checklist not operationalized/owned | assign owner + confirm audit/error/gate visibility | GO after ownership assigned |
| **B17** | Rollback rehearsal | recipes documented `production-monitoring-plan-controlled-beta.md:64-70`, `governance-decisions-2026-07-15.md:56-59` | doc only; **[UNVERIFIED]** no rehearsal evidence | M (and any live) | **Operational prerequisite** | procedure not rehearsed | complete a rehearsal + retain evidence | GO Scope M only after rehearsal |
| **B18** | Support/incident model | owner + backup + escalation + evidence + Classic fallback documented `production-monitoring-plan-controlled-beta.md:52-70` | doc only | R & M | **Operational prerequisite (largely documented)** | formal severity levels / response SLAs unstated | tighten severity + assign roles (no names) | GO after roles assigned |
| **B20** | Classic fallback / dual-entry | "Open in Classic always available" `production-monitoring-plan-controlled-beta.md:66`; Classic system of record | doc only | R = n/a; M = rule needed | **R: not a blocker; M: operational prerequisite; real-record: later-milestone** | dual-entry only if real records used | synthetic-fixture reconciliation rule (no real-record coexistence) | R GO; M GO after rule defined |

---

## 5. B1 finance-data trace

`backend source → server loader/redactor → serialized payload → client props/state → visible UI`

**Path A — pricing summary block (SAFE):**
- `QuotesService.findOne`/`loadQuoteState` returns raw quote → `loadQuoteV2` adapter builds `pricing.netCost/markupPercent/margin/lines[].amount` (`quote-v2-adapter.ts:1351-1353,1178`).
- **Server redaction:** `page.tsx:78` `redactQuoteV2CostMargin(quote, canViewCostMargin)`; the redactor nulls `pricing.netCost/markupPercent/margin/lines[].amount` for non-finance (`quote-v2-cost-redaction.ts:38-47`); only `safeQuote` is passed to the client (`page.tsx:201`).
- **Result:** cost/margin summary is **absent from non-finance payloads**. Authorization occurs server-side. ✓

**Path B — per-item cost blocks (SAFE):** backend omits the per-item `cost` block for non-finance entirely (`quotes.service.ts:6932-6942` hotel contract/rate summary is finance-gated; `quote-types.ts:397/405` "present ONLY when the backend included it (finance roles)"). ✓

**Path C — backend mutation responses (SAFE):** `redactResponseCost` recursively nulls nested `totalCost` (`quotes.service.ts:3588-3601`) at preview/apply/edit-preview echoes; V2 experiences create/remove responses gate cost via `showCost = canViewQuoteCostMargin(actor?.role)` (`quote-experiences-v2.service.ts` create/remove); the External Package **edit** path is finance-only at the route + service. ✓

**Path D — meal `unitCost` (LEAK, delivered-but-hidden):**
- Backend `loadQuoteState` (`quotes.service.ts:12690`) spreads raw `quoteItems` with **no cost redaction** (actor used only for company scope).
- Adapter sets `experiences[].unitCost = costBaseAmount` for meal items **unconditionally** (`quote-v2-adapter.ts:1298`; via `mapExperiences` `:437`).
- The **redactor does not touch `experiences[]`** (`quote-v2-cost-redaction.ts` operates only on `quote.pricing`).
- So for a **meal-containing** quote, `experiences[].unitCost` (an internal base **cost**) ships in the hydration payload to **non-finance** roles (operations, agent, viewer, agent_admin).
- It is only **rendered** behind a finance gate (`item-pricing-apply-modal.tsx:128`, opened only when `canViewCostMargin`), so it is **hidden in the UI but present in the browser payload** — a hidden component is **not** sufficient; the data reached the browser.
- **Exact leak — field:** `experiences[].unitCost` ← `QuoteItem.costBaseAmount`; **route/source:** `GET /api/quotes/:id` → `loadQuoteState` (`quotes.service.ts:12690`); **adapter:** `quote-v2-adapter.ts:1298`; **redactor gap:** `quote-v2-cost-redaction.ts:38-47`; **roles:** non-finance readers; **missing test:** no assertion that `experiences[].unitCost === null` when `canViewCostMargin` is false.
- **Secondary [UNVERIFIED], lower confidence:** `pricing.lines[].note` (= `pricingDescription`) is preserved by the redactor and *may* embed cost-like text; not confirmed to contain cost.

**Conclusion:** B1 is **partially mitigated**. It is **not** a broad "internal UI shows cost" problem (that is fixed server-side); it is **one narrow, delivered-but-hidden field on meal items**, scope-excludable by a finance-visible cohort or fixed by a one-field redaction change.

---

## 6. Role-by-capability matrix (verified)

Cost-visible = `canAccessFinance`/`canViewQuoteCostMargin` = admin/super_admin/finance (`apps/api/src/auth/cost-visibility.ts:20`). Edit routes = admin/finance (`quote-experiences-v2.controller.ts:137,152`). Create/remove routes = admin/operations/finance (`:79,89,106,119`).

| Role | View totals (sell) | View item cost | View margin | **Receives cost in payload** | Commercial-edit controls | Create/remove items | Proposal/public output |
|---|---|---|---|---|---|---|---|
| super_admin | ✅ | ✅ | ✅ | ✅ (authorized) | ✅ edit | ✅ | sell-only (redacted) |
| admin | ✅ | ✅ | ✅ | ✅ (authorized) | ✅ edit | ✅ | sell-only |
| finance | ✅ | ✅ | ✅ | ✅ (authorized) | ✅ edit | ✅ | sell-only |
| operations | ✅ | ❌ (UI) | ❌ | ⚠️ **meal `unitCost` only (B1)** | ❌ | ✅ | sell-only |
| agent_admin | ✅ | ❌ | ❌ | ⚠️ **meal `unitCost` only (B1)** | ❌ (blocked at service) | ✅ (create/remove) | sell-only |
| agent | ✅ | ❌ | ❌ | ⚠️ **meal `unitCost` only (B1)** | ❌ | [UNVERIFIED] role reach | sell-only |
| viewer | ✅ | ❌ | ❌ | ⚠️ **meal `unitCost` only (B1)** | ❌ | ❌ (read) | sell-only |

⚠️ = the single B1 leak; everything else is server-gated. Any cell marked [UNVERIFIED] needs a route-role trace not required for a finance-cohort pilot.

---

## 7. Existing-test coverage (proven vs not; not freshly run)

**Proven by test source:**
- Pricing-block payload redaction: `quote-v2-cost-redaction.test.ts:40-63` asserts `netCost/markupPercent/margin/lines[].amount` zeroed and per-item **sell** `amount` preserved.
- Server-side forwarding of `safeQuote`: `builder-v2-cost-margin-payload-redaction.test.ts` (source-grep of `page.tsx`).
- Visual gating: `builder-v2-cost-margin-gating.test.ts` (Restricted text, sidebar margin hidden).
- Guarded create preview→confirm + ack + stale-preview: `builder-v2-add-*-preview-confirm.test.ts`.
- Public-link `publicEnabled` gating: `quotes-public-link.test.ts:38,65`.

**Not proven (evidenced gap):**
- No test asserts `experiences[].unitCost === null` for non-finance (the B1 leak).
- No test [UNVERIFIED] on `pricing.lines[].note` cost-text content.

No test was executed for CP-a; the above reflect **test source**, not a run.

---

## 8. Scope-exclusion register

Valid only when access + UI/process controls make the action unreachable or clearly governed.

| Risk | Excluded by | Reachable during pilot? |
|---|---|---|
| Public links / customer exposure | pilot forbids enabling links; enable requires explicit authenticated action + SENT (`quotes.service.ts:654-697,1097`) | No |
| Accept / auto-invoice | SENT-gated; pilot quotes stay DRAFT; no Accept action | No |
| Booking conversion | requires `acceptedVersionId` + flag; excluded | No |
| Finance writes | Classic-only; not in scope | No |
| Supplier/voucher/packet send | disabled; allowlist `ziad@axisdmc.com`; excluded | No |
| Live/real data | synthetic/approved-non-live fixtures only | No |
| Production mutation | prod gates OFF; pilot on staging build/test | No |
| Unsupported/Hotel/Transport item types | fail-closed / excluded | No |
| **B1 meal cost leak** | **finance-visible cohort only** (roles authorized to see cost) | No (with finance cohort); Yes if non-finance reviewers included |

---

## 9. Ranked residual blockers (after scope-exclusion + code verification)

**Scope R (read/review) — residual:**
1. **CP-P0 operating procedure** (owner, support, monitoring operationalization, Classic-fallback confirmation) — operational.
2. **B1 cohort restriction** (finance-visible only) — a *scope rule*, not code, for R.

**Scope M (guarded mutation) — additional residual:**
3. **B17 rollback rehearsal** (documented, not rehearsed) — operational.
4. **B20 synthetic-fixture reconciliation rule** — operational.
5. (B2 already-mitigated; no code.)

**Later live / V2-only / retirement (not pilot blockers):** B12 public/Accept path; finance writes; catalog/hotel/transport authoring; migration; Classic retirement; and — only if a non-finance reviewer cohort is ever wanted — the one-field B1 redaction fix.

---

## 10. Recommended next track (exactly one)

**`CP-P0` — Controlled-Pilot Operating Procedure & Readiness.**

- **Purpose:** define the operating model, monitoring operationalization, rollback-rehearsal plan, support/incident model, and Classic-fallback/synthetic-fixture rules for the narrowest **Scope R** pilot (finance-visible cohort), so a pilot could later be *authorized* by the owner.
- **Why first:** it is required before *either* scope regardless of B1; it **scope-excludes B1** via the finance cohort; and the remaining real work is **operational, not code**. Per discipline, prefer the smallest operational-readiness document over unnecessary code.
- **Type:** documentation (operating procedure / readiness), **not** code.
- **Proposed filename:** `docs/erp-v2-cp-p0-controlled-pilot-operating-procedure.md`
- **Proposed PR title:** `docs: define ERP V2 controlled-pilot operating procedure`
- **In-scope work:** Scope R cohort + role rule (finance-visible); approved synthetic/non-live fixture criteria; authorized vs prohibited actions; monitoring operationalization checklist (owner, audit/error/gate visibility) built on `production-monitoring-plan-controlled-beta.md`; a **rollback-rehearsal plan** (to be executed later, separately) distinguishing gate-disable vs deployment rollback vs data reconciliation; support/incident model (severity, stop authority, evidence preservation — no names); Classic-fallback rule; explicit stop/exit criteria; the B1 cohort-restriction condition and the one-field redaction fix as the precondition for widening to non-finance reviewers.
- **Out-of-scope:** any code/flag/schema/env change; running the pilot or rehearsal; staff names/access; real data; Scope M authorization; the B1 redaction fix implementation; Meal/Guide/Activity/Entrance edit.
- **Acceptance criteria:** every operational prerequisite (B16/B17/B18/B20) has a defined owner-role + evidence requirement; Scope R is fully specified with the finance cohort; B1 is recorded with its exact fix precondition; exactly one Markdown file; `git diff --check` clean; secret scan clean.
- **GO/NO-GO conditions:** GO to *write* CP-P0. NO-GO to executing a pilot, a rehearsal, or any code. A later pilot remains a separate owner decision.
- **Proposed small-slice sequence:** CP-P0 (this doc) → *[owner decision: approve pilot objective + Scope R]* → optional narrow B1 redaction fix **only if** a non-finance cohort is approved (plan → code → validation) → rollback-rehearsal execution (operational) → owner-authorized Scope R pilot → Scope M after rehearsal. One active code slice at most; never parallel code tracks.

**CP-S is not selected** (B1 is narrow + scope-excludable, not a broad security gap). CP-Q is not needed (B2 already-mitigated). CP-PR0 is not needed (B12 scope-excludable). CP-RR0/CP-MON0 are folded into CP-P0 as a single small operational document rather than separate tracks.

---

## 11. Decisions requiring Ziad's approval

| # | Decision | **[REC]** |
|---|---|---|
| 1 | Scope R before Scope M | **[REC] Yes** |
| 2 | Synthetic / approved-non-live fixtures only | **[REC] Yes** |
| 3 | First-pilot cohort = finance-visible roles only (scope-excludes B1) | **[REC] Yes** for the first pilot |
| 4 | Exclude proposal preview/download from the first pilot | **[REC] Yes** (defer; re-confirm client-safety later) |
| 5 | Exclude guarded mutation from the first pilot (Scope R only) | **[REC] Yes** initially; add Scope M after rehearsal |
| 6 | Require a completed rollback rehearsal before Scope M | **[REC] Yes** |
| 7 | Fix the B1 meal-`unitCost` leak now vs defer | **[REC] Defer** — not needed for a finance cohort; do it only before a non-finance cohort |
| 8 | Assign monitoring/support ownership (roles, later) | **[REC] Yes**, at pilot-authorization time |
| 9 | Selected next track = CP-P0 | **[REC] Yes** |

Recommendations are not acted upon here.

---

## 12. Final boundary

Reaffirmed NO-GO / not-authorized by CP-a: pilot execution; staff access; live bookings; production mutation; supplier/voucher/packet sends; Accept/invoice/booking side effects; migration; Classic read-only transition or retirement; any additional Experience commercial-edit track; Hotel/Transport deletion; the B1 redaction fix implementation.

**Safety confirmation:** documentation-only, read-only; no code/schema/migration/flag/environment/pricing/data change; no staging/production/Vercel/Railway/DB/deployed-app/browser access; no test executed and no build/test artifact produced; no send/booking/invoice/voucher/packet/Classic action; no secrets, credentials, tokens, connection strings, PII, or staff names recorded.

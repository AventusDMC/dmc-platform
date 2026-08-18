# ERP V2 — CP-0: V2-Only Critical Path & Controlled-Pilot Readiness Plan

**Status: planning only (documentation-only).** This document translates the completed read-only next-slice assessment into one current, decision-ready roadmap. It **does not** authorize a pilot, production rollout, live bookings, staff access, Classic retirement, or any runtime/flag/schema/data change. No environment was accessed to produce it.

Conventions: documented facts are cited by `path:line` or by PR number; recommendations are marked **[REC]**; claims the repository does not prove are marked **[UNVERIFIED]** with the evidence that would settle them. Conversation history is **not** used as evidence.

---

## 0. Governing policy preserved by CP-0 (standing decisions)

These remain in force and unchanged by this plan:

- ERP V2 remains build/test only; **Classic remains the system of record**.
- No staff rollout; no live bookings; no production access.
- Production item create/delete/edit mutation remains **OFF**.
- Supplier sending remains **disabled**; voucher-send allowlist remains `ziad@axisdmc.com` only.
- No Accept, invoice, booking, conversion, public-link, voucher, packet, supplier-send, email, or send action without explicit separate approval.
- Hotel deletion remains **NO-GO** under HD-a (`docs/erp-v2-quote-builder-v2-hotel-item-delete-prerequisite-report.md:7`); Transport and unclassified deletion remain blocked.
- Staging External Package edit gates may remain ON for build/test.
- **No new production gate is recommended for immediate enablement by this document.**

**Approved planning ≠ authorization to execute.** CP-0 being approved authorizes only the writing of this plan and (conditionally) a later read-only CP-a verification slice. It does not authorize any planned work to begin.

---

## 1. Executive summary

- **CP-0 is documentation-only.** It is **not** a rollout authorization.
- **Immediate strategic recommendation [REC]:** prioritize **controlled-pilot readiness** over additional Experience commercial-edit breadth.
- **Meal commercial edit remains a possible later feature track (`ME-0`), not the current active slice.**
- **The binding V2-only blockers are broader than Quote Builder item mutation** — they are finance writes, Product/Catalog + hotel/transport authoring, supplier and voucher/packet *sending*, migration of active Classic records, pilot execution, and a Classic read-only/retirement transition — **all unstarted or deliberately disabled** (§3, §6, §7).
- **Production rollout remains 0% started by deliberate policy** (`docs/erp-v2-frontend-deployment-config-hygiene-review.md:7`).
- **Classic remains the system of record** until separately approved transition criteria (Milestones D–G, §4) are met.

**Overall recommendation: `CONDITIONAL GO — to a read-only CP-a prerequisite/roadmap-verification slice only`.** CP-a is **not** authorized for runtime work by this document (§17).

---

## 2. Source authority & inventory reconciliation

**The named capability inventory is stale.** `docs/erp-v2-quote-builder-v2-capability-inventory.md:3` is dated **2026-07-18** and predates the guarded create (M-series), delete (D-series), and External Package edit (E-series) work. It remains a valid historical snapshot; CP-0 **does not modify or silently replace it**. Where it conflicts with later code/docs, the later evidence governs.

**Authoritative later sources (repo-verified):**

| Track | Documents (PR) | Code anchor |
|---|---|---|
| Activity create determinism | PR #769, #771 | `apps/api/src/quotes/quote-item-create.flags.ts:18` |
| Guide create | PR #786 (plan), #787–#789 (impl/fix), #790 (validation) | `quote-experiences-v2.service.ts` |
| Meal create | PR #830 (readiness), #831 (backend), #832/#834 (validation) | `quotes.service.ts:7734` |
| Entrance/Ticket create | PR #835 (readiness), #836 (backend), #837/#839 (validation) | `quotes.service.ts:7705` |
| External Package create | PR #840 (readiness), #841 (backend), #842/#844 (validation) | `quotes.service.ts:7821` |
| Guarded item delete (5 types) | PR #845 (readiness), #846 (backend), #847/#849 (validation) | `quote-experiences-v2.service.ts:948-955` |
| Hotel item delete | PR #850 (readiness), #851 (prerequisite **NO-GO**) | `docs/…hotel-item-delete-prerequisite-report.md:7` |
| External Package commercial edit | PR #852 (readiness), #853 (backend), #854 (validation), #855 (frontend), #856 (frontend validation) | `quote-experiences-v2.controller.ts:137,152` |
| Product/Catalog boundary | — | `docs/erp-v2-product-catalog-hotels-capability-review.md:11,60` |
| Owner build/test reframing | — | `docs/erp-v2-frontend-deployment-config-hygiene-review.md:7` (committed 2026-08-11) |

**Reconciliation table (older recorded → current verified):**

| Capability | Older recorded state (`capability-inventory.md`, 07-18) | Current verified state | Authoritative evidence | Remaining gap |
|---|---|---|---|---|
| Guide create | ⛔ Classic (line 28) | Built + staging-validated, gate OFF in prod | PR #786–#790 | prod-gated OFF |
| Meal create | ⛔ Classic (line 33) | Built + staging-validated, gate OFF | PR #830–#834 | prod-gated OFF |
| Entrance create | — (line 31: price only) | Built + staging-validated, gate OFF | PR #835–#839 | prod-gated OFF |
| External Package create | — (line 32) | Built + staging-validated, gate OFF | PR #840–#844 | prod-gated OFF |
| Item remove (5 types) | not present | Built + staging-validated, gate OFF | PR #845–#849; `quote-experiences-v2.service.ts:951-955` | prod-gated OFF |
| External Package commercial edit | not present | Built + staging + deployed-frontend validated, gate OFF | PR #852–#856 | prod-gated OFF |
| Hotel delete | not present | **NO-GO** (structural) | PR #851; report `:7` | closed |
| `QUOTE_PRICING_HOTEL_APPLY` staging/prod inconsistency | flagged (lines 54,72) | Reconciled per hotel-apply validation | `docs/erp-v2-quote-builder-v2-hotel-apply-validation-report.md` | — |
| "Production" enablement roll-ups | phrased as "production" | Reframed by owner as internal build/test target | `frontend-deployment-config-hygiene-review.md:7` | see §Terminology |

**Facts that remain [UNVERIFIED] in-repo (need evidence):** exact current `NEXT_PUBLIC_*`/backend flag values on each deployed target (the config-hygiene review describes them narratively; live values were not read for CP-0 and must not be assumed); the untested public Accept→invoice path (`quotes.service.ts:1129`, flagged as a risk in `capability-inventory.md:94`).

CP-0 does not alter the stale inventory file; it supersedes it **factually** for the reconciled rows above.

---

## Terminology (required) — three distinct meanings of "production"

To prevent conflation, this plan uses three separate terms and classifies every material historical "production" claim.

1. **Actual production business use** — real staff, real customers, live bookings, real financial side effects, production data, and operational reliance. **This does not exist for ERP V2** (`frontend-deployment-config-hygiene-review.md:7`: "no real-life production usage, no staff rollout, and no live bookings").
2. **Technical deployment target labelled "Production"** — a hosting-provider (Vercel/Railway) environment label assigned to a project's main branch. It may belong to a staging-only or internal build/test project and **does not by itself prove actual production business use** (`frontend-deployment-config-hygiene-review.md:7`: "Any use of the word 'production' … refers only to the technical Vercel production deployment target … not real operational production"; the canonical internal build/test admin-web is `dmc-platform-admin-web-4gu9.vercel.app`, `:8,26`).
3. **Internal build/test deployment** — technically deployed, may have staging gates enabled, but remains outside staff rollout and live operations.

**Classification of material historical "production" claims:**

| Historical claim / source | Refers to | Classification |
|---|---|---|
| "production enablement roll-up" (`final-production-enablement-rollup-2026-07-18.md`) | flags flipped on the technical Vercel target | **technical label / internal build-test** per owner reframing (`frontend-deployment-config-hygiene-review.md:7`, later, 2026-08-11) |
| `prod-*-smoke-report.md` files (booking-creation, ops-supplier, packet-no-send, voucher, passenger-rooming) | smokes run against the technical target with synthetic/test records | **internal build/test** (owner: "no live bookings"); [UNVERIFIED] as actual-production business use |
| `internal-staff-controlled-usage-plan.md:76,81` "GO for controlled internal staff use" (2026-07-18) | a **proposal** for controlled internal use | **superseded** by the later owner statement "no staff rollout" (`frontend-deployment-config-hygiene-review.md`, committed 2026-08-11). Ambiguity resolved in favour of the later doc **and** this task's governing policy. |
| "Classic remains the system of record" (all roll-ups + `build-mode-completion-plan.md:74,109`) | operational authority | unambiguous, still current |

**Rule applied throughout:** a deployment label is never read as business rollout; an actual-production reference is never read as staging safety. Where a source is ambiguous, it is marked and the more conservative reading is used.

---

## 3. Current operational boundary

Legend: Built · Partial · Staging-validated (SV) · Deliberately-disabled (DD) · Classic-only · **NO-GO** · Unstarted · Unknown. "Prod" = the technical Vercel target, **not** actual production business use.

| Area | Technical capability | Validated capability | Authorized operational use |
|---|---|---|---|
| Quote Builder read/display | Built | SV | build/test only |
| Activity create / remove / edit | create+remove Built(SV, gate OFF); commercial edit via legacy apply only | SV | none (prod gates OFF) |
| Guide create / remove / edit | create+remove Built(SV); no guarded money-edit; deterministic-config only | SV | none |
| Meal create / remove / edit | create+remove Built(SV); guarded money-edit **not built** | SV | none |
| Entrance/Ticket create / remove / edit | create+remove Built(SV); apply live on target; edit non-deterministic | SV | none |
| External Package create / remove / **commercial edit** | all Built(SV + deployed-frontend validated, PR #852–#856); gate OFF prod | SV | none (staging build/test) |
| Hotels | preview+apply present; **authoring Classic-only; delete NO-GO** | Partial | none |
| Transport | preview + single-leg apply; tariffs/regime Classic | Partial | none |
| Unclassified/legacy rows | **fail-closed** (`quote-experiences-v2.service.ts:955`) | n/a | none |
| Proposals / public links | Built (`@Public()`) | Partial | build/test only |
| Accept | Built; **auto-creates invoice** (`quotes.service.ts:1129`) | **[UNVERIFIED] public path untested** (`capability-inventory.md:94`) | none |
| Booking conversion | Built + smoke on target | Partial | none (no live bookings) |
| Finance / invoices / payments | **writes Classic-only** | read-only V2 | none |
| Product/Catalog | **read-only aggregator; zero edit routes** (`product-catalog-hotels-capability-review.md:11,60`) | n/a | none |
| Supplier operations | assignment/confirmation present; **sending DD** | Partial | none |
| Voucher/packet generation | generate/preview/download present | SV (target) | build/test only |
| Voucher/packet **sending** | **DD** (allowlist `ziad@axisdmc.com`) | n/a | none |
| Permissions/audit/redaction | largely Built; residual: internal builder cost/margin not role-gated (`capability-inventory.md:89`) | Partial | — |
| Monitoring / rollback | documented (`production-monitoring-plan-controlled-beta.md:45,64`) | doc-complete | — |

**Separation required:** *technical capability* (code exists) ≠ *validated capability* (staging-validated) ≠ *authorized operational use* (currently **none** beyond internal build/test).

---

## 4. Milestone definitions (must not be conflated)

For each: entry criteria → exit criteria → required evidence → approval owner → rollback condition → still-prohibited.

- **Milestone A — Internal build/test complete.** *Entry:* per-type create/remove/edit staging-validated. *Exit:* all in-scope surfaces staging-validated with fail-closed gates. *Evidence:* the merged validation reports. *Owner:* V2 owner. *Rollback:* disable staging gate. *Prohibited:* staff rollout, live data. **(Largely reached for the built surfaces.)**
- **Milestone B — Controlled staff pilot *ready*.** *Entry:* pilot scope (§5) approved; pilot blockers (§6) resolved; kill-switch (§13) rehearsed. *Exit:* owner sign-off that the pilot may start. *Evidence:* CP-a verification + a pilot operating model (§12). *Owner:* V2 owner. *Rollback:* do not start. *Prohibited:* live bookings, real customer data. **This document plans Milestone B but does not authorize it.**
- **Milestone C — Controlled staff pilot *completed*.** *Entry:* separately approved pilot executed. *Exit:* pilot report with incidents, rollback drills, Classic reconciliation, user feedback. *Owner:* V2 owner. *Rollback:* revert to Classic-only. *Prohibited:* expanding scope mid-pilot.
- **Milestone D — Limited live V2 operation.** *Entry:* explicit production + live-booking approval. *Exit:* stable limited live operation with Classic fallback. *Owner:* business owner. *Rollback:* return to Classic. *Prohibited:* Classic write-disable.
- **Milestone E — V2 becomes system of record.** *Entry:* approved finance, catalog, booking, migration, data-governance, and operational controls. *Exit:* V2 authoritative with Classic still readable. *Owner:* business owner. *Rollback:* dual-run. *Prohibited:* Classic retirement.
- **Milestone F — Classic read-only transition.** *Entry:* migration + reconciliation + rollback + sign-off. *Exit:* Classic writes disabled, reads retained. *Owner:* business owner. *Rollback:* re-enable Classic writes. *Prohibited:* deleting Classic data.
- **Milestone G — Classic retirement.** *Entry:* stable read-only period + operational-stability threshold. *Exit:* Classic decommissioned. *Owner:* business owner. *Rollback:* limited (archival). *Prohibited:* premature data destruction.

---

## 5. Controlled-pilot minimum scope (planning only)

**[REC] Narrowest safe pilot candidate:** a supervised, reversible **Quote Builder review + draft-authoring** pilot with **Classic authoritative and explicit Classic fallback**, using approved staff only and approved synthetic / specifically-approved non-live fixtures.

**[REC] Include only (each requires validated evidence + an operational reason):**
- Read-only quote review — *evidence:* read surfaces staging-validated.
- Draft quote creation / itinerary edit — *evidence:* item-create + itinerary-edit staging-validated (gates OFF prod); **[REC]** pilot on a **staging** target, not prod.
- Guarded Experience create/remove (5 types) — *evidence:* PR #845–#849; **[REC]** synthetic fixtures only.
- Guarded External Package commercial edit — *evidence:* PR #852–#856 (deployed-frontend validated).
- Proposal preview/download — **decision required** (§16), default **[REC] exclude** until client-facing safety re-confirmed.

**Excluded pilot actions (mandatory):** live booking conversion; Accept; invoice/payment writes; public-link/customer exposure; supplier send; voucher/packet send; any production item mutation; real customer/booking/financial data; Hotel/Transport authoring; Hotel/Transport/unclassified deletion.

Rule: **a capability is not in-pilot merely because it exists** — it requires validated evidence and an explicit operational reason.

---

## 6. Pilot blockers & prerequisite register

Severity: P = pilot-blocking (narrow pilot), R = V2-only/retirement-only. Status from cited evidence.

| ID | Blocker | Milestone | Evidence | Sev | Status | Prerequisite | Next action | Stop/Go |
|---|---|---|---|---|---|---|---|---|
| B1 | Internal builder cost/margin not role-gated | B | `capability-inventory.md:89` | **P** | open | role-gate internal UI cost/margin | scope a CP-S slice | GO pilot only if gated or finance-only cohort |
| B2 | Item-create lacks delta/ack parity | B | `capability-inventory.md:92` | P (low) | open | add ack parity | CP-Q slice | advisory |
| B3 | Accept→invoice side effects; public path untested | D | `quotes.service.ts:1129`; `capability-inventory.md:94` | R | **[UNVERIFIED]** | verify path (no live test) | CP-A read-only review | NO-GO to live until verified |
| B4 | Booking-snapshot `serviceType`/`operationType` mapping | D | `docs/erp-v2-quote-builder-v2-hardening-plan.md:69` | R | open | reconcile mapping | CP-B | NO-GO live booking |
| B5 | Hotel room-category/occupancy depth | D/E | `hardening-plan.md:67` | R | open | deepen hotel apply | CP-H | — |
| B6 | Product/Catalog authoring absent | E | `product-catalog-hotels-capability-review.md:11,60` | **R (structural)** | unstarted | catalog write track | CP-C readiness | NO-GO system-of-record |
| B7 | Hotel authoring/rate/contract maintenance | E | same `:60` | R | Classic-only | — | CP-H | — |
| B8 | Transport authoring/pricing regimes | E | `capability-inventory.md:30` | R | Classic-only | — | CP-T | — |
| B9 | Finance/invoice/payment writes | E | `capability-inventory.md:84`; catalog review `:60` | R | Classic-only | — | CP-F | NO-GO |
| B10 | Supplier assignment vs **sending** | D/E | `production-monitoring-plan-controlled-beta.md:§3`; allowlist standing | R | assign present; send **DD** | — | CP-SUP | NO-GO send |
| B11 | Voucher/packet generation vs **sending** | D/E | allowlist `ziad@axisdmc.com` standing | R | gen present; send **DD** | — | CP-V | NO-GO send |
| B12 | Public-link/client-facing safety | B/D | `capability-inventory.md:97` | P/R | partial | re-confirm gating | CP-S | default exclude from pilot |
| B13 | Migration of active Classic records | F | no migration doc **[UNVERIFIED]/unstarted** | R | unstarted | migration plan | CP-M readiness | NO-GO retirement |
| B14 | Record reconciliation (V2↔Classic) | C/F | — | R | unstarted | reconciliation design | CP-M | — |
| B15 | Permissions & audit review | B | `capability-inventory.md:17-18` | P (low) | largely done | confirm coverage | CP-S | — |
| B16 | Monitoring/alerting | B | `production-monitoring-plan-controlled-beta.md:45` | P | doc-complete | operationalize | CP-P | — |
| B17 | Rollback rehearsal | B | same `:64` | **P** | doc-only | rehearse kill-switch | CP-P | GO pilot only after rehearsal |
| B18 | Support/incident process | B | same `:53` | P | doc-only | assign owner | CP-P | — |
| B19 | Staff training & access control | B/C | `internal-staff-controlled-usage-plan.md:25` | P | superseded/unstarted | training plan | CP-P | approval required |
| B20 | Classic fallback & dual-entry risk | B/D | governing policy | **P** | design needed | reconciliation rule | CP-P | GO only with fallback defined |
| B21 | Classic read-only/retirement planning | F/G | no doc **[UNVERIFIED]/unstarted** | R | unstarted | retirement plan | CP-R | NO-GO |

**Narrow-pilot-only blockers:** B1, B2, B12, B15, B16, B17, B18, B20 (plus scope discipline §5). **V2-only/retirement blockers:** B3–B11, B13, B14, B19, B21. A narrow pilot **does not** require the R-severity blockers to be closed.

---

## 7. Critical-path workstreams (defined, not opened)

| ID | Objective | Current status | Dependencies | Risk | Smallest first slice | Evidence needed | Required for | NO-GO boundary |
|---|---|---|---|---|---|---|---|---|
| **CP-S** | security, permissions, cost/margin redaction | largely built; internal-UI gap | — | Med | role-gate internal builder cost/margin | code review + test | pilot | no exposing cost to non-finance |
| **CP-Q** | Quote Builder determinism & error recovery | edit/apply guarded; create ack gap | CP-S | Med | create ack parity | tests | pilot | no non-deterministic mutation enabled prod |
| **CP-A** | Accept & invoice side-effect verification | untested public path | — | **High** | read-only trace of Accept→invoice | code map | live op | no live/staging side-effect test |
| **CP-B** | booking conversion & snapshot safety | built + smoke | CP-A | High | mapping reconciliation | code review | live op | no live bookings |
| **CP-C** | Product/Catalog authoring | **unstarted (read-only)** | — | **High** | catalog-write readiness plan | model review | system-of-record | no catalog writes |
| **CP-H** | Hotel operational completeness | partial; delete NO-GO | CP-C | High | occupancy depth review | — | live op | hotel delete stays NO-GO |
| **CP-T** | Transport operational completeness | partial | CP-C | High | regime review | — | live op | no broad apply enable |
| **CP-F** | finance writes & reconciliation | Classic-only | CP-A | **High** | finance-write readiness | model review | system-of-record | no finance writes |
| **CP-SUP** | supplier workflow & sending | assign present; send DD | — | High | send-readiness criteria | — | live op | sending stays disabled |
| **CP-V** | voucher/packet generation & sending | gen present; send DD | CP-SUP | Med | send-readiness criteria | — | live op | send stays allowlist-only |
| **CP-M** | migration & coexistence | **unstarted** | CP-C,CP-F | **High** | migration decision register | data audit | retirement | no destructive migration |
| **CP-P** | controlled pilot, training, support, rollback | doc-only | CP-S,CP-Q | Med | pilot operating model | rehearsal | pilot | no staff rollout without approval |
| **CP-R** | Classic read-only & retirement | **unstarted** | CP-M | **High** | retirement criteria | reconciliation | retirement | no Classic write-disable |

**[REC]** A narrow pilot depends primarily on **CP-S, CP-Q, CP-P** — not all workstreams.

---

## 8. Product/Catalog structural blocker (own section)

**Verified boundary (fact):** Catalog V2 is a **read-only aggregator — no create/update/delete anywhere** (`docs/erp-v2-product-catalog-hotels-capability-review.md:11`); **V2 has zero catalog-editing routes; all authoring is Classic** (`:60`); catalog edit is explicitly **NO-GO** now (`:127`). Therefore **Quote Builder independence ≠ system-of-record independence** while every rate/contract/supplier/product change requires Classic.

**Later readiness-track questions (do not implement / do not authorize):** minimum catalog-write capability before a pilot (**[REC]** likely *none* — pilot uses existing catalog read-only); minimum before system-of-record; master-data ownership & validation; supplier/service identity; hotel contract/rate authoring; audit & permissions for catalog writes; migration & conflict resolution; rollback & Classic coexistence.

---

## 9. Finance, Accept & booking boundary

Documented separately:
- **Read-only finance visibility:** present in V2.
- **Invoice/payment/reconciliation writes:** Classic-only (`capability-inventory.md:84`).
- **Public Accept:** built, `@Public()` (`capability-inventory.md:39`); path **[UNVERIFIED] untested** (`:94`).
- **Automatic invoice creation:** Accept calls `ensureInvoiceForAcceptedQuote` (`apps/api/src/quotes/quotes.service.ts:1129`); also reachable via `createInvoice` (`:2253`) and the invoices controllers (`apps/api/src/invoices/invoices.controller.ts`, `invoice-portal.controller.ts`).
- **Booking conversion:** `convertToBooking` (`quotes.controller.ts:847`) and the V2 route (`quote-booking-v2.controller.ts`); gated by `QUOTE_BOOKING_CREATE`.
- **Live-booking side effects:** none authorized.

**Known routes/services where Accept, invoice, or booking side effects can occur:** `quotes.service.ts:1129` (Accept→invoice), `:2253` (createInvoice), `quotes.controller.ts:847` (convertToBooking), `quote-booking-v2.controller.ts`, `apps/api/src/invoices/*`.

**CP-0 authorizes no live or staging side-effect validation.** Evidence required before each enters a pilot/live milestone: a **read-only** trace of the Accept→invoice→booking chain (CP-A), reconciliation design, and explicit owner approval per Milestone D.

---

## 10. Supplier, voucher, packet & communication boundary

Distinct stages: **generation → preview → download → sending → supplier communication → allowlisting.**

Facts:
- **Supplier sending remains disabled**; **voucher-send allowlist remains `ziad@axisdmc.com` only** (standing invariant, repeated across roll-ups; `production-monitoring-plan-controlled-beta.md:§3`).
- Voucher/packet **generation/preview/download** exist; **sending** is deliberately disabled.
- **[REC]** No send operation belongs in the initial pilot without separate approval. **Generation being validated does not prove sending readiness.**

Future evidence requirements (do not enable): supplier-send authorization model; recipient-validation + allowlist governance; audit of every send; opt-in per booking; rollback of a mistaken send.

---

## 11. Migration & coexistence strategy

**No active-record migration plan and no Classic-retirement plan currently exist in-repo [UNVERIFIED/unstarted]** (searched docs; only a synthetic-test-data cleanup plan exists, which is not migration).

A later migration plan (**CP-M**) must decide: which records migrate; active vs historical; identity mapping; attachments/documents; quote revisions; bookings; invoices/payments; supplier confirmations; audit history; reconciliation; **dual-write prohibition vs controlled coexistence**; rollback; cutover; Classic read-only period; retirement criteria.

**[REC] No immediate or destructive migration.** Coexistence with Classic-authoritative + V2-read/build-test is the only currently safe posture.

---

## 12. Controlled-pilot operating model (all parameters **[REC]**, none authorized)

- **Cohort:** **[REC]** ≤ 2 supervised internal users (roles decided at approval — no names here, no access enabled).
- **Roles:** **[REC]** finance-visible admin for cost surfaces; operations for non-cost.
- **Fixtures/data:** **[REC]** approved synthetic or specifically-approved non-live only; **no real customer/booking/financial data**.
- **Authorized actions:** **[REC]** the §5 include-list only.
- **Prohibited actions:** the §5 exclude-list (mandatory, not [REC]).
- **Classic comparison/reconciliation:** **[REC]** every pilot quote mirrored/checked in Classic.
- **Daily review + audit review:** **[REC]** review audit rows + totals daily.
- **Monitoring/support:** **[REC]** per `production-monitoring-plan-controlled-beta.md:45,53`.
- **Incident severity + kill switch + rollback + stop conditions + exit criteria:** **[REC]** per §13.

No staff names; no access enabled; no real data authorized.

---

## 13. Rollback & kill-switch plan (inventory + plan; no gate changed)

**Existing gates (fact):** dual-gate model — backend `QUOTE_*` flags (fail-closed default OFF) + mirrored frontend `NEXT_PUBLIC_QUOTE_*` build-time flags. Item mutation is behind `QUOTE_ITEM_CREATE` (`apps/api/src/quotes/quote-item-create.flags.ts:18`) and `QUOTE_EXTERNAL_PACKAGE_EDIT` (`quote-external-package-edit.flags.ts:23`); pricing via `quote-pricing-preview-flags.ts`. Rollback recipes documented in `production-monitoring-plan-controlled-beta.md:64` and governance decisions.

**Distinguish:** frontend build-time gate (redeploy to change) vs backend runtime gate (env change) vs the technical-"Production" target's gates vs staging gates vs feature-specific gates vs deployment rollback (redeploy prior build) vs **data rollback/reconciliation** (no automated path today — **[UNVERIFIED]/manual**).

**Plan (**[REC]**):** who may order a stop = V2 owner; stop triggers = any unexpected write/side-effect, redaction leak, or reconciliation mismatch; safe disable = turn the relevant backend gate OFF + redeploy frontend OFF; preserve audit evidence = capture audit rows/screenshots before any change; return work to Classic = Classic remains authoritative throughout; confirm no residual side effect = reconcile totals + check no invoice/booking/send occurred.

**No gate is changed by CP-0.**

---

## 14. Sequenced roadmap (approval-gated; one active code slice)

Shortest route to a controlled pilot first, then V2-only. Each code slice: plan → prerequisite → implementation → validation → validation-doc, with validation before the next slice and explicit GO/NO-GO. **Only one code track active at a time.** A doc-only planning track may run in parallel only if it authorizes no implementation.

1. **CP-0** (this doc). → GO/NO-GO: approve controlled-pilot objective + scope direction.
2. **[REC] Immediate next slice after CP-0: `CP-a` — read-only pilot-blocker verification** (doc-only). Verify/rank §6 blockers for the narrowest pilot; select exactly one first implementation/readiness track; produce acceptance evidence; **remain read-only; no environment access; stop before code.**
   - *Proposed filename:* `docs/erp-v2-cp-a-controlled-pilot-blocker-verification.md`
   - *Proposed PR title:* `docs: verify ERP V2 controlled-pilot blockers`
   - *Acceptance criteria:* every §6 P-severity blocker re-verified with `path:line`/PR; one first track chosen with rationale; no runtime diff; `git diff --check` clean.
   - *Must remain stopped:* all NO-GO items in §17.
3. Then, per CP-a's selection, **one** of: **CP-S** (cost/margin role-gating) or **CP-P** (pilot operating model + rollback rehearsal) — **[REC]** likely **CP-S first** (it is a true P-blocker, B1). Full plan→…→validation-doc sequence, one active.
4. Feature-breadth tracks (**`ME-0`** Meal edit, **`G-0`** Guide edit) remain **available but deprioritized** — open only if the owner chooses breadth over pilot-readiness (§16).

**[REC]** The immediate next slice (CP-a) advances **pilot readiness**, not feature breadth.

---

## 15. Progress measurement (transparent, multi-metric)

Each metric = numerator / denominator; **code existence or a deployment label alone does not count as operational readiness** (operational readiness additionally requires validated, authorized, reconcilable, reversible operation on approved data).

| Metric | Numerator | Denominator | Completion evidence | Planning estimate |
|---|---|---|---|---|
| Quote Builder feature coverage | item types × {create,remove,edit} built | full type×op matrix | merged validation reports | — |
| Build/test validation | surfaces staging-validated | surfaces built | validation PRs | — |
| **Quote Builder V2 item-mutation build/test** | — | — | — | **~60–75%** |
| **Overall ERP V2 build/test** | — | — | — | **~50–65%** |
| **Operational readiness** | pilot-blockers closed | pilot-blockers total | CP-a + rehearsals | **~10–20%** |
| **Production rollout** | authorized live surfaces | — | owner approval | **0% (deliberate policy)** |
| **Classic-retirement readiness** | retirement blockers closed | total | migration+read-only+sign-off | **~5–10%** |

These ranges are **planning estimates, not commitments**. **No dates are given.**

**Scenarios (relative sequences, assumptions — no calendar):**
- **Optimistic:** goal narrows to a supervised **staging** pilot on synthetic fixtures; CP-a → CP-S (role-gating) → CP-P (rollback rehearsal) → pilot-ready. Blockers: only B1/B17/B20.
- **Realistic:** pilot also wants read finance parity + booking-conversion trace; adds CP-A (read-only), CP-B. Blockers: Accept→invoice verification, mapping.
- **Conservative:** true V2-only/retirement; every §7 R-workstream + CP-M migration + CP-R retirement + org change-management. Blockers: catalog authoring, finance writes, migration, sending.

---

## 16. Decision register (owner decisions required before progressing beyond CP-0)

| # | Decision | **[REC]** |
|---|---|---|
| 1 | Approve the controlled-pilot **objective** | **[REC] Yes** — pilot readiness is the highest-value direction. |
| 2 | Approve the **smallest pilot scope** (§5) | **[REC] Yes** — review + draft-authoring, synthetic fixtures, Classic-authoritative. |
| 3 | Which **prerequisite track begins first** | **[REC] CP-a** (read-only verification), then **CP-S**. |
| 4 | Exclude **real data** from the first pilot | **[REC] Yes** — synthetic/approved-non-live only. |
| 5 | Does **proposal preview/download** belong in scope | **[REC] Defer** until client-facing safety re-confirmed. |
| 6 | Does **guarded mutation** belong in the first pilot | **[REC] Yes, limited** — create/remove/ext-pkg-edit on synthetic fixtures on **staging**. |
| 7 | Approve **roles/staff cohort** | **[REC] Later** — not in CP-0/CP-a. |
| 8 | Approve **production access** | **[REC] No** — separate future approval. |
| 9 | Approve **live-booking testing** | **[REC] No** — separate. |
| 10 | Approve **finance side effects** | **[REC] No** — separate. |
| 11 | Approve **supplier/voucher sending** | **[REC] No** — stays disabled. |
| 12 | Approve **migration strategy** | **[REC] No** — CP-M plan first. |
| 13 | Approve **Classic read-only transition** | **[REC] No** — Milestone F. |
| 14 | Approve **Classic retirement** | **[REC] No** — Milestone G. |
| 15 | Continue **feature breadth (ME-0/G-0)** vs pilot prep | **[REC] Pilot prep** — breadth is near diminishing operational returns. |

Recommendations are **not** acted on here.

---

## 17. GO / NO-GO conclusion

**`CONDITIONAL GO — to a read-only CP-a prerequisite verification slice only.`**

CP-a should: verify and rank the true blockers for the **narrowest** controlled pilot; select **exactly one** first implementation/readiness track; produce explicit acceptance evidence; **remain read-only; avoid environment access and data mutation; stop before code.**

**The following remain NO-GO** (unchanged by this plan): staff-pilot execution; production rollout; live bookings; Accept/invoice/booking side-effect testing; production mutation; supplier sending; voucher/packet sending; migration; Classic read-only transition; Classic retirement; Meal/Guide/Activity/Entrance edit **implementation**; Hotel/Transport deletion.

**Safety confirmation:** documentation-only; no code/schema/migration/flag/environment/pricing/data change; no staging/production/Vercel/Railway/DB/deployed-app access; no send/booking/invoice/voucher/packet/Classic action; no secrets, credentials, tokens, connection strings, PII, staff names, or invented environment metadata are recorded here.

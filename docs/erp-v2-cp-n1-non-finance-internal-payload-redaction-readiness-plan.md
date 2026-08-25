# ERP V2 — CP-N1: Non-Finance Internal-Payload Redaction Readiness Plan

**Documentation-only, read-only, static.** Produced from committed code, tests, and Git/PR history on current `main` (contains CP-N0 merge `a8491c351d9efaf89ec0fd94148eaac3334d8558`). **No** Vercel/Railway/staging/production/browser/application/database/authentication/log/business-data access. This plan does **not** authorize implementation, environment access, non-finance participation, or a pilot.

Legend: **[FACT]** = verified against current code (`file:line`); **[REC]** = recommendation; **[UNVERIFIED]** = not provable from the repo; **[DECISION REQUIRED]** = owner decision.

---

## 1. Purpose & current boundary

- **[FACT]** CP-N0 (PR #868) returned **NO-GO** to a non-finance Operations staging read/review session, fail-closed on unredacted internal-data exposures beyond the meal fix.
- **[FACT]** Non-finance ERP V2 participation remains **prohibited**.
- **[FACT]** CP-Sb (PR #866) closed **only** the Meal `experiences[].unitCost` leak; the redactor (`apps/admin-web/lib/quote-v2-cost-redaction.ts:44-59`) touches only `pricing.netCost/markupPercent/margin`, `pricing.lines[].amount`, and `experiences[].unitCost`.
- **CP-N1 plans the treatment** of the remaining verified internal-data exposures: `transport[].supplier`, `pricing.lines[].note`, hotel `diagnostics.reasons[]`, and (as a security-review item) `meta.publicToken`.

---

## 2. Re-verification of every CP-N0 finding on current `main`

All confirmed first-hand on `main`. The redactor does **not** touch any of these; each is delivered to the browser for the roles noted (even where the UI hides it).

| # | Field | Type | Adapter/source | Redacted? | Reaches non-finance browser? |
|---|---|---|---|---|---|
| A | `transport[].supplier` | `TransportService.supplier: string` (non-optional) — `quote-types.ts:225` | `quote-v2-adapter.ts:1195` (name), `:1222`/`:473` (`?? "Unassigned"`) | **NO** | **YES** (rendered in transport step) |
| B | `pricing.lines[].note` | `CostLine.note: string` (non-optional) — `quote-types.ts:305` | `quote-v2-adapter.ts:1180` (`it.pricingDescription ?? ""`), `:561` (`asString(r.note)`) | **NO** | **YES — delivered even though UI-hidden** (rendered only inside the finance-gated branch `pricing-step.tsx:67`; non-finance see a "Restricted" placeholder but the value still travels in the payload) |
| C | hotel `diagnostics.reasons[]` | `HotelSelection.diagnostics?: HotelDiagnostics` — `quote-types.ts:131`; `reasons: string[]` — `quote-hotel-diagnostics.ts:50` | producer `quote-hotel-diagnostics.ts:90` (contract name), `:103-105` ("Rate on file (from Classic): {pricingSummary}"), `:114` (room category); sources `adapter.ts:1006-1010`, wired `:400` | **NO** | **YES** (rendered in the hotels-step "Why?" expander) |
| D | `meta.publicToken` | `QuoteMeta.publicToken?: string \| null` — `quote-types.ts:473` (+ `publicEnabled?` `:475`) | `quote-v2-adapter.ts:1419`, `mapMeta :295` | **NO** | **YES — capability token delivered to all internal roles** |

- **[FACT]** `pricingDescription`/`note` is documented (`quote-types.ts:560-565`) with an example that concatenates client-descriptive routing **and** internal rate/discount text ("… | Per vehicle | Supplier transport discount 25% applied") in one free-form pipe string.
- **[FACT]** No raw-object spread smuggles ERP fields into the payload (only `{ ...demoQuote, id }` dev fallback, `adapter.ts:1544`); hotel `ratePerNight`/`cityTax` are hard-coded `0` for real data (`adapter.ts:1082-1083,1140`); supplier email/phone and contract **id** are not serialized (only supplier **name**). Tests for the redactor (`quote-v2-cost-redaction.test.ts:103-129`) cover finance/non-finance/unknown roles for the meal path but assert nothing about A–D.

---

## 3. Consumer & compatibility inventory

### A. `transport[].supplier`
- **[FACT]** Sole normalized-Quote consumer: the V2 transport step — `transport-step.tsx:46` (`svc.supplier.toLowerCase() === "unassigned"`, **no null guard**), `:83` (rendered chip), `:84` (ContractBadge suppressed when "unassigned"). The summary sidebar does not read it.
- **[FACT]** **Not null-safe** — `:46` throws on `null`/`undefined` (type is non-optional `string`). Empty `""` does not crash but mis-renders the badge as assigned.
- Adapter already substitutes `"Unassigned"` (`:473`, `:1222`).
- **Operationally:** display/context only; supplier/rate assignment is Classic-managed (`transport-step.tsx:209-210`). Not required to operate the read-only step.
- **Client-facing selling info stays intact** without the supplier name (selling `amount` is a separate field).

### B. `pricing.lines[].note`
- **[FACT]** Sole consumer: `pricing-step.tsx:67`, a bare JSX expression **inside the finance-gated (`canViewCostMargin ?`) branch** (`pricing-step.tsx:52-98`); non-finance get the "Restricted" placeholder (`:82-98`). React-tolerant of `null`/`undefined`/`""` (no string method called).
- **UI change under redaction:** **none for non-finance** (already not rendered); for finance, unchanged (finance is not redacted).
- **Content:** MIXED internal + client text, **not reliably separable** (`quote-types.ts:562`). **[REC]/fail-closed:** treat the whole string as internal.
- Client-facing selling info stays intact (the line `label` and `amount` are separate from `note`).

### C. hotel `diagnostics.reasons[]`
- **[FACT]** Sole consumer: hotels-step "Why?" UI — `hotels-step.tsx:228-230` (`diagnostics?.reasons ?? []`, `contractStateLabel(diagnostics?.contractState)`), `:378-404` (renders each reason as `<li>`, gated on `reasons.length > 0`). Fully guarded; empty array simply hides the expander.
- **[FACT]** `HotelDiagnostics` has **structured** readiness fields with **no sensitive text** — `contractState` (`quote-hotel-diagnostics.ts:44`), `hasRate` (`:45`), `source` (`:47`); only `reasons[]` (`:50`) embeds the contract name and rate text. The row badge uses `hotel.contractStatus` (`hotels-step.tsx:258`), not diagnostics.
- **[FACT]** Diagnostics is **display-only** — "never affects pricing, the contract badge, or proposal readiness" (`quote-types.ts:126-131`; `quote-hotel-diagnostics.ts:1-7`). Scrubbing `reasons[]` breaks no calculation.
- **Operationally:** the structured `contractState`/`hasRate` carry the readiness signal Operations needs; the free-form contract-name/rate lines are internal.

### D. `meta.publicToken`
- **[FACT]** **Capability-bearing share token.** Consumers: `quote-builder-v2.tsx:550` → `proposal-step.tsx:158,283,288-292` (`shareUrl = ${origin}/proposal/${publicToken}`), copy-link `:335-344`, rendered `:902-919`; Classic parallel via `ShareQuoteButton.tsx:25-38`.
- **[FACT]** The token **alone** grants access: public routes are `@Public()` and resolve by token only — `public-proposals.controller.ts:5`, `quotes.controller.ts:315-349` (`public/:token/view|accept|request-changes`), `quotes.service.ts:851-853/876-878/1072-1074/1148-1149` (`where: { publicToken, publicEnabled: true }`, no actor/role/company check). So token + `publicEnabled=true` = anonymous read **and** anonymous accept/request-changes state mutation.
- **[FACT]** Null/omit is crash-safe (adapter coalesces `:295`/`:1419`; `proposal-step.tsx:283/288` degrade to "Enable link" state). Not required by non-finance builder logic; the share affordance is itself handler-gated (`proposal-step.tsx:876`, `quote-builder-v2.tsx:552-553`) and **re-fetches a fresh token on enable** (`builder-v2-client.tsx:962-985`), so omitting the hydrated token does not block a permitted user.

---

## 4. Proposed redaction contracts (narrowest safe)

**A. `transport[].supplier` — [REC] REPLACE with the existing non-identifying sentinel `"Unassigned"` for non-finance.** Never `null`/omit (type is non-optional `string`; `transport-step.tsx:46` would crash). Preserves transport itinerary/service info; finance retains the real supplier identity. Non-finance UI: the existing red "Unassigned" + hidden contract badge.

**B. `pricing.lines[].note` — [REC] blank to `""` for non-finance** (server-side). Content is internal/mixed and not separable → fail closed on the whole string. Keep the line `label` and `amount` (selling). No non-finance UI change (already gated out of the DOM); closes the delivered-but-hidden payload. Finance unchanged.

**C. hotel `diagnostics.reasons[]` — [REC] preserve structured `contractState`/`hasRate`/`source`; scrub the sensitive `reasons` lines for non-finance** (drop the contract-name line `quote-hotel-diagnostics.ts:90` and the "Rate on file (from Classic): …" line `:103-105`; room-category line `:114` is low-sensitivity — **[DECISION REQUIRED]** keep or drop). Simplest crash-safe form: set `reasons = []` for non-finance while keeping the structured fields. Does not change hotel pricing or readiness (display-only). **[DECISION REQUIRED]** whether to prefer emitting structured diagnostic codes over free-form strings as a longer-term hardening (out of CP-N1b scope).

**D. `meta.publicToken` — [REC] treat as a SEPARATE security/authorization track, not the display-redaction slice.** It is a live capability credential (anonymous read + accept/request-changes via `@Public()` routes), so its handling needs an authorization decision, not text scrubbing. **[DECISION REQUIRED]**: (i) omit/null the serialized token for non-finance; (ii) omit for **all** internal hydration roles (finance included) since the share affordance re-fetches on enable; or (iii) omit whenever `publicEnabled=false`. **[REC]** option (ii) is the strongest (no consumer needs the hydrated token; enable re-fetches), but it touches finance behavior and the share UI, so it warrants its own slice + review. Do not expose or reproduce any token value.

---

## 5. Redaction boundary options

| Option | Assessment |
|---|---|
| **Extend `redactQuoteV2CostMargin` (single V2 hydration choke point)** | **[REC] for A/B/C.** It already receives `canViewCostMargin` (fail-closed for unknown roles via `canAccessFinance`), runs server-side before `page.tsx:78` hydration, is pure/immutable, and does not affect Classic or the backend. Adding `transport.map`, `pricing.lines[].note`, and `hotelCities[].options[].diagnostics` scrubbing here is the smallest auditable change. |
| Redact in the adapter | Rejected: the adapter is role-unaware at field-mapping sites; would thread role through many functions and risk drift. |
| Redact in individual services/controllers | Rejected for A/B/C (admin-web hydration is the choke point; backend is unchanged). Relevant only for D if the token is gated at the backend quote-fetch. |
| Split finance redaction from metadata/token redaction | **[REC] for D.** `publicToken` is a capability token with different role/permission semantics than display text; keep it in a separate track (may still live in the same module later, but decided/tested separately). |

**Recommended boundary:** extend `redactQuoteV2CostMargin` for **A/B/C** (display redaction, fail-closed, finance-exact, no flag); handle **D** as a separate security track. No client-side-only control; no OFF switch (see §9).

---

## 6. Role matrix (expected response per field)

| Role class | A `transport[].supplier` | B `pricing.lines[].note` | C `diagnostics.reasons[]` | D `meta.publicToken` |
|---|---|---|---|---|
| **Finance** (`admin`, `super_admin`, `finance`) | real supplier name (unchanged) | real note (unchanged) | full reasons (unchanged) | **[DECISION REQUIRED]** — under option (ii) omitted for finance too |
| **Non-finance** (`operations`, `agent_admin`, `agent`, `viewer`) | `"Unassigned"` | `""` | reasons scrubbed (structured kept) | omitted/null |
| **Unknown / undefined / null** (fail closed) | `"Unassigned"` | `""` | reasons scrubbed | omitted/null |

- Fail-closed is inherited from `canViewCostMargin = canAccessFinance(role)` (returns `false` for unrecognized roles) — same predicate CP-Sb already proves.
- **[DECISION REQUIRED]** `meta.publicToken` may need a **different** permission rule than the finance/cost predicate (it is a capability token, not cost data) — hence its separate track.

---

## 7. Test plan (for CP-N1b, when approved)

Focused unit tests on the extended redactor (mirroring `quote-v2-cost-redaction.test.ts`):
- Every recognized finance role retains exact A/B/C values; every non-finance role gets the redacted contract.
- Unknown/undefined/null roles **fail closed** to the redacted contract.
- Null/already-empty inputs: absent supplier → stays `"Unassigned"`; empty note → stays `""`; null diagnostics/empty reasons → no crash.
- **Multiple** transport legs, pricing lines, and hotel-diagnostic entries all redacted (map over arrays).
- **No input-object mutation** (purity/immutability contract preserved).
- Selling/itinerary/readiness data preserved: `transport[].amount`, `pricing.lines[].label`/`amount`, `pricing.sellingPrice`/`perPerson`/`pax`, `diagnostics.contractState`/`hasRate` all intact.
- Finance-visible values retained **exactly** (same-reference early return).
- **No alternative alias or free-form string retains the redacted info** (assert no `costBaseAmount`/`baseCost`/contract-name/"Rate on file"/"discount" substrings survive for non-finance).
- Public-token behavior (its own test in the separate track): omitted/null for the chosen role rule; share affordance still works via re-fetch.
- **Regression:** existing CP-Sb Meal + `pricing.*` suites (20/20) and siblings (8/8) stay green; relevant UI hydration/consumer tests (`pricing-step`, `transport-step`, `hotels-step` where present).
- **TypeScript baseline comparison:** confirm no new `tsc` errors in changed files vs the known 11-error baseline.

---

## 8. Staging-fixture & validation plan (for later, separately-approved staging validation)

- **[UNVERIFIED]** Documented synthetic fixtures with the needed shapes:
  - Transport supplier identity — **[UNVERIFIED]** no documented synthetic V2 fixture with a named transport supplier found; the meal fixture `13238d51…` has Transport: Missing.
  - Pricing-line internal notes — present on any priced line (meal fixture's meal lines carry a `note`).
  - Hotel diagnostics with a contract/rate reason — **[UNVERIFIED]** the meal fixture has Hotels: Missing; the H-A1 fixture `9c450350` (documented) contains matched/contract hotel option sets and is the likely candidate — reverify by hard guard.
  - Public-token state — **[UNVERIFIED]** requires a fixture with `publicEnabled=true`; none documented as retained for this purpose. **[DECISION REQUIRED]** whether the publicToken track needs its own fixture.
- **Do not access environments in CP-N1.** All fixture facts must be re-verified live by hard guard before any approved session.
- **Assertions:** finance hydration retains A/B/C (and token per decision); Operations hydration shows `"Unassigned"`, `note=""`, scrubbed `reasons`, and no token; **zero business mutations**; fixture invariant; network method/path/status classification; sign-out + protected-route denial. No real/live quotes; no mutation modal/action opened.

---

## 9. Deployment isolation

- **[FACT]** Merge-to-`main` auto-deploys **all** admin-web projects (staging, `-4gu9`, vestigial) and Railway (per the CP-Sb evidence and `docs/erp-v2-frontend-deployment-config-hygiene-review.md`).
- **[REC]** The redaction must be **unconditional** — **no OFF switch or feature flag** that could re-enable exposure (a security control must not be toggleable). This mirrors CP-Sb (no flag).
- **Validation-approach options** (choose at CP-N1b approval, **[DECISION REQUIRED]**):
  1. **Isolated preview** — cleanest IF server-side hydration works there; but CP-Sb showed the protected preview intercepts the server-side `/api/quotes/:id` fetch, so authenticated payload validation failed there. Likely unusable again.
  2. **Temporary staging-alias deployment** with captured baseline + **mandatory restoration** (the CP-Sb Option C pattern) — worked; requires deterministic Vercel control (owner-performed promotion/restoration, since this session has no Vercel API access).
  3. **Separately approved merge/deploy followed by staging validation** — validate on the post-merge staging alias (as the CP-Sb meal validation ultimately did).
- **[REC]** Option 2 or 3, owner-driven, mirroring CP-Sb. **A separate owner decision is required before any implementation PR is merged or the production read path changes.** Do not choose any approach that bypasses Vercel deployment protection.

---

## 10. Risks & non-goals

**Risks:** accidental removal of legitimate operational/client-facing info (mitigated: A keeps "Unassigned" sentinel, B/C keep labels + structured readiness); partial redaction leaving an alias or sensitive free-form string (mitigated by the §7 "no surviving substring" assertion); finance regression (mitigated by same-reference early return + finance-exact tests); **public-token capability leakage** (the highest-severity item — handled as its own track); protected-preview server-side hydration limitation (§9); automatic production deployment on merge (§9); schema/type incompatibility (A must stay `string` — non-optional; B stays `string`); UI crashes or misleading empty/zero fallbacks (A must not be nulled; verified guards for B/C/D).

**Out of scope:** pricing or mutation logic; hotel/transport authoring or deletion; the Apply-modal `unitCost ?? 0` cosmetic; authentication credential/default-password hardening; stateless-session revocation; general audit-query/live-log monitoring; staff rollout, pilots, production business use, and Classic retirement.

---

## 11. Proposed PR sequence (small slices)

1. **CP-N1** — this readiness plan (documentation-only). ← this PR.
2. **CP-N1a** — read-only prerequisite verification (confirm consumer inventory, null/empty tolerance, fail-closed predicate, fixture availability, deployment-isolation options; no code).
3. **CP-N1b** — implementation + tests only for **A/B/C** (extend `redactQuoteV2CostMargin`), subject to separate approval and a deployment-isolation decision.
4. **Staging validation** — finance vs Operations hydration assertions, zero mutations, restoration if a temporary alias is used.
5. **Validation-document PR.**
6. **Separate non-finance pilot-readiness reassessment** (a CP-N0 re-run) only after all preceding work passes.
- **`meta.publicToken` (D)** is recommended as its **own security track** (design + route-auth review + tests + validation), sequenced separately from CP-N1b.

---

## 12. Verdict

### **GO** — to **CP-N1a read-only prerequisite verification only.**

CP-N1a is itself read-only and low-risk; this plan does **not** authorize CP-N1b, implementation, environment access, or a session.

**Prerequisites & owner decisions required before CP-N1b:**
1. **[DECISION REQUIRED]** Approve the field contracts: A = replace with `"Unassigned"`; B = blank `note` to `""`; C = scrub sensitive `reasons` lines (keep structured), and decide the room-category line and structured-codes question.
2. **[DECISION REQUIRED]** Confirm the redaction boundary = extend `redactQuoteV2CostMargin` for A/B/C, unconditional (no flag).
3. **[DECISION REQUIRED]** `meta.publicToken` handling and role rule — and confirm it is a **separate security track** (see below).
4. **[DECISION REQUIRED]** Deployment-isolation/validation approach (§9) and the acknowledgement that merge auto-deploys to production admin-web.
5. **[UNVERIFIED→resolve]** Identify/retain synthetic fixtures for transport-supplier, hotel-diagnostics-with-contract, and (if in scope) public-token states.

**`meta.publicToken` recommendation:** it is a **capability-bearing credential** (anonymous read + accept/request-changes via `@Public()` token-only routes), **not** descriptive data. It **must become a separate security track**, not part of CP-N1b's display-redaction. Recommended handling: omit/null the serialized token for internal hydration (strongest: for all roles, since the enable flow re-fetches), decided with a route-authorization review.

**Deployment-isolation recommendation:** implement unconditionally (no flag); validate via an owner-driven temporary staging-alias deployment with mandatory restoration (CP-Sb Option C pattern) **or** a separately-approved merge-then-staging-validation; never bypass Vercel deployment protection; a separate owner decision is required before merge/production read-path change.

---

## Standing boundaries (reaffirmed)

ERP V2 remains build/test only; Classic remains the system of record; non-finance participation remains prohibited; no staff rollout or live bookings; production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept, invoice, booking, conversion, public link, voucher, packet, supplier-send, email, or send; no production or staging access.

**Safety confirmation:** documentation-only; produced without accessing staging, production, Vercel, Railway, the deployed application, browser sessions, databases, logs, monitoring, or authentication; no sign-in performed; no code, test, schema, migration, flag, environment, deployment, configuration, role, permission, session, pricing, account, or data change; no credentials, password values, hashes, tokens, cookies, connection strings, authorization headers, supplier PII, or live data recorded.

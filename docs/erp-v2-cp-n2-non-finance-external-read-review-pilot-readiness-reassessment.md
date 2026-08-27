# ERP V2 — CP-N2: Non-Finance / External Read-Review Pilot-Readiness Reassessment

**Documentation-only, static, read-only.** Reassessed against `main` at `4b9a727fa1bf97bea620b428e536f06080388b73` using committed code, tests, and prior ERP V2 reports only. **No** staging/production/Vercel/Railway/database/browser/login/credential/token/business-data access. **No** source, test, config, flag, schema, or existing-document change. This re-runs the CP-N0 assessment after the CP-N1 and CP-Tb closures.

Legend: **[CLOSED]** remediated with evidence · **[OPEN]** unresolved · **[RETAINED]** intentional · **[DECISION]** owner adjudication required · **[FACT]** verified `file:line`.

**Verdict:** **CONDITIONAL-GO** — see §7. A `GO`/`CONDITIONAL-GO` here means only *"ready to request a separately approved, tightly-controlled, read-only staging read/review session"*; it does **not** authorize that session, a pilot, a login, a code change, or any staging access.

---

## 1. CP-N0 blocker list — reconstructed and re-marked

CP-N0 (`docs/erp-v2-cp-n0-non-finance-staging-read-review-readiness-assessment.md`) returned **NO-GO**, citing §4 internal-data exposures plus a `[DECISION REQUIRED]` on `meta.publicToken`. Current status:

| # | CP-N0 blocker | Status | Evidence |
| --- | --- | --- | --- |
| B1 | Transport **supplier identity** in builder hydration | **[CLOSED]** | `quote-v2-cost-redaction.ts` sentinels `transport[].supplier` → `"Assigned"`/`"Unassigned"` for non-finance (CP-N1b); asserted in `quote-v2-cost-redaction.test.ts`. |
| B2 | Per-line **internal pricing/rate note** (`pricingDescription`) | **[CLOSED]** | Redactor sets `pricing.lines[].note` → `""` for non-finance (CP-N1b). |
| B3 | **Hotel diagnostics** contract-name / "Rate on file" text | **[CLOSED]** | Redactor sets `hotelCities[].options[].diagnostics.reasons` → `[]` (CP-N1b). |
| B4 | Meal **unit/buy cost** (`costBaseAmount`) | **[CLOSED]** | Redactor sets `experiences[].unitCost` → `null` (CP-Sb); asserted. |
| B5 | **Net cost / margin / markup** in builder | **[CLOSED]** | Redactor zeroes `pricing.netCost/margin/markupPercent` and `pricing.lines[].amount`; gate `canAccessFinance` (admin/super_admin/finance), fail-closed. |
| B6 | **`meta.publicToken`** capability token in hydration | **[CLOSED]** | CP-Tb backend projection (`loadQuoteState`, PR #875) + Classic recovery; CP-Tb-agent removed it from the agent proposals response (PR #877). Live-validated (`docs/erp-v2-cp-tb-agent-validation-closeout.md`). |

**All six CP-N0 blockers are now [CLOSED].** Two *new* residuals surfaced during this reassessment (not in the original CP-N0 list) and are adjudicated in §4: agent-portal `supplierName` and the catalog `PRICING_ROLES` divergence.

---

## 2. Relevant authenticated read surfaces (by role)

- **operations** — Quote Builder V2 hydration (`/quotes/[id]/builder-v2`) via the redactor; may preview/apply pricing and add items (legitimate), so a *read-review* session must forbid clicking those controls operationally. Catalog V2 endpoint permitted (§4b). Cost/margin **not** received (`cost-visibility.ts:17`).
- **viewer** (read-only) — Same builder hydration via the redactor (non-finance). **Blocked** from Catalog V2 (`catalog-v2-access.ts:13` allowlist excludes viewer) and from hotel-contract-summary (`HOTEL_CONTRACT_SUMMARY_ROLES` gate). Cost/margin never received.
- **agent** — External portal only (`/api/agent/*`): proposals, quote summary/detail, bookings, invoices. Not the internal builder. Sell/commission display only; no `totalCost`/`markupPercent` field. `publicToken` closed; `publicUrl`/`pdfUrl` retained by design.
- **agent_admin** — Coalesces to `admin` in the generic roles guard, but the cost/catalog/hotel-contract gates use **explicit allowlists** that exclude `agent_admin`, so it does **not** inherit cost/catalog visibility through coalescing (`cost-visibility.ts:14-15`, `catalog-v2-access.ts:8-9`).

---

## 3. Residual response fields by risk category

- **Buy cost / margin / markup / commission / internal pricing:** Builder — fully redacted for non-finance (§1 B4/B5). Agent portal — `totalCost` used only as an internal NET-display input, never serialized as a field; commission is the agent's own margin. **Caveat [RETAINED]:** a NET-rate agent's displayed sell = `cost × (1 + netHandlingPercent/100)`, so buy cost is *inferable* in NET mode — intended for net agents.
- **Supplier / provenance identity:** Builder transport supplier **[CLOSED]** (sentinel). **Agent booking-detail `supplierName` [OPEN/DECISION]** — see §4a.
- **Credentials / raw tokens / capabilities / token-bearing links:** `meta.publicToken` **[CLOSED]** on all documented surfaces. Token-bearing `publicUrl`/`pdfUrl` **[RETAINED]** on the agent portal as the intended external share/PDF affordance.
- **Internal-only notes / contacts / PII / audit / operational metadata:** Pricing notes redacted (§1 B2). **[RETAINED, out of scope]** passenger PII (passport/DOB/emergency contact) and rooming remain in hydration — a *separate PII track*, not a finance/cost/supplier concern; a read-review envelope should still avoid exposing them (synthetic records only). Opaque IDs (`activityRateVariantId`, `ticketRateVariantId`, `serviceId`, `quoteItemId`, `pricedQuoteItemId`) reach non-finance — no monetary/identity value; back the legitimate apply UI.
- **Mutation / action affordances visible to read-review roles:** operations retains preview/apply/add-item and public-link controls in V2; viewer is read-only. A read-review session must **operationally prohibit** activating any such control (envelope §10), since these are not code-gated off for operations.

---

## 4. Adjudication of the two specific ambiguities

### 4a. `supplierName` in `GET /api/agent/bookings/:id`
- **[FACT]** `apps/api/src/agent/agent.service.ts:705` — `mapAgentBookingDetail` serializes `supplierName: service.supplierName ?? null` inside each `services[]` entry, alongside operational fields `serviceDate/startTime/pickupTime/pickupLocation/meetingPoint/status/confirmationStatus` (`:697-707`).
- **Authorization:** the agent controller is agent-role-gated and every booking read is scoped by `buildAssignedQuoteWhere` (assigned company/agent), so it is exposed only to the **assigned external agent** for a **confirmed booking** — not to internal non-finance roles, and not on the quote/proposal path.
- **Consumers / labels / tests:** it is the single repo-wide serialization of this field to agents; **no test asserts its presence or absence** (an absence of coverage, not evidence of intent).
- **Adjudication — [DECISION]:** Two defensible readings: (i) *intended traveler-facing disclosure* — on a **confirmed booking** the assigned agent coordinates the traveler's services and is normally told the service provider (analogous to a voucher naming the provider); vs (ii) *internal supplier-identity leak* — the internal builder deliberately redacts the **quote-side** transport supplier for non-finance (§1 B1), and supplier identity is competitively sensitive provenance. The booking lifecycle stage and the operational field neighborhood favor (i), but the field is unredacted and untested. **Owner decision required.**
- **Effect on this reassessment:** This is the **external-agent booking** surface, **not** the operations/viewer **quote read-review** surface. It therefore does **not** block an operations/viewer quote read/review session. It **is** a prerequisite decision **iff** the proposed session includes the external agent portal booking path (then remediate/confirm via the separately-scoped **CP-Ag-1** slice first). **Not changed here.**

### 4b. Catalog `PRICING_ROLES` vs shared quote cost-visibility
- **[FACT]** `apps/api/src/catalog/catalog-v2-summary.ts:20` — `PRICING_ROLES = ['admin','operations','super_admin','finance']` (includes **operations**).
- **[FACT]** `apps/api/src/auth/cost-visibility.ts:17` — `QUOTE_COST_VISIBLE_ROLES = ['admin','super_admin','finance']` (excludes **operations**).
- **[FACT]** `apps/api/src/catalog/catalog-v2-access.ts:13` — the Catalog V2 **endpoint** allowlist is `['admin','operations','super_admin','finance']`; `agent`/`agent_admin`/`viewer` are **blocked at the endpoint**.
- **Divergence:** `operations` sees catalog **rate figures** but **not** quote **cost/margin**. These are different surfaces: the catalog is an internal supplier/rate **reference** tool (internal roles only), while the quote builder enforces a stricter buy-cost/margin gate; the code comments state both intents explicitly (`cost-visibility.ts:9-12`; `catalog-v2-summary.ts:6-8`).
- **Adjudication — [RETAINED, intentional]:** The divergence is by design and **non-blocking** for a non-finance quote read/review session: **viewer** and both agent roles are blocked from the catalog endpoint entirely, so the only non-finance role that sees catalog rates is **operations**, which is standing internal behavior unrelated to quote cost/margin. **Minor note (not a blocker):** it is defense-in-depth divergence worth a future comment/alignment, since `PRICING_ROLES` would still be reachable only by already-allowlisted internal roles. **Not changed here.**

---

## 5. CP-Tb closure — scope confirmation (no over-claim)

CP-Tb is confirmed closed **only** within its documented scope: (a) internal V2 builder hydration (`loadQuoteState` projection), (b) Classic workspace compatibility recovery, and (c) agent proposal hydration (`getProposals`, raw `publicToken` removed). This is a **scoped** closure of the public-token capability exposure — **not** an exhaustive whole-platform security proof.

---

## 6. Role × endpoint × sensitive-field matrix (committed-code citations)

| Role | Surface / endpoint | Cost/margin | Supplier identity | Raw token | Notes |
| --- | --- | --- | --- | --- | --- |
| operations | Builder V2 hydration | **redacted** (`cost-visibility.ts:17`; redactor) | **sentinel** (`quote-v2-cost-redaction.ts` transport) | **absent** (CP-Tb) | preview/apply visible — envelope must forbid |
| operations | Catalog V2 summary | rate figures **visible** (`catalog-v2-summary.ts:20`) | supplier structure (internal tool) | n/a | internal-only endpoint (`catalog-v2-access.ts:13`) |
| viewer | Builder V2 hydration | **redacted** | **sentinel** | **absent** | read-only |
| viewer | Catalog V2 / hotel-contract-summary | **blocked at endpoint** | blocked | n/a | allowlists exclude viewer |
| agent / agent_admin | `/api/agent/*` proposals & quote detail | no cost field; NET-mode inference caveat | n/a on quote path | **absent** (CP-Tb-agent, `agent.service.ts` — raw token removed) | `publicUrl`/`pdfUrl` retained |
| agent | `GET /api/agent/bookings/:id` | sell/commission only | **`supplierName` present** (`agent.service.ts:705`) | absent | **[DECISION] §4a** |

---

## 7. Verdict — **CONDITIONAL-GO**

Ready to **request** a separately approved, tightly-controlled, read-only staging read/review session, **conditional** on all of the following being agreed **before** any such request is granted:

1. **Scope the session** to **operations and/or viewer** reviewing **quotes** (the internal builder hydration surface). This keeps the two residuals out of scope: the agent `supplierName` decision (§4a, external-agent booking path) and catalog rates (viewer blocked; operations internal-standing).
2. If the session is to include the **external agent** booking path, resolve §4a first via the bounded **CP-Ag-1** slice (below).
3. Adopt the read-only operating envelope in §10.
4. Acknowledge the two documented decisions: §4a `supplierName` **[DECISION]**; §4b catalog divergence **[RETAINED, non-blocking]**.

**This is not GO** because (1)–(4) are unresolved owner/operating-model decisions, not because a payload blocker remains — all six CP-N0 payload blockers are closed and fail-closed for non-finance.

**This verdict authorizes nothing further.** It does not authorize the staging session, a login, a pilot, a code change, or any staging/production access. A separate explicit approval is required to request and to run any session.

---

## 8. Minimum bounded follow-up slices (dependency order)

Because the verdict is CONDITIONAL-GO, the minimum follow-ups are:

1. **Owner decisions (no code):** confirm session scope (§7.1), adjudicate §4a, acknowledge §4b. Doc/decision only; no deployment.
2. **CP-Ag-1 (only if the agent booking path is in scope):** redact or explicitly confirm `agent.service.ts:705` `supplierName` for agent roles (mirroring the CP-N1b transport sentinel). Files: `apps/api/src/agent/agent.service.ts` (+ `agent.service.test.ts`). Deployment impact: **backend → auto-deploys both Railway APIs**. Validation prerequisites: an agent credential + a booking-with-supplier synthetic fixture (fixture writes + cleanup); no email/public-link/flag. **Not authorized here.**
3. **CP-CI (optional, parallel, non-blocking):** a scoped CI workflow running only the redaction/authorization suites (`quote-v2-cost-redaction.test.ts`, `cost-visibility.test.ts`, `catalog-v2-summary.test.ts`, `agent.service.test.ts`, `quotes-public-link.test.ts`) to prevent regression — there is currently **no CI**. Files: new `.github/workflows/*`. No app deploy. **Not authorized here.**

---

## 9. Proposed future pilot safety envelope (only if a session is later approved)

Included because the verdict supports *requesting* a session; it authorizes nothing on its own.

- **Synthetic records only** — no live client, booking, invoice, or PII; dedicated synthetic quotes/fixtures.
- **Read-only actions** — reviewing rendered hydration/read endpoints only; **no** activation of preview/apply/add-item, public-link enable/disable/regenerate, Accept/Request-Changes, booking/invoice/voucher/packet/supplier/email, or any other mutation control (operations retains these controls in the UI; they must not be clicked).
- **Explicit roles** — exactly the agreed non-finance role(s) (operations and/or viewer), owner-authenticated; no finance/admin masquerade; credentials never handled by the assistant.
- **Stop authority** — a named owner/observer with authority to halt the session immediately.
- **Prohibited controls** — as above, plus no navigation to token-bearing proposal/PDF/public URLs.
- **Production exclusion** — staging only; production project and data never opened, queried, or authenticated to.
- **Sign-out & evidence handling** — sign out and verify protected-route redirect at the end; record booleans/counts/key-names/HTTP codes only; never capture tokens, token-bearing URLs, credentials, cookies, headers, or PII.

---

## 10. Boundaries

ERP V2 build/test and assessment only. Classic remains the system of record. No staff rollout or non-finance pilot is authorized by this document. No live records/bookings; production item mutation OFF; supplier sending disabled; voucher-send allowlist `ziad@axisdmc.com` only. Nothing here weakens authentication, authorization, tenant isolation, or audit behavior. This is a static reassessment; no code, test, config, or existing document was modified to produce it, and no application, environment, or business data was accessed.

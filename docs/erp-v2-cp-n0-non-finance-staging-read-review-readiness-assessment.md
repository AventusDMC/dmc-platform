# ERP V2 — CP-N0: Non-Finance Staging Read/Review Readiness Assessment

**Status: NO-GO** to a separately-approved owner-only Operations (non-finance) staging read/review session, until the newly-identified non-finance hydration exposures (§4) are remediated or formally scope-excluded by the owner. Documentation-only, read-only, static: produced from committed code, tests, documentation, and Git history on current `main` (contains PR #866 `546682b0…` and PR #867 `55847c42…`). **No** Vercel, Railway, staging, production, database, browser, application, authentication, log, or business-data access was performed; **no** pilot/session was executed.

Legend: plain text = verified fact (with `file:line`); **[REC]** = recommendation; **[UNVERIFIED]** = not machine-provable from the repo; **[DECISION REQUIRED]** = owner decision.

---

## 1. Current capability & governance boundary

- ERP V2 remains **build/test only**; **Classic remains the system of record**.
- No staff rollout, live records, production use, mutations, public exposure, or sending.
- **CP-N0 is an assessment, not an authorization.** It does not begin or approve any session, implementation, credential hardening, or cosmetic correction.
- This document separates facts, `[REC]`, `[UNVERIFIED]`, and `[DECISION REQUIRED]` as tagged.

---

## 2. Re-verification of CP-Sb closure on current `main`

Verified first-hand against current `main`:

- **Non-finance Meal `experiences[].unitCost` is server-side redacted to `null`.** `redactQuoteV2CostMargin` restricted branch maps `experiences.map(e => ({ ...e, unitCost: null }))` — `apps/admin-web/lib/quote-v2-cost-redaction.ts:56-59`.
- **Finance-visible roles retain the value.** Early return for `canViewCostMargin` (`quote-v2-cost-redaction.ts:40-42`); caller `canViewCostMargin = canAccessFinance(role)` = admin/super_admin/finance (`apps/admin-web/app/quotes/[id]/builder-v2/page.tsx:71`); only `safeQuote` is hydrated (`page.tsx:78`).
- **Tests cover recognized non-finance roles and unknown/missing roles fail closed.** `apps/admin-web/lib/quote-v2-cost-redaction.test.ts`: finance retain `30` (`:103-107`); non-finance `operations/agent_admin/agent/viewer` → `null` (`:110-114`); unknown + `undefined` + `null` role → fail-closed `null` (`:117-123`); already-null/absent stay null (`:126-129`). Focused suite 20/20 and siblings 8/8 (recorded in the CP-Sb validation report, PR #867).
- **Existing `pricing.*` cost/margin redaction remains.** `netCost/markupPercent/margin = 0`, `lines[].amount = 0` for non-finance (`quote-v2-cost-redaction.ts:46-52`).
- **No alternative *meal-cost* alias remains** for the per-item supplier cost: the adapter maps `unitCost` from `costBaseAmount` only for meals (`quote-v2-adapter.ts:1298`); raw `costBaseAmount`/`totalCost`/`overrideCost` are not serialized raw. **However, this closure is scoped to per-item meal cost only — see §4 for other unredacted internal fields.**
- Evidence chain: CP-S0 plan PR #864; CP-Sa prerequisite PR #865; CP-Sb implementation PR #866 (`546682b0`); CP-Sb validation PR #867 (`55847c42`).

**CP-Sb closure holds as specified. It closes the meal `unitCost` leak — it does not close the unrelated internal-data exposures in §4.**

---

## 3. Candidate narrow scope (for a *future*, separately-approved session)

- One **owner-controlled** session only; existing synthetic **Operations** role/account only; dedicated staging **admin-web** only; **one** explicitly-approved synthetic fixture.
- **Read / review / navigation only**; maximum **30-minute** window; **no other staff participant**.
- **Prohibited:** any mutation, mutation-preview, **Apply modal**, Add, Edit, Remove, Accept, version creation, booking, invoice, passenger/rooming change, public link, proposal preview/download, voucher, packet, supplier action, email/send, or Classic write; **no real/live record**.
- **Required close-out:** normal Sign out and protected-route denial verified.

This scope is well-formed; whether it may proceed depends on §4.

---

## 4. Operations-role authorization & payload exposure — **FAIL CLOSED**

**Authorization/read surfaces (verified):**
- Operations can authenticate and open the V2 builder (the builder route is role-gated but reachable by operations; validated live during CP-Sb Option C).
- `canPreviewPricing = hasRequiredRole(role,["admin","operations"]) && editable-status` (`page.tsx:51-52`) → operations receives preview/apply affordances (see §5).
- Finance cost/margin UI is restricted: `canViewCostMargin = canAccessFinance(role)` (admin/super_admin/finance only) — operations does **not** see net cost/margin in the UI (`page.tsx:62-71`).
- Only `quote={safeQuote}` carries business data to the client; the other ~20 props passed to `BuilderV2Client` are booleans/flags plus an `error` string (`page.tsx:199-225`) — no second data-bearing prop bypasses the redactor.

**Second internal-data exposure to non-finance (verified first-hand; redactor does NOT touch these):**

| Field | `file:line` | Exposure | Severity |
|---|---|---|---|
| `transport[].supplier` (supplier name) | `quote-v2-adapter.ts:1195,1222`; coercion `:473` | **Supplier identity** to non-finance | HIGH |
| `pricing.lines[].note` = `it.pricingDescription` | `quote-v2-adapter.ts:1180`; `mapPricing :561` | **Rate/discount text** (documented example embeds unit rates + "Supplier transport discount 25% applied", `quote-types.ts:562-564`) → cost inference | HIGH |
| `hotelCities[].options[].diagnostics.reasons[]` | `quote-hotel-diagnostics.ts:90` (contract name), `:103-105` ("Rate on file (from Classic): {pricingSummary}"); source `adapter.ts:1008,1010`, wired `adapter.ts:400` | **Contract name + rate text** to non-finance | HIGH |
| `meta.publicToken` (public proposal share token) | `quote-v2-adapter.ts:1419`; `mapMeta :295`; type `quote-types.ts:810` | **Share token** serialized to all roles, ungated | MEDIUM ([DECISION REQUIRED] whether to gate) |
| `transport[].supplierContract`, `hotelCities[].options[].contractStatus` | `adapter.ts:1224,1079/1137` | enum only (`on-request`/`no-contract`/`contracted`) | LOW |
| `experiences[].activityRateVariantId/serviceId/activityId` | `adapter.ts:1282-1296` | internal DB/rate-variant IDs, no cost value | LOW |
| `client.contactEmail` | `adapter.ts:1423` | client PII, client-facing (not internal) | LOW |

**Confirmed non-exposures:** no raw ERP-object spread smuggles fields (only `{ ...demoQuote, id }` dev fallback, `adapter.ts:1544`); hotel `ratePerNight`/`cityTax` are hard-coded `0` for real data (`adapter.ts:1082-1083,1140`); contract **id** and supplier email/phone are not serialized (`ApiRef` carries `{id,name}`, `buildPricedHotelLine` takes `contract?.name` only); no session/auth secret, password, or hash is in the payload.

**Verdict driver:** per the CP-N0 instruction — *"Fail closed if another unredacted internal field is found"* — the presence of unredacted **supplier identity, contract name, and rate/discount text** reaching non-finance roles is a **fail-closed condition**. This is a code-level gap independent of the meal fix. **[REC]** Remediate with a redactor extension (a "CP-N1"-style change) mirroring CP-Sb: for non-finance, neutralize `transport[].supplier` (→ generic "Supplier"/"Unassigned"), null/scrub `pricing.lines[].note`, and drop/scrub the contract-name and "Rate on file: …" lines from `hotelCities[].options[].diagnostics.reasons[]`; and **[DECISION REQUIRED]** decide whether `meta.publicToken` should be finance-gated. Do not implement under CP-N0.

**Fixture-specific note (does not lift the fail-closed):** the candidate synthetic fixture `13238d51…` was observed during CP-Sb Option C with **Hotels: Missing, Transport: Missing** and no public link, so on that fixture the transport/hotel/publicToken paths would likely be empty — but `pricing.lines[].note` (meal `pricingDescription`) would still flow, and §8 requires live hard-guard reverification (forbidden in CP-N0). Emptiness cannot be assumed here.

---

## 5. Operations Apply-modal `unitCost ?? 0` cosmetic

- **Exact path:** `apps/admin-web/components/quote/v2/steps/item-pricing-apply-modal.tsx:128` — `useState(String(exp.unitCost ?? 0))`. For non-finance, `unitCost` is now redacted to `null`, so the meal "Unit cost" input prefills the string **`"0"`** (never `"null"`/`NaN`).
- **Who can open it:** the modal opens via `canApply` (`experiences-step.tsx:272`), which requires the `onApplyItemPricing`/`onPreviewItem` handlers (`:265`), supplied only when `canPreviewPricing` = admin/operations + editable status (`page.tsx:51-52`). So **operations can open it**.
- **Does it block a strictly read-only session?** **No.** (a) The candidate scope **expressly prohibits opening the Apply modal**; (b) even if opened, the redacted value displays `0`, exposing **no real cost**; (c) the backend independently rejects any operations-supplied `unitCost` with `403 cost_override_forbidden` (recorded in the M-1 validation reports).
- **Conclusion:** **scope-excludable** for a read-only session; it does **not** require correction before an Operations session. It remains a documented cosmetic to correct later. Not implemented here.

---

## 6. Authentication & session risk

- **Stateless session token, 12-hour default TTL:** `createSessionToken` (`apps/api/src/auth/auth.service.ts:350-351`); verification trusts the token payload with no DB reload (`:278`).
- **No server-side per-session revocation:** there is no revocation store/route; outstanding tokens invalidate only via TTL expiry or global secret rotation. **Sign-out removes the browser session only** (verified behaviorally during CP-Sb Option C: re-navigation → "Your session expired").
- **Prior one-person acceptance vs this scope:** the CP-P3/R0 owner acceptance covered a **finance-authorized** one-person staging session. This candidate introduces a **non-finance** participant reviewing the builder — a materially different exposure profile. **[DECISION REQUIRED]** a **fresh owner decision** is required; the earlier acceptance does not transfer to a non-finance session.
- **Committed seed/default credentials and the plaintext-equality password fallback** (`apps/api/src/auth/auth.service.ts`) remain a **separate, unresolved security-hardening concern** — out of scope for CP-N0; no value printed here. **[REC]** track and remediate independently before any broadening beyond a single owner-controlled synthetic session.

---

## 7. Monitoring & incident controls

- **Substitute (owner-approved previously):** network-request method/path/status classification + baseline/final fixture reconciliation. This worked in CP-P3/R0/Option C and detected zero mutations. Reusable for this scope. **[REC]** keep it as the monitoring substitute.
- **Gaps (unchanged):** no general read-only audit-query surface; backend live-log monitoring not established. **[UNVERIFIED]** whether any audit/log surface has since been added — none found in the repo for this purpose.
- **Roles:** Observer, Stop Authority, and Evidence-Retention Owner are all **[DECISION REQUIRED]** — do not assign anyone for this new scope without explicit owner authorization; the prior combined single-person assignment was accepted only for the finance-only scope.
- **Immediate stop conditions (must be pre-agreed):** unexpected cost/internal-data exposure (incl. any §4 field appearing); any business-mutation request; wrong host/project/fixture/role; fixture drift; authentication anomaly; production or real-record exposure; monitoring failure.

---

## 8. Fixture recommendation

- Candidate: retained synthetic Meal fixture `13238d51-9f4e-4297-b292-5003b3cbdae3` — documented **synthetic, DRAFT, retained** with Meal items `24720a7e-7f14-4b55-8983-9a4a44e95358` and `385feb4b-41f0-4d5d-9752-1a034590c4d3` (committed meal-create validation reports; reconfirmed unchanged during CP-Sb Option C).
- **[REC]** appropriate *if* a non-finance session is later authorized, because it is meal-only and minimizes §4 surface — but this does **not** remove the §4 fail-closed (the meal `pricing.lines[].note` still flows, and code-level exposure remains for any richer fixture).
- **All baseline facts (status, item count, totals, retained item IDs, absence of accepted version/booking/invoice/public link) must be re-verified LIVE by hard guard before any later approved session.** The fixture was **not** accessed during CP-N0.

---

## 9. Required evidence for a future session

A later approved session must capture: staging-target + production-exclusion proof; deployed-commit/lineage proof; visible Operations role; fixture baseline; hydrated-payload redaction evidence (without exposing credentials/tokens); UI review result; network method/path/status classification; final fixture reconciliation; sign-out + protected-route denial; participant feedback; and explicit confirmation of every prohibited action not taken. For this scope specifically, the payload evidence must additionally confirm **each §4 field is neutralized** for the operations role.

---

## 10. Verdict

### **NO-GO** — to a separately-approved owner-only Operations (non-finance) staging read/review session, at this time.

**Blocking (must be resolved before GO):**
1. **§4 second internal-data exposure to non-finance** (fail-closed): `transport[].supplier`, `pricing.lines[].note` (pricingDescription rate/discount text), and hotel `diagnostics.reasons[]` (contract name + "Rate on file" text) are unredacted for non-finance. **[REC]** remediate via a redactor extension mirroring CP-Sb (design/impl/tests/staging-validation/validation-doc as its own approved slice). This is the primary blocker.

**Scope-excludable (do NOT block a read-only session):**
- The Apply-modal `unitCost ?? 0` cosmetic (§5) — excluded by the "no Apply modal" rule and displays `0` (no real cost); backend `403` remains authoritative.
- Backend live-log monitoring / general audit-query absence (§7) — covered by the network + reconciliation substitute for a single owner-controlled synthetic session.

**Owner decisions still required ([DECISION REQUIRED]):**
- Whether to **remediate** the §4 exposures (recommended) or **formally scope-exclude** them with live hard-guard proof that the chosen fixture contains none of the affected fields and acceptance of residual `pricing.lines[].note` text.
- Whether `meta.publicToken` should be finance-gated (§4).
- A **fresh** owner decision for a non-finance session (the finance-only acceptance does not transfer) (§6).
- Assignment of Observer, Stop Authority, Evidence-Retention Owner (§7).
- Server-side token-revocation (§6) and seed/default-credential + plaintext-fallback hardening (§6) remain separate tracks — **not blocking a single owner-controlled synthetic read-only session by themselves**, but noted.

**Path to CONDITIONAL GO / GO:** once the §4 exposures are remediated (or explicitly, formally scope-excluded with fixture-proof) and the owner supplies the decisions above, a subsequent assessment could return CONDITIONAL GO. **CP-N0 does not authorize or execute any session.**

**Proposed boundary for the eventual session (owner approval fields to be filled — provided only as a template, not an authorization):** date/window (≤30 min); participant (owner as sole Operations user); fixture (`13238d51…`, hard-guard reverified); permitted actions (read/review/navigation only, no Apply modal, no mutation of any kind); Observer / Stop Authority / Evidence-Retention Owner (owner, pending fresh decision); monitoring substitute (network classification + fixture reconciliation); stop conditions (per §7).

---

## Standing boundaries (reaffirmed)

Production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept, invoice, booking, conversion, public link, voucher, packet, supplier-send, email, or send action; no production access; no staff rollout; no live bookings or real records; no Scope M; no Classic write or retirement. ERP V2 remains build/test only; Classic remains the system of record.

**Safety confirmation:** documentation-only; produced without accessing staging, production, Vercel, Railway, the deployed application, browser sessions, databases, logs, monitoring, or authentication; no sign-in performed; no code, test, schema, migration, flag, environment, deployment, configuration, role, permission, session, pricing, account, or data change; no credentials, password values, hashes, tokens, cookies, connection strings, authorization headers, or PII recorded.

# ERP V2 — CP-S0: Non-Finance Meal Cost-Payload Redaction Readiness Plan

**Status: documentation-only, read-only.** A decision-ready readiness plan for eliminating the verified Meal cost leak from non-finance V2 browser payloads. **Does not** authorize implementation, staging validation, non-finance participation, another R0 session, staff rollout, production access, or any environment change.

Every leak claim below was **re-verified against current `main`** (post-#863) with exact `path:line` citations. Labels: `[VERIFIED]` current-main fact; `[REC]` recommendation; `[UNVERIFIED]` needs a later read-only check; `[DECISION REQUIRED]` needs Ziad's decision.

---

## 1. Current boundary

- Owner-only, finance-authorized **R0 completed successfully** (PR #863).
- **Non-finance participation remains prohibited.**
- The **Meal `unitCost` payload exposure remains the mandatory blocker** before any non-finance staging review.
- **UI hiding is not an acceptable substitute for server-side payload redaction.**
- **Classic remains the system of record; ERP V2 remains build/test only.**
- **CP-S0 is not implementation or rollout authorization.**

---

## 2. Exact leak trace (re-verified on current `main`)

1. **Meal cost is loaded (backend):** `QuotesService.loadQuoteState` (`apps/api/src/quotes/quotes.service.ts:12690`). The `actor` is used **only** for `requireActorCompanyId(actor)` (company scope, `:12691-12693`) — **no role-based cost redaction** (a grep of `canViewQuoteCostMargin`/`redactResponseCost`/`canActorViewCost`/role across `loadQuoteState` returns nothing). It returns the raw quote/items.
2. **Persisted cost enters V2 state:** each `QuoteItem` carries the meal unit cost as **`costBaseAmount`** (schema `apps/api/prisma/schema.prisma`; `baseCost = mealUnitCost` at `quotes.service.ts:7744`). The backend response exposes `costBaseAmount`/`unitCost` per item.
3. **Adapter maps it to `experiences[].unitCost`:** `apps/admin-web/lib/quote-v2-adapter.ts:1298` — `unitCost: isMealItem ? it.costBaseAmount ?? null : null` (and the raw pass-through `mapExperiences` at `:437` — `unitCost: asNumberOrNull(r.unitCost)`).
4. **Which response sends the payload:** the admin-web server loader `loadQuoteV2` calls the backend `GET /quotes/:id` (→ `loadQuoteState`), then the adapter builds the normalized `Quote`. The Next.js server loader `apps/admin-web/app/quotes/[id]/builder-v2/page.tsx` passes it as `quote={safeQuote}` (`:201`) into the hydrated client component — i.e., the exposure is in the **admin-web builder-v2 hydration payload**.
5. **Frontend component that receives it:** `Quote.experiences[].unitCost` is threaded to the Experiences step; consumed by `apps/admin-web/components/quote/v2/steps/item-pricing-apply-modal.tsx:128` — `useState(String(exp.unitCost ?? 0))`.
6. **Where it is conditionally rendered/hidden:** the meal cost apply/create UI is **finance-gated** — `mealCostOverrideEnabled={canViewCostMargin}` (`quote-builder-v2.tsx`), so the apply modal / Add-meal panel only render for finance. **Rendering is gated; the value is not.**
7. **Why a non-finance browser can still inspect it:** the V2 redactor `redactQuoteV2CostMargin` (`apps/admin-web/lib/quote-v2-cost-redaction.ts:38-47`) nulls **only** `pricing.netCost` / `pricing.markupPercent` / `pricing.margin` / `pricing.lines[].amount` — it **does not touch `experiences[]`**. So `experiences[].unitCost` is serialized into the hydration payload for **every** role and is only render-gated. **Delivered-but-hidden.**

**Field details `[VERIFIED]`:** response field **`experiences[].unitCost`**; type **`number | null`** (`apps/admin-web/lib/quote-types.ts:172`, `unitCost?: number | null`); nullability: already optional/nullable; item classification: populated **only for meal items** (`isMealItem` guard at adapter `:1298`; non-meal → `null`).

---

## 3. Affected role matrix

Authoritative helper `[VERIFIED]`: `QUOTE_COST_VISIBLE_ROLES = ['admin','super_admin','finance']` (`apps/api/src/auth/cost-visibility.ts:17`); `canViewQuoteCostMargin`/`canAccessFinance` returns true only for those (`:20-21`). No role inheritance is assumed.

| Role | Cost-visible? | Should receive Meal cost? | Currently receives it? |
|---|---|---|---|
| `admin` | ✅ | **Yes** (finance-visible) | Yes (correct) |
| `super_admin` | ✅ | **Yes** | Yes (correct) |
| `finance` | ✅ | **Yes** | Yes (correct) |
| `operations` | ❌ | **No** | **Yes — LEAK** |
| `agent_admin` | ❌ | **No** | **Yes — LEAK** |
| `agent` | ❌ | **No** | **Yes — LEAK** |
| `viewer` | ❌ | **No** | **Yes — LEAK** |

- **Finance-visible roles that should retain cost:** admin, super_admin, finance.
- **Non-finance roles that must not receive cost:** operations, agent_admin, agent, viewer.

---

## 4. Payload-surface inventory (Experiences cost-like fields)

| Field | Location | In hydration payload? | Redacted for non-finance today? |
|---|---|---|---|
| `experiences[].unitCost` | `quote-v2-adapter.ts:1298`, type `:172` | **Yes (meal items)** | **No — the verified leak** |
| `experiences[].costBaseAmount` (raw) | source of `unitCost`; not separately set on `Quote.experiences` | via `unitCost` only | n/a (covered by fixing `unitCost`) |
| `pricing.netCost` / `margin` / `markupPercent` | `quote-v2-adapter.ts:1351-1353` | Yes | **Yes** (`quote-v2-cost-redaction.ts:42-44`) |
| `pricing.lines[].amount` | adapter | Yes | **Yes** (`:45`) |
| Supplier/internal cost (`externalSupplierName`, `externalInternalNotes`) | not mapped into `Quote.experiences` | No | n/a |
| Hotel `cost?:{costBaseAmount,…}` block | `quote-types.ts:434` (**Hotel** type) | **[UNVERIFIED]** — CP-a found it backend-finance-gated (included only for finance) | server-gated (confirm in CP-Sa) |

**Scope determination `[VERIFIED]`:** the leak is **Meal-only** for this field — the adapter sets `unitCost` from `costBaseAmount` **only when `isMealItem`** (`:1298`); non-meal experiences get `null`. It is **not** a shared generic experience field carrying cost for other types, and the exposure is via the **single V2 hydration endpoint** (the builder-v2 page loader). The Hotel `cost` block is a **separate** surface that CP-a indicated is already backend-finance-gated — CP-Sa must re-confirm it is not a second hydration leak, but it is **not** part of the verified Meal leak.

---

## 5. Existing redaction architecture

- **`cost-visibility.ts`** — the authoritative predicate (`QUOTE_COST_VISIBLE_ROLES`, `canViewQuoteCostMargin`); backend counterpart of admin-web `canAccessFinance`.
- **V2 hydration redactor** `redactQuoteV2CostMargin` (`quote-v2-cost-redaction.ts`) — applied server-side in `page.tsx:78` with `canViewCostMargin`; nulls the `pricing.*` cost block only.
- **Backend response redaction** — `redactResponseCost` (`quotes.service.ts`, recursively nulls nested `totalCost`) is applied to preview/apply/edit-preview responses; V2 experiences create/remove responses gate cost via `canViewQuoteCostMargin` (`quote-experiences-v2.service.ts`); hotel contract/rate summary omits the money block for non-finance.
- **Guarded operation responses** are consistently cost-redacted (verified in CP-a).

**Why `experiences[].unitCost` is not protected:** the redactors above cover the **pricing summary** and the **guarded-operation responses**, but the **general read (`loadQuoteState` → adapter → hydration)** has **no per-item cost redaction**, and the single V2 redactor that runs on that path (`redactQuoteV2CostMargin`) is scoped to `quote.pricing` and deliberately preserves all `experiences[]` fields (`:19-24` doc comment) — so the meal `unitCost` slips through.

---

## 6. Candidate fix boundary

| Option | Role context available? | Risk to finance output | Risk of missing nested aliases | Reuse across builder | Testability | Scope | Compatibility / pricing risk |
|---|---|---|---|---|---|---|---|
| **(a) Backend `loadQuoteState` role-redaction** | actor present but company-scope only today | medium (shared read used by 8+ callers: `:637/864/1338/1769/1958/2232/6627`) | must audit all consumers | broad (affects non-V2 consumers too) | harder | **large** | **higher** — a shared production read path; risk to Classic/other consumers |
| **(b) Role-aware adapter serialization** (`quote-v2-adapter.ts`) | **adapter lacks role context** (role is in `page.tsx`, not `loadQuoteV2`) | medium | medium | V2-only | medium | medium (must thread role in) | medium |
| **(c) Centralized post-adapter V2 redactor** (extend `redactQuoteV2CostMargin`) | **yes** — `canViewCostMargin` at `page.tsx:78` | **low** (only nulls a non-finance field) | low (single, auditable choke point) | **yes** (one function, one call site) | **high** (existing test file) | **smallest** | **lowest** — hydration-only, no backend/stored/pricing change |

**[REC] Smallest safe boundary = Option (c):** extend `redactQuoteV2CostMargin` to null `experiences[].unitCost` for non-finance (and, guided by CP-Sa's inventory, any confirmed per-item cost alias), because it already has authoritative role context, is V2-hydration-only, is a single auditable choke point, reuses the existing test, and cannot affect the shared backend read path, Classic, pricing math, or stored data. **Frontend-only hiding is explicitly not recommended.**

---

## 7. Response-contract decision

- **Field type today `[VERIFIED]`:** `unitCost?: number | null` (`quote-types.ts:172`) — already nullable.
- **Sole consumer `[VERIFIED]`:** `item-pricing-apply-modal.tsx:128` (`exp.unitCost ?? 0`) — a **finance-gated** modal (never opened for non-finance).
- **[REC] Non-finance contract: return `null`** (not `0`, which would imply "free"; not a type change — the field is already `number | null`). Finance contract: unchanged (real value).
- **DTO/type implications:** none — `unitCost` is already optional/nullable, so `null` is contract-compatible; omit is also viable but `null` matches the redactor's existing null/zero convention and requires no type change.
- **Frontend compatibility:** the only reader uses `?? 0` inside a finance-gated component, so a non-finance `null` never reaches a render path → **no accidental `0`/`"undefined"` fallback** for non-finance. `[REC]` CP-Sa must still confirm no other reader assumes a numeric `unitCost`.

---

## 8. Security & fail-closed behavior (requirements for the eventual fix)

- **Server-side authorization/redaction** (runs in the admin-web server loader before hydration; never client-trusted).
- **Default-deny for unknown roles:** `canViewQuoteCostMargin(null/unknown) === false` (`cost-visibility.ts:20-21`) → unknown roles are treated as non-finance and **redacted**.
- **No reliance on client role claims** — role is resolved server-side (`readSessionActor` → `canAccessFinance`, `page.tsx:36/71`).
- **No exposure through aliases, nested objects, logs, errors, or raw payload spreads** — CP-Sa must audit for any per-item cost alias (e.g. a raw `costBaseAmount`, a `cost` sub-object) that could reintroduce the value.
- **No cost disclosure merely to determine UI visibility** — visibility is decided by role, not by inspecting the cost value.
- **Finance-visible behavior preserved only for authoritative finance roles** (admin/super_admin/finance).

---

## 9. Pricing & mutation isolation (the fix must NOT change)

The eventual change must be **response-redaction only** and must not alter: stored quote items; pricing resolution (`resolveQuoteItemValues`); quote totals (`recalculateQuoteTotals`); markup; sell price; margin calculations; create/edit/remove/apply behavior; audit writes; booking or invoice behavior; Classic; or any mutation route. Option (c) touches only the admin-web hydration projection (a pure display redaction), satisfying this by construction.

---

## 10. Environment & release strategy

**Does merging alter a production read path? `[VERIFIED]` analysis:** the fix (Option c) lives in the admin-web server loader (`page.tsx` → `redactQuoteV2CostMargin`). On merge to `main`, it deploys to every admin-web target on rebuild (internal build/test `-4gu9`, staging, and — on a production rebuild — production admin-web). The change is **strictly tightening** (non-finance stops receiving one field); it **never exposes more** and has **no finance-facing or pricing/mutation change**. However, per the standing rule it is still a production **behavior** change on a production read path.

**Options + [REC]:**
- **No feature flag** is architecturally appropriate — a security redaction must not be toggleable back into a leak (a flag that can re-enable exposure is an anti-pattern). `[REC]` **no flag.**
- **Staging-first validation** — merge deploys to build/test + staging; validate finance vs non-finance payloads there (§12) before any production rebuild.
- **Separate explicit production deployment/activation approval is required** — production behavior must not change without explicit approval.
- A **temporary dedicated staging gate** is possible but discouraged (flag anti-pattern); if CP-Sa finds the deploy flow would change production on merge **without** an approval step, then **implementation is NO-GO until the release method is explicitly approved.**

**[DECISION REQUIRED]:** the production release/activation method for this security redaction (stage-first + explicit prod-deploy approval vs. a temporary isolation mechanism). No production access or change is proposed by CP-S0.

---

## 11. Test plan (regression)

Extend **`apps/admin-web/lib/quote-v2-cost-redaction.test.ts`** (the existing redactor unit test); add a narrowly scoped case set:
- **Finance roles retain the correct Meal cost:** with `canViewCostMargin=true`, `experiences[].unitCost` unchanged (real value).
- **Every non-finance role does not receive Meal cost:** with `canViewCostMargin=false`, `experiences[].unitCost === null` for meal items.
- **Unknown/unclassified roles fail closed:** treated as non-finance → redacted.
- **Not recoverable via alias/nested object:** assert no `costBaseAmount`/`cost` sub-field reintroduces the value on `experiences[]`.
- **Pricing-summary redaction intact:** `pricing.netCost/markupPercent/margin/lines[].amount` still zeroed (existing assertions retained).
- **Guarded-operation response redaction intact:** unchanged (covered by existing backend/service tests; no change needed).
- **Other Experience fields unchanged:** `amount` (sell), `type`, `city`, `isExternal`, etc. preserved.
- **No pricing/total calculation changes:** redactor is display-only (assert it clones, never mutates input).
- **No mutation/audit behavior changes:** n/a to this file (assert scope is admin-web hydration only).
- **TS/API contract compatibility:** `unitCost` stays `number | null`; admin-web `tsc` baseline unchanged.
- **Frontend behavior if null:** confirm the sole consumer (`item-pricing-apply-modal.tsx:128`) is finance-gated so a non-finance `null` never renders; add a source-grep assertion if useful.

**[REC]** No new production code test files beyond extending the one redactor test, keeping scope minimal.

---

## 12. Staging-validation plan (later, separately approved; read-only)

- **One approved synthetic staging quote containing a Meal item.** The R0/E-b fixture `fbd0fde8…` is an **External Package**, not a meal — it is **not** suitable. A Meal fixture was created during meal-create validation (`docs/erp-v2-quote-builder-v2-meal-create-backend-validation-report.md` / `…-frontend-validation-report.md`, PRs #831/#832/#834). **`[UNVERIFIED]` — Meal-fixture identification/confirmation is a CP-Sa prerequisite** (identify the exact synthetic meal quote from those committed docs and confirm it still exists, DRAFT, no accepted version/booking/invoice/public link). **Do not create one during CP-S0/CP-Sa.**
- **One finance-authorized role + one non-finance role** (read-only).
- **Payload inspection** without printing credentials/cookies/tokens/unrelated sensitive data:
  - **Finance payload** confirms the expected Meal `unitCost` value present.
  - **Non-finance payload** confirms `experiences[].unitCost` is **`null`** (per the chosen contract).
- **UI remains usable for both roles**; the finance meal-cost affordance still works; non-finance sees the sell-only view.
- **Fixture baseline and final state remain identical** (net-zero); **no mutation, temporary item, Classic action, production access, or sending.**

---

## 13. Risks & NO-GO conditions

| Risk | Mitigation | GO/NO-GO |
|---|---|---|
| Wrong redaction boundary | Option (c), single choke point | GO only with Option (c) or an equally narrow, role-aware, hydration-only boundary |
| Finance regression | test: finance retains value | NO-GO if finance loses cost |
| Alias/nested-field leakage | CP-Sa payload-surface audit + test | NO-GO if any alias reintroduces cost |
| Type-contract breakage | keep `number | null`; return `null` | NO-GO on a breaking type change |
| Unknown-role exposure | default-deny (`canViewQuoteCostMargin(null)=false`) | NO-GO if unknown roles receive cost |
| Accidental production read-path change | stage-first + explicit prod approval (§10) | **NO-GO if merging changes production behavior without explicit approval** |
| Reliance on UI hiding | server-side redaction only | NO-GO for any frontend-only "fix" |
| Missing synthetic Meal fixture | CP-Sa fixture identification | validation blocked until a documented meal fixture is confirmed |
| Insufficient role-specific test coverage | per-role tests (§11) | NO-GO without per-non-finance-role coverage |

**Objective GO criteria (for CP-Sb):** Option (c) boundary; `null` contract; all §11 tests green; no alias leak; no finance regression; no pricing/mutation change; a confirmed synthetic meal fixture; and an explicit release/activation method (§10).

---

## 14. Proposed PR sequence

1. **CP-S0** — readiness plan, documentation-only *(this PR)*.
2. **CP-Sa** — read-only prerequisite verification: exact response boundary (incl. the Hotel `cost` block re-check), the `null`-vs-omit response contract against all consumers, the synthetic Meal fixture identity, and the release-isolation/deploy-flow question. **Stop before code.**
3. **CP-Sb** — smallest server-side redaction implementation (Option c) + regression tests, **only if CP-Sa is GO**.
4. **CP-Sb staging validation** — finance + non-finance **read-only** payload validation.
5. **CP-Sb validation document** — documentation-only.
6. **A later, separately approved decision** on whether a **non-finance staging R0** may be planned.

Implementation and validation documentation are **not** combined.

---

## 15. Final recommendation

**`CONDITIONAL GO` — to CP-Sa read-only prerequisite verification only.** The leak is re-verified, narrowly Meal-scoped to a single field via one V2 hydration choke point, with an authoritative server-side role predicate and an existing redactor to extend — so a safe next prerequisite is well-supported. CP-S0 does **not** authorize implementation.

**Outstanding CP-Sa questions:** (a) confirm no per-item cost alias (`costBaseAmount`/`cost` block on `experiences[]`) or the Hotel `cost` block is a second hydration leak; (b) confirm `null` vs omit against every `unitCost` consumer; (c) identify + confirm a documented synthetic Meal staging fixture; (d) determine the deploy flow and whether merging alters the production read path without an explicit approval step (release-isolation decision).

---

## 16. Standing restrictions (reaffirmed)

ERP V2 build/test only; **Classic remains the system of record**; no additional R0 session; no staff rollout; no live/real records; no production access or change; production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept / invoice / booking / conversion / public link / voucher / packet / supplier-send / email / send; no Scope M; **non-finance participation remains prohibited until the complete fix/test/validation/documentation sequence passes and is separately approved.**

**Safety confirmation:** documentation-only, read-only; produced from current-`main` code/tests/docs/git only; no staging/production/Vercel/Railway/DB/deployed-app/browser/auth/log/monitoring access; no code/test/schema/migration/flag/environment/deployment/configuration/role/permission/session/data change; no credentials, passwords, tokens, cookies, authorization headers, connection strings, raw secrets, or PII recorded.

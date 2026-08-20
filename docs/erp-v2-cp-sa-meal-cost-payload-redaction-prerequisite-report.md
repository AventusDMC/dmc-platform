# ERP V2 — CP-Sa: Meal Cost-Payload Redaction — Prerequisite Verification Report

**Status: CONDITIONAL GO to CP-Sb implementation preparation only.** Documentation-only, read-only prerequisite verification. **No code, test, schema, migration, flag, environment, deployment, configuration, role, permission, session, or data was changed to produce this report.** No environment (staging, production, Vercel, Railway, database, browser session, authentication) was accessed. Every claim below is re-verified against the current working tree with `file:line` — **no claim rests on conversation memory**.

This report resolves the four CP-S0 prerequisites. It **does not authorize CP-Sb**. CP-Sb (the actual redaction implementation) requires a **separate, explicit owner approval** and is bounded by the restrictions in §15–§16.

---

## 1. Scope, authorization & boundary

- **What this is:** the CP-Sa prerequisite gate that CP-S0 (readiness plan, PR #864) required before any meal cost-payload redaction implementation (CP-Sb) may be prepared.
- **What this is NOT:** not an implementation, not a code change, not a flag/deploy/config change, not staging access, not CP-Sb authorization, not non-finance-participation authorization.
- **Standing boundaries remain in force** (reaffirmed verbatim in §16): ERP V2 build/test only; Classic remains the system of record; no staff rollout; no live bookings; no actual-production access/reads/writes/deploys/config; production item mutation OFF; supplier sending disabled; voucher-send allowlist `ziad@axisdmc.com` only; **non-finance participation remains prohibited until the meal `unitCost` server-side redaction + tests + staging validation + validation doc sequence passes and is separately approved**; no Scope M.

---

## 2. Provenance & base-commit verification

- Branch: `docs/erp-v2-cp-sa-meal-cost-payload-redaction-prerequisite`.
- Branch base `HEAD` = **`3033b06f`** = the PR #864 merge commit (`Merge pull request #864 … docs/erp-v2-cp-s0-meal-cost-payload-redaction`), verified as `HEAD` and as containing the required ancestor commit `3033b06fb4b6adce6b518ed75eafbb22789180fe` (`git merge-base --is-ancestor … HEAD` → ancestor confirmed).
- This report therefore verifies against the exact tree in which CP-S0 (the plan it gates) landed.

---

## 3. Method & evidence standard

- Two read-only inventory sweeps (V2 hydration cost-alias inventory; `unitCost` consumer + deployment-topology + fixture inventory) plus first-hand `file:line` verification of the adapter, redactor, `page.tsx`, and redactor test.
- Evidence tiers used below: **[VERIFIED]** (read first-hand in the current tree), **[VERIFIED FROM DOCS]** (read from a committed doc, not re-executed against an environment), **[UNVERIFIED]** (cannot be proven from the repo — e.g. live Vercel env-var values).
- No secrets, tokens, cookies, authorization headers, connection strings, or PII are recorded. No credentials were entered.

---

## 4. Prerequisite 1 — is there a SECOND non-finance cost leak in the V2 hydration payload?

**Answer: NO second confirmed numeric supplier-cost leak.** The only unredacted numeric supplier-cost value that reaches a non-finance browser through the hydration payload is the already-known meal field.

**How the hydration payload is built and gated** [VERIFIED]:
`app/quotes/[id]/builder-v2/page.tsx` → `loadQuoteV2(id)` → adapter → `redactQuoteV2CostMargin(quote, canAccessFinance(role))` at `page.tsx:78` → hydrates **only** `quote={safeQuote}` at `page.tsx:201`. Every other prop passed to the client is a boolean capability/flag (`page.tsx:199-225`). `safeQuote` is therefore the **single cost-bearing payload** and the redactor is the **single choke point**. All other cost-bearing data (hotel-contract-summary, pricing preview, external-package preview/apply, version summary, apply-audit) is fetched **on-demand** by the client and **separately backend-gated** — none of it is in the hydration payload.

**Full cost-like field inventory of the normalized `Quote`** [VERIFIED]:

| Field | file:line | cost or sell | reaches non-finance? | redacted today? | disposition |
|---|---|---|---|---|---|
| `experiences[].unitCost` = `it.costBaseAmount` (meal only) | adapter `:1298` (type `quote-types.ts:172`) | **COST** (supplier meal cost) | **YES** | **NO** | **the confirmed leak → CP-Sb fix** |
| `experiences[].amount` = sell | adapter `:1167` set `:1265` | SELL | yes | no (intentional) | client-facing, keep |
| `transport[].amount` = sell | adapter `:1167` set `:1226` | SELL | yes | no (intentional) | client-facing, keep |
| `pricing.netCost` = `q.totalCost` | adapter `:1351` | **COST** | no | **YES** (`redaction:42`) | covered |
| `pricing.margin` | adapter `:1353` | COST-derived | no | **YES** (`redaction:43`) | covered |
| `pricing.markupPercent` | adapter `:1352` | COST-derived | no | **YES** (`redaction:44`) | covered |
| `pricing.lines[].amount` = sell | adapter `:1167/:1178` | SELL (engine `totalSell ?? sellPrice`) | no | **YES** (`redaction:45`) | covered (over-redacts a sell value; harmless) |
| `pricing.sellingPrice`/`perPerson`/`pax` | adapter `:1354-1356` | SELL-derived | yes | no (intentional) | client-facing, keep |
| `pricing.lines[].note` = `it.pricingDescription` | adapter `:1181` | text basis (may echo unit rates) | yes | **NO** | gray-area, §12 |
| `hotelCities[].options[].ratePerNight` | adapter `:1082/:1140` | hardcoded **`0`** | yes | n/a | never a real cost |
| `hotelCities[].options[].cityTax` | adapter `:1088/:1144` | hardcoded **`0`** | yes | n/a | never a real cost |
| `hotelCities[].options[].diagnostics.hasRate` | diagnostics `:75` | **boolean only** (cost reduced to `>0`) | yes | n/a | not a disclosure |
| `hotelCities[].options[].diagnostics.reasons/pricingSummary` = `pricingDescription` | diagnostics `:101-104` | text basis | yes | **NO** | gray-area, §12 |

**Fields on the raw item that carry cost but are NOT surfaced onto the Quote** [VERIFIED]: `it.totalCost` (feeds only `pricing.netCost` and the `hasRate` boolean), `it.overrideCost` (used only inside the `transportApplyEligible` boolean at adapter `:1213`, never emitted), `it.useOverride`. **No raw `...it`/`...r`/`Object.assign` spread reaches the Quote** — every experience/transport/hotel object is field-by-field constructed [VERIFIED first-hand].

---

## 5. Hotel `cost` block adjudication — NOT a second leak

The `cost?:{ baseCost, costBaseAmount, costCurrency, salesTaxPercent, … }` block at `quote-types.ts:434` belongs to the **`HotelContractSummary`** type (`quote-types.ts:408-443`), **not** to `HotelSelection`/`Quote.hotelCities`. `HotelSelection` (`:89-132`) has **no `cost` field**, and the adapter never sets one (hotel `ratePerNight`/`cityTax` are hardcoded `0`) [VERIFIED].

- It is produced by the **on-demand** backend endpoint `getHotelContractSummary` (HC-1) at `quotes.service.ts:6849`, fetched by the client only when the drawer opens (`GET …/hotel-contract-summary`) — **not** part of hydration.
- It is **backend-gated to finance**: `if (this.canActorViewCost(actor)) { summary.cost = { … } }` at `quotes.service.ts:6932-6941`; `canActorViewCost` → `canViewQuoteCostMargin(role)` = admin/super_admin/finance (`:3606-3607`). For non-finance the block is **omitted entirely** (never zeroed/null) — it never reaches a non-finance browser (`quotes.service.ts:6761` "omitted entirely").
- The version-summary `cost` block (`quote-types.ts:397`) is likewise finance-gated on the backend and on-demand (`quotes.service.ts:6823-6832`).

**Conclusion:** the Hotel `cost` block is a **separate, already-secured track**, not a hydration-payload field. It requires **no CP-Sb change**.

---

## 6. Prerequisite 2 — is `unitCost: null` for non-finance compatible across every consumer and type?

**Answer: YES for type and crash-safety (no type change needed); with one material behavioural nuance — the single builder consumer of the value is reachable by `operations` (non-finance), not finance-only.**

**Type** [VERIFIED]: `Experience.unitCost?: number | null` at `quote-types.ts:172`. The type **already permits `null`** → returning `null` requires **NO type change**.

**Producers** (write the field) [VERIFIED]:
- adapter `:437` `unitCost: asNumberOrNull(r.unitCost)` (`asNumberOrNull` at `:128-134` maps null/undefined/""/non-finite → `null`).
- adapter `:1298` `unitCost: isMealItem ? it.costBaseAmount ?? null : null` (only meal items get a value; every other kind is already `null`).

**Consumers that READ `Experience.unitCost`** [VERIFIED]:
1. **`components/quote/v2/steps/item-pricing-apply-modal.tsx:128`** — `useState(String(exp.unitCost ?? 0))`. `null`/`undefined` → `String(0)` = **`"0"`** (the `?? 0` coalesces first; never `"null"`/`"undefined"`/`NaN`). Echoed into payload at `:190` `unitCost: Number(unitCost)` (meal branch) and rendered as an editable input at `:378-380` (meal branch only).
   - **Gating nuance (material):** this modal is reachable when `canPreviewPricing` is true, defined at `page.tsx:51-52` as `hasRequiredRole(role, ["admin","operations"]) && PREVIEW_EDITABLE_STATUSES.has(status)`. That predicate **includes `operations`, which is NOT finance** (`canViewCostMargin = canAccessFinance(role)` = admin/super_admin/finance only, `page.tsx:71`). So this consumer is **NOT finance-gated** — an operations user can open the meal Apply modal.
2. **`components/quote/v2/steps/experiences-step.tsx:1176`** (AddMealPanel) — **NOT a consumer of `exp.unitCost`**; it uses its own local state and emits `unitCost` only under `canEnterCostOverride` (fed from `canViewCostMargin`). Correctly finance-gated; unaffected.

**Out-of-scope look-alikes** (different DTOs, not the quote V2 adapter): `app/bookings/[id]/page.tsx:172` (booking Item `unitCost`, coalesced `?? 0` at `:939`); `app/packages/PackageCostEstimatePanel.tsx:15` (package cost-estimate DTO). Neither is affected.

**Conclusions (Prerequisite 2):**
- **Crash-safety: PASS.** No consumer turns `null` into `NaN`, `"null"`, or `"undefined"`; every read path coalesces via `?? 0` to the number `0`. Returning `null` for non-finance is safe with **no type change**.
- **Behavioural nuance (must be carried into CP-Sb design):** because the one builder consumer is reachable by `operations` (non-finance), nulling the field will make the meal Apply modal's "Unit cost" input **prefill `0`** for operations — a *cosmetically misleading display*, **not a crash and not a data write**.
- **Data-integrity: contained.** The backend independently rejects any operations-supplied `unitCost` with `403 cost_override_forbidden` (per the committed M-1 validation reports), so an operations `0`-prefilled apply is **server-blocked**, not persisted. Finance users are not nulled and still see the true cost.
- **Design flag for CP-Sb:** if a *truthful* non-finance display is required (rather than a redacted-to-`0` display), the Apply modal (`item-pricing-apply-modal.tsx:378`) would need its own finance gate on the meal `unitCost` input — a **code change beyond the redactor**, and a scope decision for the owner. The minimal CP-Sb (redactor-only) closes the leak and is server-safe, at the cost of the `0` prefill for operations.

---

## 7. The single choke point & proposed CP-Sb fix boundary (Option c)

- **Choke point** [VERIFIED]: `redactQuoteV2CostMargin` (`quote-v2-cost-redaction.ts:30-48`), applied at `page.tsx:78`, currently nulls exactly four fields: `pricing.netCost`, `pricing.markupPercent`, `pricing.margin`, `pricing.lines[].amount`. Its docstring (`:19-23`) deliberately preserves "every … experience field", which is why `experiences[].unitCost` currently travels to all roles.
- **Proposed CP-Sb fix (Option c from CP-S0):** in the `!canViewCostMargin` branch of the redactor, additionally set each `experiences[].unitCost` to `null`. This is the **smallest possible boundary** — one function, one branch, one field family — and it lands on the *single* payload that carries quote cost.
- **Why Option c is preferred over redacting at the adapter:** the adapter is role-unaware at the field-mapping site; the redactor is the one place that already receives `canViewCostMargin`. Keeping the change in the redactor keeps producer logic untouched and keeps all cost-visibility policy in one file.

---

## 8. Redactor test / regression surface

- Test file: `quote-v2-cost-redaction.test.ts` (76 lines) [VERIFIED]. It already asserts: privileged returns unchanged same-reference (`:31-35`); restricted zeroes netCost/markup/margin/lines[].amount (`:40-45`); restricted keeps selling price/perPerson/pax/currency (`:48`); restricted is **NOT over-redacted** — line labels/status **and per-item `transport[].amount`/`experiences[].amount` survive** (`:56-62`); purity/no-mutation (`:65-69`); null passthrough for both roles (`:72-74`).
- **Regression impact of Option c:** the existing "not over-redacted" test asserts `experiences[0].amount` (the *sell*) survives — Option c does not touch `amount`, so that assertion still holds. CP-Sb must **add** an assertion that restricted nulls `experiences[].unitCost` while privileged preserves it, and that `experiences[].amount` is still untouched. No existing assertion is invalidated by Option c. Regression surface is contained to this one test file plus any source-grep tests that pin redactor contents (none found referencing `unitCost` in this file).

---

## 9. Prerequisite 3 — documented, retained synthetic staging fixture containing a Meal item

**Answer: YES — one exists and is explicitly retained.** [VERIFIED FROM DOCS: `…meal-create-backend-validation-report.md`, `…meal-create-frontend-validation-report.md`]

- **Quote ID:** `13238d51-9f4e-4297-b292-5003b3cbdae3`.
- **Title:** `UAT-STAGING-M1A-MEAL-CREATE — DO NOT SEND` (explicit DO-NOT-SEND marker).
- **Status:** DRAFT; not accepted; no version/invoice/booking/voucher/packet/public link.
- **Itinerary day:** `38f9f268-335f-486f-b39d-7d562bcd0d76`.
- **Meal items (two, both documented as retained):**
  - M-1a: `24720a7e-7f14-4b55-8983-9a4a44e95358` — "UAT-STAGING-M1A QA Meal", qty 1, markup 20, `costBaseAmount 30`, USD, totalCost 60 / totalSell 72, serviceDate 2026-09-01.
  - M-1b: `385feb4b-41f0-4d5d-9752-1a034590c4d3` — "UAT-STAGING-M1B QA Meal", qty 1, markup 20, `costBaseAmount 30`, USD, totalCost 60 / totalSell 72, serviceDate 2026-09-05.
- **Meal catalog service:** `11111111-1111-1111-1111-111111110020` "QA Meal Service", baseCost 30, USD, per_person.
- **Staging + synthetic (explicit):** `RAILWAY_PROJECT_NAME = dmc-platform-staging`; production not targeted; staging API `QUOTE_ITEM_CREATE = true`, production item-create OFF.
- **Retention:** explicitly **RETAINED — not deleted**; both reports record all IDs "for later cleanup" and instruct retention until then.
- **Corrections to prior working notes:** the meal fixture is `13238d51` (NOT the external-package fixture `fbd0fde8`, which contains an External Package item, not a Meal). The meal-create PRs cited by these committed reports are **#831 (backend) / #833 (frontend)** — PRs #830/#832/#834 are **[UNVERIFIED]** against these docs.

**Conclusion:** a documented, retained synthetic staging fixture containing a Meal item (`13238d51`, with `costBaseAmount 30`) is already in place. CP-Sb staging validation would **not** require a new staging mutation to create one. (No staging mutation is proposed or performed here.)

---

## 10. Prerequisite 4 — can the implementation + merge flow avoid an UNAUTHORIZED production read-path change?

**Answer: NOT under the current deployment configuration without an explicit owner decision — this is the primary gating condition for CP-Sb.**

**Deployment topology** [VERIFIED FROM DOCS: `erp-v2-frontend-deployment-config-hygiene-review.md`, `deployment-migration-governance.md`; VERIFIED repo config: `.vercel/project.json`, `.vercel/repo.json`, `apps/admin-web/vercel.json`; VERIFIED absence: no `.github/workflows`, no `railway.*`/`nixpacks` files]:

1. Three admin-web Vercel projects exist and **all auto-deploy from the same `main` branch**: `dmc-platform-admin-web-4gu9` (canonical internal build/test target — the repo-root `.vercel` link), `dmc-platform-admin-web-staging` (staging), and `dmc-platform-admin-web` (vestigial duplicate, zero V2 flags).
2. **Merging an admin-web change to `main` currently auto-deploys to ALL THREE simultaneously**, with **no manual gate**. The "set the prod (`-4gu9`) frontend to manual deploy" hardening is **proposed in the governance doc but NOT yet applied** — "Until that setting change is made, [prod] keeps auto-deploying `main`."
3. Per-PR Vercel builds/checks exist for all three projects (a branch renders without merging), **but** the committed meal validations were performed on the **post-merge staging deploy** because httpOnly-cookie auth blocked authenticated interactive preview validation. → [PARTIALLY VERIFIED] that authenticated end-to-end validation needed a merged staging deploy.
4. `NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT` gates **only** the Classic→V2 auto-redirect (`app/quotes/[id]/page.tsx:23-42`), **not** builder-v2 reachability; the builder-v2 route is directly reachable by URL and from an in-Classic link regardless of that flag. So the redaction change affects the read-path on any deployed target where the builder-v2 page is reachable — which is all three.
5. **[UNVERIFIED]:** the literal runtime values of `NEXT_PUBLIC_*` env vars on each project, and the Vercel dashboard auto-deploy toggles/aliases, are **not in the repo** — asserted only by the committed docs. This report cannot prove the live toggle state.

**Owner reframing (recorded in the hygiene review):** the owner has stated this is **internal build/test mode — no real-life production usage, no staff rollout, no live bookings**; "production" here means the Vercel production *deployment target* (`-4gu9`), not a live business system.

**Adjudication:** Because auto-deploy is still ON, a **normal merge-to-`main` WOULD propagate the redaction read-path change to the `-4gu9` ("production") target automatically.** That is a production read-path change. Two mitigating facts: (a) the change is **strictly tightening** — it removes a cost value for non-finance and adds nothing; it cannot loosen exposure; (b) the target is internal build/test per the owner's reframing. Neither fact makes the auto-deploy *authorized* by default — the standing boundary forbids unauthorized production deploys/config.

---

## 11. Merge-flow options to keep CP-Sb within authorization

CP-Sb must pick one of these **with explicit owner approval** — CP-Sa does not choose:

- **Option (i) — Owner pre-authorizes the auto-deploy** as part of approving CP-Sb, on the record that the change is strictly tightening and the target is internal build/test. Simplest; makes the `-4gu9` deploy authorized rather than incidental.
- **Option (ii) — Owner applies the proposed hardening first** (disable auto-deploy on `-4gu9`), then CP-Sb merges to `main`, deploys staging only, validates, and the `-4gu9` promotion is a separate manual, separately-approved step. Cleanest separation; requires a Vercel setting change (owner-only, not in repo).
- **Option (iii) — Validate on a PR/preview build without merging**, then merge only after approval. Constrained by the httpOnly-auth limitation noted in §10(3), so authenticated end-to-end validation may still need a merged staging deploy.

**CP-Sa does not authorize any of these.** It records that **a merge-to-`main` is not read-path-neutral for `-4gu9` today**, so CP-Sb must not merge without an explicit owner decision on which option applies.

---

## 12. Secondary / out-of-scope observation (not part of the meal fix)

`it.pricingDescription` text flows to all roles via `pricing.lines[].note` (adapter `:1181`) and via `diagnostics.reasons`/`pricingSummary` (diagnostics `:101-104`). If pricing descriptions can embed unit-rate figures, that **text** is a minor cost-*inference* vector. It is **not a clean numeric cost field**, is **not** the meal leak, and is **out of scope for CP-Sb**. Flagged here for a possible separate follow-up review; no action proposed now.

---

## 13. Residual risks & known effects if CP-Sb (Option c) proceeds

- **Cosmetic:** operations (non-finance) users will see the meal Apply modal "Unit cost" input prefill `0` instead of the real cost (§6). Not a crash, not a write; backend rejects operations overrides (`403 cost_override_forbidden`).
- **Deployment:** a merge propagates to `-4gu9` under current auto-deploy config (§10) unless Option (ii) is taken.
- **Session:** the stateless 12h HMAC token has no server-side revocation (`auth.service.ts:278-363`) — unchanged by CP-Sb; noted as pre-existing.
- **Monitoring/audit:** no general read-only audit-query surface; backend live-log monitoring unestablished — pre-existing, unchanged.

---

## 14. Prerequisite resolution summary

| # | Prerequisite | Result |
|---|---|---|
| 1 | Any second non-finance cost leak (Experience alias / raw spread / Hotel block / other hydration field)? | **NO** — meal `experiences[].unitCost` (adapter `:1298`) is the sole one; Hotel block is on the finance-gated on-demand HC-1 endpoint; no raw spreads. |
| 2 | `unitCost: null` compatible across every consumer & type? | **YES for type & crash-safety (no type change)**; nuance: the one builder consumer is `operations`-reachable → cosmetic `0` prefill, backend-blocked. |
| 3 | Documented retained synthetic staging fixture with a Meal item? | **YES** — quote `13238d51` (M-1a/M-1b meal items, `costBaseAmount 30`), explicitly retained. |
| 4 | Can implementation + merge flow avoid an unauthorized production read-path change? | **NOT under current auto-deploy config without an explicit owner decision** — §10/§11 (this is the gating condition). |

---

## 15. CP-Sb preconditions & explicit restrictions (if separately approved)

CP-Sb, when and only when separately approved, must:
1. Be **redactor-only** (`quote-v2-cost-redaction.ts`, `!canViewCostMargin` branch) nulling `experiences[].unitCost`; no producer/adapter change; no type change.
2. Add regression tests asserting restricted nulls `experiences[].unitCost` while privileged preserves it, and that `experiences[].amount` (sell) is untouched.
3. Decide, with the owner, whether the operations `0`-prefill (§6) is acceptable or the Apply modal needs its own finance gate (a larger scope).
4. **Not merge to `main` without an explicit owner decision selecting Option (i), (ii), or (iii) in §11** (because a merge auto-deploys to `-4gu9` today).
5. Validate on the retained meal fixture `13238d51` on **staging only**; keep production item mutation OFF; keep non-finance participation prohibited until the full redaction → tests → staging validation → validation-doc sequence passes and is separately approved.

---

## 16. Final verdict & standing boundaries

### Verdict: **CONDITIONAL GO to CP-Sb implementation preparation only.**

Conditional on all of the following explicit restrictions:
- **This report does NOT authorize CP-Sb.** CP-Sb requires a **separate, explicit owner approval**.
- **CP-Sb must not open, deploy, or merge any PR** until the owner has (a) approved CP-Sb and (b) selected a merge/deploy option from §11 — because merging admin-web to `main` auto-deploys to the `-4gu9` production target under the current, un-hardened configuration.
- **CP-Sb scope is capped** at the redactor-only Option c plus its tests plus staging-only validation on fixture `13238d51`, with the operations-prefill decision (§6/§15.3) reserved to the owner.
- **No CP-Sb authorization is implied by CP-Sa itself.**

No prerequisite is unresolved to the point of NO-GO: prerequisites 1–3 are resolved affirmatively; prerequisite 4 is resolvable by an owner deployment decision at CP-Sb approval time and is recorded as the gating condition rather than a blocker to *preparation*.

### Standing boundaries (reaffirmed)

ERP V2 remains build/test only; **Classic remains the system of record**; no staff rollout; no live bookings; no actual-production access/reads/writes/deploys/config; production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept / invoice / booking / conversion / public link / voucher / packet / supplier-send / email / send; **non-finance participation remains prohibited** until the meal `unitCost` server-side redaction + tests + staging validation + validation doc sequence passes and is separately approved; no Scope M.

**Safety confirmation:** documentation-only; produced without accessing staging, production, Vercel, Railway, the deployed application, browser sessions, databases, logs, monitoring, or authentication; no sign-in performed; no code/test/schema/migration/flag/environment/deployment/configuration/role/permission/session/data change; no credentials, passwords, tokens, cookies, authorization headers, connection strings, raw secrets, or PII recorded.

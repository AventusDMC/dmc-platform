# ERP V2 — CP-N1a: Non-Finance Internal-Payload Redaction — Prerequisite Verification

**Documentation-only, read-only, static.** Verified against current `main` (contains CP-N1 merge `bfbdd0c1f4c6d4084049b63b703a0a16841be3fa`) using committed code, types, tests, docs, and Git/PR history only. **No** Vercel/Railway/staging/production/browser/application/authentication/database/log/business-data access. This report does **not** authorize CP-N1b implementation, deployment, staging validation, the public-token track, or non-finance participation.

Legend: **[FACT]** verified `file:line`; **[REC]** recommendation; **[UNVERIFIED]** not provable from the repo; **[DECISION REQUIRED]** owner decision.

> **Headline correction to CP-N1:** static evidence contradicts CP-N1's contract A. Replacing a real `transport[].supplier` with the literal `"Unassigned"` would **falsely report the leg as unassigned** (it drives UI state, not just display). Corrected contract A below.

---

## 1. Re-verified A/B/C exposure paths (current `main`)

| # | Field | Type | Source → adapter | Redactor today | Roles receiving it | Delivered while UI-hidden? |
|---|---|---|---|---|---|---|
| A | `transport[].supplier` | `TransportService.supplier: string` (non-optional) `quote-types.ts:225` (+`supplierContract` `:226`) | name `quote-v2-adapter.ts:1195`; set `:1222` (`?? "Unassigned"`); coercion `:473` | **not touched** (`quote-v2-cost-redaction.ts:44-59`) | all | rendered (not hidden) |
| B | `pricing.lines[].note` | `CostLine.note: string` (non-optional) `quote-types.ts:305` | `it.pricingDescription ?? ""` `adapter.ts:1180`; `mapPricing note` `:561` | **not touched** | all | **YES** — rendered only inside finance-gated branch `pricing-step.tsx:67` (`:52-98`); non-finance get "Restricted" placeholder yet the value still travels |
| C | hotel `diagnostics.reasons[]` | `HotelSelection.diagnostics?` `quote-types.ts:131`; `reasons: string[]` `quote-hotel-diagnostics.ts:50` | producer `quote-hotel-diagnostics.ts:62-134`; `contractName` src `adapter.ts:1007`, `pricingSummary` src `:1010`; wired `:400` | **not touched** | all | rendered in hotels-step "Why?" (`hotels-step.tsx:378-404`) |

- **[FACT]** Redactor scope confirmed unchanged: only `pricing.netCost/markupPercent/margin`, `pricing.lines[].amount`, and `experiences[].unitCost` (`quote-v2-cost-redaction.ts:44-59`). Tests assert the meal path only (`quote-v2-cost-redaction.test.ts:103-129`); nothing about A/B/C.
- **[FACT]** Role predicate: `canViewCostMargin = canAccessFinance(role)` (`page.tsx:71`) → admin/super_admin/finance; redaction applied at `page.tsx:78`, only `safeQuote` hydrated (`:201`).

---

## 2. Transport supplier contract (§ corrected)

- **[FACT]** Sole normalized-Quote consumer: `transport-step.tsx:46` `const unassigned = svc.supplier.toLowerCase() === "unassigned"`; `:83` renders `{svc.supplier}` (red when `unassigned`); `:84` shows `<ContractBadge status={svc.supplierContract}/>` **only when NOT unassigned**. No other component/test reads `Quote.transport[].supplier`.
- **[FACT]** `"unassigned"` is **not merely display** — it controls the assigned/unassigned visual state and whether the contract badge shows. **`.toLowerCase()` has no null guard → nulling `supplier` crashes render.**
- **[FACT]** `supplierContract` (`:1224`) is derived from presence of a name (`supplierName ? "on-request" : "no-contract"`), an enum, not identity.

**Contract comparison:**

| Option | Crash-safe? | Hides identity? | Assignment state truthful? | Cost |
|---|---|---|---|---|
| Existing `"Unassigned"` sentinel (CP-N1) | yes | yes | **NO — falsely reports unassigned; hides badge** | redactor-only |
| **Non-identifying `"Assigned"` sentinel** (for assigned legs; keep `"Unassigned"` for genuinely unassigned) | yes | yes | **yes** | redactor-only |
| Separate boolean/status + redacted supplier | yes | yes | yes | **type + component change** |
| Null/omit + consumer hardening | only after guarding `:46` | yes | yes | **component change** |

- **[REC] Corrected contract A:** in the redactor, for non-finance map `supplier = (supplier.trim().toLowerCase() === "unassigned") ? "Unassigned" : "Assigned"` (exact non-identifying label **[DECISION REQUIRED]** — "Assigned" vs "Supplier" vs "Assigned (hidden)"). Keep `supplierContract` (low-sensitivity enum). This never crashes, exposes no identity, and preserves the true assignment state + badge. **No type or component change** (stays `string`; consumer logic unaffected). Finance retains the real name.

---

## 3. Pricing-line note contract

- **[FACT]** Producer: `adapter.ts:1180` (`it.pricingDescription ?? ""`) → `mapPricing note` `:561`. Sole consumer: `pricing-step.tsx:67`, a bare JSX expression **inside the finance-gated branch** (`:52-98`); React-tolerant of `null`/`undefined`/`""`. Non-finance never render it (they see the "Restricted" card `:82-98`) but it is still delivered in the payload.
- **[FACT]** No non-finance workflow needs it. The line `label` (category, e.g. "Hotels"/"Transport") is a **separate** field from `note` and is not the pricingDescription — keeping `label` is safe; blanking `note` preserves selling data (`amount`, `label`, `sellingPrice`, `perPerson`, `pax`).
- **[FACT]** Content is MIXED and inseparable — `pricingDescription` concatenates client-descriptive routing and internal rate/discount text in one free-form pipe string (`quote-types.ts:560-565`, example "…| Per vehicle | Supplier transport discount 25% applied"). No reliable delimiter → **fail closed on the whole string.**
- **[REC] Contract B:** blank `pricing.lines[].note` to `""` for non-finance/unknown; finance unchanged. Preserves type (`string`), no consumer change, no UI change for non-finance.

---

## 4. Hotel diagnostics contract

**[FACT] Complete enumeration of `reasons[]` lines produced by `quote-hotel-diagnostics.ts`:**

| # | `file:line` | Line | Classification |
|---|---|---|---|
| 1 | `:79` | "Imported from the itinerary … Manage options in Classic Builder." | SAFE operational |
| 2 | `:84` | "Alternative option — not the current primary for this stop." | SAFE |
| 3 | `:90` | "Contracted — a supplier contract is linked in Classic (\"{contractName}\")…" | **CONTRACT IDENTITY — sensitive** |
| 4 | `:95` | "On request — … no supplier contract is linked. Confirm or add a contract…" | SAFE |
| 5 | `:98` | "No contract linked for this option." | SAFE |
| 6 | `:104` | "Rate on file (from Classic): {pricingSummary}" | **RATE/COST — sensitive** |
| 7 | `:105` | "Rate on file on the priced line in Classic." (no value) | SAFE |
| 8 | `:108` | "No rate found on the priced hotel line — confirm the rate in Classic Builder." | SAFE |
| 9 | `:112` | "Room category not set — confirm in Classic Builder." | SAFE |
| 10 | `:114` | "Room category: {roomCategory}." | room-category (LOW; **[DECISION REQUIRED]**) |
| 11 | `:119` | "No priced hotel line matched in V2 …" | SAFE |
| 12 | `:122` | "Shown as on request for review until confirmed in Classic." | SAFE |
| 13 | `:127` | "Star category not set on the option." | SAFE |
| 14 | `:130` | "Rooming not specified." | SAFE |

- **[FACT]** Sensitive lines: **#3 (contract name)** and **#6 (rate text)**; #10 (room category) is low-sensitivity operational.
- **[FACT]** Consumers do not depend on free-form text, wording, or array order: `hotels-step.tsx:229` (`diagnostics?.reasons ?? []`), `:378` (gate on `reasons.length > 0`), renders each as `<li>`. Empty array simply hides the list. The state label uses `contractState` (`:230`), the badge uses `hotel.contractStatus` (`:258`), pricing uses separate fields — none parse `reasons`.
- **[FACT]** Structured fields `contractState` (`quote-hotel-diagnostics.ts:44`), `hasRate` (`:45`), `source` (`:47`) carry readiness with **no** contract name/rate value. `hasRate` reveals only that *a* rate exists, not its amount — low-sensitivity operational (equivalent to the already-shown contract-status badge).
- **Options:** (a) selectively filter #3/#6 — fragile/fail-open if wording changes; (b) **empty `reasons = []`** for non-finance — fail-closed, crash-safe, redactor-only; (c) whitelist/rebuild safe reasons or emit structured codes — larger scope (producer change).
- **[REC] Contract C (fail-closed):** for non-finance/unknown, keep structured `contractState`/`hasRate`/`source` and set `reasons = []`. No type/component change; UI keeps the contract-state label, drops the free-form "Why?" lines. **[DECISION REQUIRED]** if the owner wants to preserve safe operational reasons for Operations, adopt option (c) (whitelist/structured codes) as a follow-up — larger than the redactor-only slice.

---

## 5. Redaction boundary — confirmed

- **[FACT]** Role is resolved authoritatively (`page.tsx:71` `canAccessFinance(role)`) **before** hydration; `redactQuoteV2CostMargin` runs at `:78`; only `safeQuote` is passed to the client (`:201`). The redactor is pure/immutable (`quote-v2-cost-redaction.ts:36-60`).
- **[FACT]** The V2 builder page is the single V2 hydration route through the redactor; Classic (`ClassicQuoteWorkspace`) and unrelated endpoints do **not** use it and are out of scope.
- **[FACT]** A/B/C are all implementable **solely at this choke point** — they read fields already on the normalized `Quote`; no adapter/pricing/readiness calculation changes (diagnostics/note are display-only; supplier sentinel is a string swap).
- **[FACT]** Fail-closed: `canAccessFinance` returns `false` for unknown/undefined/null roles (`auth-session.ts:65-66`) → redacted branch runs. **[REC]** the fix must be **unconditional — no feature flag** (a security control must not be toggleable).

---

## 6. Alias & nested free-form re-audit

- **[FACT]** `pricingDescription` reaches the payload in exactly two places: `pricing.lines[].note` (`adapter.ts:1180`, field B) and diagnostics `pricingSummary` → `reasons` (`adapter.ts:1010`, field C). The raw item `pricingDescription` (`adapter.ts:700`) is **not parsed or emitted** (`:434` "no pricingDescription parsing"; meal/activity/guide raw fields are IDs, not the text).
- **[FACT]** Supplier identity appears only in `transport[].supplier` (`adapter.ts:473,1222`) — field A.
- **[FACT]** Contract identity (`contractName`) appears only via diagnostics (`adapter.ts:1007` → reasons `:90`) — field C.
- **[FACT]** No raw-object spread smuggles fields (`adapter.ts:1544` dev-only `{ ...demoQuote, id }`); hotel `ratePerNight`/`cityTax` hard-coded `0` (`:1082-1083,1140`); contract **id**, supplier email/phone not serialized.
- **Result:** the corrected A + B + C contracts **jointly cover every instance** of supplier identity, contract identity, and rate/pricing text. **No equivalent alias is left exposed** → not a NO-GO on alias grounds. (True duplicate handled: pricingDescription in both B and C — both redacted.)

---

## 7. `meta.publicToken` — separate track

- **[FACT]** Source `adapter.ts:1419` / `mapMeta:295`; type `quote-types.ts:473` (+`publicEnabled` `:475`). Consumers: `quote-builder-v2.tsx:550` → `proposal-step.tsx:158,283,288-292` (`shareUrl = ${origin}/proposal/${publicToken}`), copy `:335-344`, render `:902-919`; Classic parallel `ShareQuoteButton.tsx:25-38`.
- **[FACT]** **Capability-bearing:** public routes are `@Public()` and resolve by token alone — `public-proposals.controller.ts:5`, `quotes.controller.ts:315-349` (`public/:token/view|accept|request-changes`), `quotes.service.ts:851-853/876-878/1072-1074/1148-1149` (`where:{ publicToken, publicEnabled:true }`, no actor/role check). Token + `publicEnabled=true` = anonymous **read + accept + request-changes**.
- **[FACT]** Internal hydration needs no raw token for any role: the share block is handler-gated (`proposal-step.tsx:876`, `quote-builder-v2.tsx:552-553`) and enable **re-fetches a fresh token** (`builder-v2-client.tsx:962-985`); null/omit is crash-safe (`:283/:288`).
- **[REC] Separate-track scope:** omit/null the serialized `meta.publicToken` for **all internal hydration roles** (strongest; the enable flow re-fetches through an authorized action). Minimal change: gate/strip in `mapMeta`/redactor for internal hydration; UI degrades to the "Enable link" state. **[DECISION REQUIRED]** confirm all-roles vs non-finance-only vs only-when-`publicEnabled=false`.
- **Blocking analysis:** does **NOT** block CP-N1b A/B/C (independent). **DOES block a future non-finance read-only pilot** — a non-finance session would still receive a live capability token in the payload. **[REC]** resolve the token track before any non-finance pilot.

---

## 8. Fixture verification (committed evidence only)

| Needed shape | Documented synthetic/retained fixture | Status |
|---|---|---|
| Assigned transport supplier | none found | **[UNVERIFIED]** — meal fixture `13238d51…` has Transport: Missing |
| Pricing-line internal note | meal fixture `13238d51…` (its meal lines carry a `note`) | present, but only meal note |
| Hotel diagnostics with contract/rate reason | H-A1 synthetic quote `9c450350…` (documented matched/contract hotel option sets) | **[UNVERIFIED]** whether it yields a `contractName`/rate reason — reverify by hard guard |
| Public-token state (`publicEnabled=true`) | none found | **[UNVERIFIED]** |

- **[FACT]** No single retained synthetic fixture covers all of A + B + C (+ token).
- **[REC]** For later (separately-approved) validation, provision **one owner-approved temporary synthetic fixture** carrying: an assigned transport leg (named supplier), a priced line with a rate/discount note, a hotel option with a linked contract + rate, and (if the token track is in that validation) `publicEnabled=true` — then delete it. Alternative: combine the meal fixture + `9c450350…` (multiple fixtures) if hard-guard reverification confirms the hotel-contract reason. **Do not access staging or create fixtures in CP-N1a.** Never use live/real records.

---

## 9. Implementation-scope proof (for CP-N1b)

- **Required (exactly two files):** `apps/admin-web/lib/quote-v2-cost-redaction.ts` (extend the restricted branch: transport-supplier sentinel map, `pricing.lines[].note = ""`, `diagnostics.reasons = []`) and `apps/admin-web/lib/quote-v2-cost-redaction.test.ts` (add A/B/C role coverage).
- **Optional / not required:** no type change (all fields stay their current types), no component change (consumers already tolerate the contracts), no adapter change.
- **[FACT]** No backend/API, schema, migration, pricing calculation, mutation, flag, environment, or Classic change is required — A/B/C are display-only fields redacted at the hydration choke point.
- **Acceptance criteria:** finance payload byte-identical (same-reference early return); non-finance gets corrected A/B/C; fail-closed for unknown roles; input not mutated; CP-Sb meal + `pricing.*` regressions green; `tsc` baseline unchanged in changed files.
- **[NOTE]** `meta.publicToken` is **excluded** from these two files' scope — separate track (§7).

---

## 10. Deployment-isolation decision sheet

| Option | Risk | Prerequisites | Reversibility | Evidence |
|---|---|---|---|---|
| **A. Open/unmerged PR + owner-controlled temporary staging-alias deploy, baseline capture + mandatory restoration, then separate merge approval** | LOW (production read path unchanged until a separate merge) | owner-driven Vercel promotion/restoration (this session has no Vercel API access); captured baseline deployment id | HIGH (restore to baseline `main`) | proven by CP-Sb Option C |
| B. Separately-approved merge → automatic production read-path deploy → staging validation | MEDIUM (production read path changes before validation; but the change only tightens exposure) | explicit owner merge approval | via redeploy of prior `main` | GitHub/Vercel check metadata |
| C. Protected isolated preview only | BLOCKED unless the server-side same-origin `/api/quotes/:id` hydration interception is resolved without bypass | a non-bypass fix to preview protection | n/a | CP-Sb showed this fails |

- **[REC] Option A** (mirrors the successful CP-Sb Option C pattern; keeps the production read path untouched until a separate merge decision). **Do not** choose an approach that bypasses Vercel deployment protection. **Explicit owner approval remains required before any CP-N1b merge or production read-path change.** Do not execute any option in CP-N1a.

---

## 11. Test & validation matrix (for CP-N1b)

Automated (extend `quote-v2-cost-redaction.test.ts`):
- Roles: `admin`/`super_admin`/`finance` retain exact A (real supplier), B (real note), C (full reasons); `operations`/`agent_admin`/`agent`/`viewer` get corrected A (sentinel, assignment-truthful), B (`""`), C (`reasons=[]`, structured kept).
- Unknown/undefined/null roles → fail-closed to the redacted contract.
- A/B/C + discovered aliases: assert non-finance payload contains **no** real supplier name, **no** `pricingDescription`/"discount" substring in `note` or `reasons`, **no** `contractName`, **no** "Rate on file (from Classic):" text.
- Assignment-state correctness: a genuinely-unassigned leg still reads "Unassigned"; an assigned leg reads the sentinel and keeps `supplierContract` (badge shows).
- Finance preservation: same-reference early return; finance values byte-identical.
- Selling/itinerary/readiness preserved: `transport[].amount`, `pricing.lines[].label`/`amount`, `sellingPrice`/`perPerson`/`pax`, `diagnostics.contractState`/`hasRate`.
- Edge cases: absent/empty supplier, empty note, null diagnostics/empty reasons — no crash.
- Multiple rows/lines/reasons all redacted (array maps).
- Input immutability (no mutation of the source object).
- Regressions: CP-Sb meal (20/20) + pricing-redaction siblings (8/8) stay green; `tsc` baseline comparison (no new errors in changed files).
- Later live hydration evidence (separately approved): Operations hydration shows sentinel/`""`/empty-reasons/no-token; Admin shows real values; zero business mutations; fixture invariant; network classification; sign-out + protected-route denial.

---

## 12. Prerequisite verdict

### **CONDITIONAL GO** — to CP-N1b implementation *preparation* only.

CP-N1b remains **unauthorized**. No implementation, deployment, staging validation, public-token track, or pilot is begun.

- **Final A/B/C contracts (corrected):**
  - **A** `transport[].supplier` → non-finance: `"unassigned" → "Unassigned"`, else a **non-identifying sentinel** (recommend `"Assigned"`), keep `supplierContract`. **Not** the literal-"Unassigned"-for-all that CP-N1 proposed (would falsely report unassigned).
  - **B** `pricing.lines[].note` → `""` for non-finance (fail-closed; label/selling preserved).
  - **C** hotel `diagnostics.reasons[]` → `[]` for non-finance; keep structured `contractState`/`hasRate`/`source`.
- **Exact implementation files:** `apps/admin-web/lib/quote-v2-cost-redaction.ts` + `apps/admin-web/lib/quote-v2-cost-redaction.test.ts` (redactor + test only; no type/component/backend/Classic change).
- **Redaction-boundary conclusion:** extend `redactQuoteV2CostMargin` (single choke point, after role resolution, before hydration; fail-closed; unconditional/no flag; Classic unaffected).
- **Alias-audit result:** A/B/C cover every instance of supplier identity, contract identity, and rate/pricing text; **no residual alias** — not a NO-GO.
- **Fixture findings:** meal fixture `13238d51…` covers a pricing note only; transport-supplier and public-token fixtures **[UNVERIFIED]**; hotel-contract candidate `9c450350…` **[UNVERIFIED]**. Recommend one owner-approved temporary combined synthetic fixture (or multiple retained fixtures) for later validation.
- **`meta.publicToken` conclusion:** capability token → **separate security track**; does **not** block CP-N1b A/B/C, but **must be resolved before any non-finance pilot**.
- **Deployment-isolation recommendation:** Option A (temporary staging-alias + mandatory restoration; no protection bypass); explicit owner approval required before merge/production read-path change.

**Owner decisions still required before CP-N1b:** (1) confirm the corrected A/B/C contracts and the exact A sentinel wording; (2) decide C = empty-reasons (recommended) vs a safe whitelist/structured-codes follow-up, and the room-category line; (3) confirm boundary = redactor-only, unconditional; (4) approve the deployment-isolation option; (5) provision the validation fixture(s); (6) authorize the separate `meta.publicToken` track and its role rule.

---

## Standing boundaries (reaffirmed)

Non-finance ERP V2 participation remains prohibited; ERP V2 remains build/test only; Classic remains the system of record; no staff rollout or live bookings; production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept, invoice, booking, conversion, public link, voucher, packet, supplier-send, email, or send; no staging or production access.

**Safety confirmation:** documentation-only; produced without accessing staging, production, Vercel, Railway, the deployed application, browser sessions, databases, logs, monitoring, or authentication; no sign-in performed; no code, test, schema, migration, flag, environment, deployment, configuration, role, permission, session, pricing, account, or data change; no credentials, password values, hashes, tokens, cookies, connection strings, authorization headers, supplier PII, or live data recorded.

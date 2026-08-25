# ERP V2 — CP-T0: Internal Hydration Public-Token Security Readiness Plan

**Documentation-only, static, read-only repository analysis.** Produced from committed sources on `main` (contains PR #872 merge `c22e5a3b7053cda08039dbb980c14ad9d28a617a`). **No** environment, application, browser, deployment provider, database, log, fixture, credential, session, or business-data access was performed. **No** public-token value or token-bearing URL is reproduced anywhere in this document.

Legend: **[FACT]** verified from code/docs with `file:line`; **[REC]** recommendation; **[UNVERIFIED]** not provable from the repo; **[DECISION REQUIRED]** owner decision.

---

## 1. Complete `meta.publicToken` source→browser path

- **[FACT] DB/storage source:** `apps/api/prisma/schema.prisma:1628-1629` — `publicToken String? @unique` (nullable, globally unique) + `publicEnabled Boolean @default(false)`.
- **[FACT] Backend serialization (authenticated GET):** `quotes.service.ts` `findOne` → `loadQuoteState(id, …)` (`:637`); `loadQuoteState` (`:12690`) fetches `prisma.quote.findFirst({ where: { id } })` **with no `select` projection** (`:12694`) and returns `{ ...quote, … }` (`:13071`). Because there is no field projection, **`publicToken` + `publicEnabled` are spread verbatim into `GET /quotes/:id` for every authenticated role.** This is the root exposure — nothing on the backend strips the token by role.
- **[FACT] Adapter serialization (V2 normalized Quote):** `quote-v2-adapter.ts` `mapMeta` `publicToken` (`:295`)/`publicEnabled` (`:296`); top-level meta `publicToken: q.publicToken ?? null` (`:1419`)/`publicEnabled` (`:1420`); `RawErpQuote` (`:810-811`); type `QuoteMeta.publicToken`/`publicEnabled` (`quote-types.ts:472-475`). Fetch is **GET-only** (`fetchErpQuote` → `adminPageFetchJson('/api/quotes/${id}', …, { cache:'no-store' })`, `:1466`).
- **[FACT] Redaction boundary:** `quote-v2-cost-redaction.ts` `redactQuoteV2CostMargin` touches only `pricing.*`, `experiences[].unitCost`, `transport[].supplier`, `pricing.lines[].note`, `hotelCities[].options[].diagnostics.reasons` — and **deliberately NOT `meta.publicToken`** (explicit comment `:39-40`; test asserts it survives `quote-v2-cost-redaction.test.ts:328-331`).
- **[FACT] Server-component/proxy:** `builder-v2/page.tsx` — `loadQuoteV2(id)` (`:26`) → `safeQuote = redactQuoteV2CostMargin(quote, canViewCostMargin)` (`:78`) → `quote={safeQuote}` (`:201`). Since the redactor ignores `meta.publicToken`, `safeQuote.meta.publicToken` is present for **all** internal roles (operations/agent/agent_admin/viewer), not just finance. (`canViewCostMargin` gates cost fields only.)
- **[FACT] Frontend consumers (V2):** the **sole** internal reader is the ProposalStep share affordance — `quote-builder-v2.tsx:550-551` passes `quote.meta.publicToken`/`publicEnabled` to `<ProposalStep>`; `proposal-step.tsx` seeds local `share` state (`:281-284`), builds a client-side `shareUrl` = origin + `/proposal/${share.publicToken}` (`:289-292`), used only for the copy-link control (`:335-344`, `:902-904`). The block is **handler-gated** (`:295`, `:316`).

---

## 2. Token authority (every token-only / `@Public()` route)

Every token-keyed route requires `publicToken` **AND** `publicEnabled: true` (a bare token on a disabled link resolves to nothing).

| Route | `file:line` | Capability | Independent gate |
|---|---|---|---|
| `@Public() GET /public/proposals/:token` (HTML) + `/:token/pdf` | `public-proposals.controller.ts:5-6,10,22` | Anonymous proposal **read + PDF download** | token + `publicEnabled` |
| `@Public() GET /quotes/public/:token/view` | `quotes.controller.ts:315-317` → `findPublicView` `quotes.service.ts:867` (`where:{publicToken,publicEnabled:true}` `:877-878`) | Anonymous quote/itinerary/selling read | token + `publicEnabled` |
| `@Public() POST /quotes/public/:token/accept` | `quotes.controller.ts:327-329` → `acceptPublicQuote` `quotes.service.ts:1068` (gate `:1073-1074`) | **State change: status→ACCEPTED + acceptedVersionId + creates an INVOICE** (`ensureInvoiceForAcceptedQuote` `:1129`) | token + `publicEnabled` **AND** status===SENT (`:1097-1101`), rejects if already actioned (`:1087-1093`) |
| `@Public() POST /quotes/public/:token/request-changes` | `quotes.controller.ts:339-341` → `requestPublicQuoteChanges` `quotes.service.ts:1138` (gate `:1148-1149`) | **State change: status→PUBLIC_REVISION_REQUESTED + stores client message** (`:1176-1185`) | token + `publicEnabled` **AND** status gates (`:1161-1174`) |
| `findPublicProposalQuote` (proposal render read path) | `quotes.service.ts:843` (gate `:852-853`) | Anonymous read | token + `publicEnabled` |

**[FACT] Bottom line:** the token authorizes anonymous **read, PDF download, accept-with-invoice-creation, and request-changes**. Accept is the highest-impact: a bare token on a SENT quote triggers acceptance + invoice creation with no authenticated actor. Every route independently enforces `publicEnabled: true`; the two mutating routes additionally require status===SENT.

---

## 3. Token lifecycle & invalidation (`quotes.service.ts`)

- **[FACT] Minting:** `generatePublicQuoteToken()` = `randomBytes(24).toString('hex')` (`:640-642`); URL via `buildPublicProposalUrl` (`:644-652`).
- **[FACT] Enable** (`enablePublicLink` `:654`): if already enabled with a token → **reuses the existing token** (`:672-678`); else mints a new one + `publicEnabled:true` (`:680-691`). Endpoint `POST /:id/enable-public-link` `@Roles('admin','viewer','finance')` (`quotes.controller.ts:507-517`).
- **[FACT] Disable** (`disablePublicLink` `:699`): sets `publicEnabled:false` **AND `publicToken:null`** (`:717-720`) — the token is **destroyed**, not merely deactivated. Endpoint `:519-529`.
- **[FACT] Regenerate** (`regeneratePublicLink` `:728`): mints a fresh token + `publicEnabled:true` (`:744-749`) — old token invalidated (rotation). Endpoint `:531-541`.
- **[FACT] Re-enable after disable mints a NEW token** (the reuse branch can't fire on a nulled token). **An old/disabled token can never become valid again.** (If disable were ever changed to flip only the boolean, the same token would revive — current code nulls it, so it's safe; worth a regression guard.)
- **[FACT] No expiry** — no TTL/`expiresAt`; an enabled token is valid indefinitely until disabled/regenerated.
- **[FACT] On revise/new revision:** the cloned revision sets `publicToken:null, publicEnabled:false` (`:2092-2093`) — a revision does not inherit the parent's public link.
- **[FACT] On status/accepted-version change:** the token is **not** cleared; after accept the link stays enabled but the mutating public routes become inert (status gates reject). Read/PDF remain accessible while `publicEnabled` stays true.

---

## 4. Is `meta.publicToken` required by any internal-builder consumer?

- **[FACT] No.** The only internal reader is the ProposalStep share affordance (§1). No pricing/itinerary/readiness/booking/other builder logic reads it.
- **[FACT] The enable/disable workflow already re-fetches an authoritative token from a dedicated endpoint:** `builder-v2-client.tsx:962-985` (`postPublicLink` → `POST /api/quotes/:id/{enable,disable}-public-link`) returns `{publicEnabled, publicToken}`, and ProposalStep updates its `share` state from that response (`proposal-step.tsx:307,326`). So generic hydration does **not** need to carry the token — the copy-link works after an enable round-trip.
- **[FACT] Null/omit does not crash any consumer:** `mapMeta` coerces non-strings to `null` (`:295`); ProposalStep defaults `publicToken ?? null` (`:283`) and `linkActive = publicEnabled && !!publicToken` (`:288`) just renders the link inactive until re-enabled. No functional break.

---

## 5. Response-contract options

| Option | Security coverage | Compatibility | Verdict |
|---|---|---|---|
| `meta.publicToken = null` (redactor) | V2 hydration only; leaves Classic + agent + raw-response aliases (§8) | share re-fetches on enable | insufficient alone |
| Omit the field (adapter) | same V2-only scope | same | insufficient alone |
| Remove from adapter/type entirely | V2-only; also removes `publicEnabled` if done bluntly (loses safe state) | breaks the pre-seeded copy-link only | over-broad; still V2-only |
| Redact only for non-finance roles | leaves finance receiving a capability token needlessly; still V2-only | n/a | weak (a capability token has no finance-only justification) |
| **Redact for ALL authenticated internal roles** | correct role scope, but if done in the V2 adapter/redactor it is still **V2-only** and misses Classic/agent | n/a | correct role rule; wrong layer if client-side |

**[FACT] Key conclusion:** a capability token differs from the CP-N1b display fields — a client-side, V2-only redactor cannot durably contain it because the same token reaches internal roles through the **Classic** path and the **agent portal**, and rides the raw `GET /quotes/:id` JSON regardless (§8). The correct layer is the **backend response projection/role-gate**.

---

## 6. Recommended contract

**[REC]** Adopt the default security posture, implemented at the backend:
1. **No authenticated internal role receives a capability-bearing public token through the generic quote GET (`/quotes/:id`) used by internal hydration** — stop serializing `publicToken` in that response (project it out / gate it), for all internal roles (fail closed for unknown/missing).
2. **Preserve `publicEnabled`** (non-secret state) so the UI can still show "link active/inactive".
3. **Return the token only through the dedicated, already-authorized public-link endpoints** (`enable/disable/regenerate-public-link`, `@Roles('admin','viewer','finance')`) when an explicitly authorized workflow needs it — this path already exists (§4).
4. **No feature flag / OFF switch** — a security redaction must be unconditional.

**[DECISION REQUIRED]** Whether the **agent portal** token serialization (external-agent context, `agent.service.ts`, §8) is in scope for this track or a separate one — it is a different authorization context (external agents intentionally sharing) and a different endpoint.

---

## 7. Safest implementation boundary

| Boundary | Coverage | Risk of another endpoint bypassing it |
|---|---|---|
| Extend `redactQuoteV2CostMargin` | V2 hydration only | **High** — Classic (`ClassicQuoteWorkspace`) + agent portal read the token from the same/other backend responses, never through this redactor |
| Redact earlier in the V2 adapter | V2 only | High (same as above) |
| Remove from generic serialization / **role-gate `publicToken` in the backend `GET /quotes/:id` (`loadQuoteState` projection)** | **Covers V2 + Classic + any internal client at once**, removes it from the wire, fail-closed at source | **Low** — single choke point on the authenticated read; dedicated endpoints still mint on demand |
| Dedicated public-link view model | complements (3) — the enable/disable endpoints already are this | Low |

**[REC] Boundary = the backend `GET /quotes/:id` projection/role-gate on `publicToken`** (with the dedicated endpoints returning it on demand). This is a **backend** change — materially different from, and larger than, the CP-N1b client-side redactor. It must verify no internal consumer needs the token from the generic GET (§4 shows only the share affordance, which uses the dedicated endpoints) and that Classic's `ShareQuoteButton` also re-fetches on enable (**[UNVERIFIED]** — resolve in CP-Ta).

---

## 8. Alias / exposure sweep

**Surviving aliases if only the V2 `meta.publicToken` is redacted:**
- **[FACT] Classic workspace (internal, all roles):** `ClassicQuoteWorkspace.tsx` fetches the same `GET /quotes/:id` **client-side** (`:913`) and reads raw `quote.publicToken` (type `:606`), passing `initialPublicToken` to `ShareQuoteButton` (`:3615,:3860,:4145`); `ShareQuoteButton.tsx:25,29-39,113-114` builds `/proposal/${publicToken}`. This path never goes through the V2 redactor (`app/quotes/[id]/page.tsx:42` renders Classic directly). **The token still reaches every internal role that opens Classic.**
- **[FACT] Agent portal (external agent role):** `agent.service.ts:487` filters to `publicEnabled && publicToken`, `:494-495,:526` serialize `publicToken` + `publicUrl` (`/proposal/<token>`) + `pdfUrl`; rendered in `app/agent/quotes/[id]/page.tsx:65`, `app/agent/quotes/page.tsx:67`, `app/agent/dashboard/page.tsx:273,329`. Separate endpoint + authorization context.
- **[FACT] Backend `GET /quotes/:id` raw JSON:** carries the token regardless of client-side adapter redaction (`quotes.service.ts:12694,:13071`) — any client reading the raw response (Classic, dev tools, network tab) sees it.

**Already-safe surfaces (no alias):** ops voucher preview VM strips `publicUrl`/`proposalUrl`/`portalToken` (allowlist; `ops-voucher-preview.test.ts:94-108`); version-summary + hotel-contract drawers forbid `publicToken` (`builder-v2-version-summary-drawer.test.ts:98`, `builder-v2-hotel-contract-drawer.test.ts:84`); proposal-email audit logs booleans/recipient only, no token (`quotes.service.ts:818-837`). No toast/log/analytics string embeds the token.

**[FACT] Conclusion:** redacting only `meta.publicToken` leaves ≥3 usable aliases → confirms the backend-projection boundary (§7).

---

## 9. Implementation & regression-test plan (for a later, separately-approved slice)

- **Roles:** finance (`admin`/`super_admin`/`finance`) and non-finance (`operations`/`agent_admin`/`agent`/`viewer`) + unknown/null/missing → **all internal roles fail closed** (token absent from generic hydration).
- **Token-bearing and token-null quotes:** with `publicEnabled=true`+token and with no link — hydration must contain **no usable token and no token-bearing URL** in either case; `publicEnabled` remains accurate.
- **Consumer compatibility:** the V2 share affordance and Classic `ShareQuoteButton` copy-link still work **after an authorized enable round-trip** (dedicated endpoint returns the token); no crash on null.
- **Independent public routes unchanged:** `view/accept/request-changes/pdf` still enforce their own `publicEnabled`+status gates (no change to public-route behavior).
- **Invariance:** no pricing, totals, mutations, or unrelated payload fields change; `redactQuoteV2CostMargin`'s CP-Sb/CP-N1b behavior stays green.
- **Alias assertions:** the V2 hydration, the Classic client payload, and the generic GET response contain no `publicToken`/`/proposal/<token>`/`shareUrl` for internal roles; a source-grep test pins that the generic GET projection omits `publicToken`.
- **Disable-nulls-token guard:** regression test asserting `disablePublicLink` nulls the token (prevents a future revival regression).

---

## 10. Later staging-validation plan (separately approved; not now)

- Synthetic fixture only; **token values must never be printed, copied, retained, or documented** — record only presence/absence booleans and response-key checks.
- Assertions: internal roles' hydration (V2 + Classic) has no token/token-URL; `publicEnabled` accurate; an authorized enable round-trip returns a token and the copy-link functions; public routes still gate correctly.
- **No** public-link creation/enabling, Accept, request-changes, public navigation, or any mutation unless separately and explicitly approved. If a token-bearing fixture must be created, specify create + mandatory cleanup/restoration (mirroring the CP-N1b net-zero pattern). Production access remains prohibited.

---

## 11. Fixture availability

- **[FACT] A retained synthetic token-bearing fixture pattern exists in committed seed code:** `apps/api/prisma/seed.ts` — FIT **sent** scenario leaves a quote SENT with an enabled public link (`:3076-3079`) (ideal: SENT+`publicEnabled` satisfies read and accept/request-changes gates); FIT **accepted** (`:2865-2867`); **revision-requested** (`:3533-3551`). Lifecycle tests: `quotes-public-link.test.ts`, `agent.service.test.ts:99,146`.
- **[UNVERIFIED]** whether such a token-bearing synthetic quote is **currently present on staging** — not checked (no staging access in CP-T0). CP-Ta/validation must reverify by hard guard; do not create one now.

---

## 12. Facts vs recommendations vs unverified vs decisions

- **[FACT]** §1-§4, §8, §11 (seed) — all `file:line`-cited above.
- **[REC]** backend projection/role-gate on `publicToken` in the generic GET; preserve `publicEnabled`; dedicated-endpoint token retrieval; unconditional/no flag (§6-§7, §9).
- **[UNVERIFIED]** Classic `ShareQuoteButton` re-fetch-on-enable compatibility; current staging token-bearing fixture presence.
- **[DECISION REQUIRED]** agent-portal scope (in this track vs separate); whether the generic-GET projection is role-conditional (all internal) vs unconditional removal (also affects the authenticated finance UI's pre-seeded link, which then re-fetches on enable).

---

## 13. Blocker status

**[FACT] YES — the `meta.publicToken` exposure remains a blocker for any non-finance read/review session or pilot.** A non-finance internal user opening a quote with an enabled public link (via V2 **or** Classic) currently receives a **live capability token** granting anonymous read + PDF download + accept-with-invoice-creation + request-changes. CP-Sb/CP-N1b did **not** close it (the redactor deliberately skips it). It must be resolved before any non-finance pilot.

---

## 14. Verdict

### **CONDITIONAL GO** — to a read-only **CP-Ta prerequisite-verification** slice only (not implementation).

- **Smallest recommended next slice:** **CP-Ta** — read-only prerequisite verification that resolves: (a) the final response contract (backend projection of `publicToken` from the generic GET, `publicEnabled` preserved); (b) a complete alias sweep confirming no other internal path serializes the token or a token-URL; (c) consumer compatibility for **both** V2 ProposalStep and Classic `ShareQuoteButton` (re-fetch-on-enable); (d) fixture availability (hard-guard reverify, do not create); (e) the deployment-isolation question (this is a **backend** change → it deploys to the Railway API on merge, affecting the shared read path — decide the isolation/validation approach as CP-N1b did).
- **Outstanding prerequisite questions:** agent-portal scope ([DECISION REQUIRED]); role-conditional vs unconditional projection ([DECISION REQUIRED]); Classic re-fetch compatibility ([UNVERIFIED]); staging fixture presence ([UNVERIFIED]).
- **Proposed small-PR sequence:** CP-Ta (read-only prereq verification) → CP-Tb (backend projection + tests, separately approved, deployment-isolation decided) → staging validation (synthetic, booleans only) → validation-doc PR → non-finance pilot reassessment (a CP-N0 re-run) only after all pass.
- **In scope:** internal-hydration exposure of `meta.publicToken` (V2 + Classic + backend generic GET). **Out of scope:** the public proposal routes' own behavior; the Apply-modal `?? 0` cosmetic; session-revocation and credential hardening; agent-portal external sharing (pending the scope decision); any implementation, environment access, or public-link testing under CP-T0.

---

## Standing boundaries (reaffirmed)

ERP V2 remains build/test only; Classic remains the system of record; no staff rollout or non-finance participation; no additional pilot/session; no live records or bookings; production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept / invoice / booking / conversion / public link / voucher / packet / supplier-send / email / send; no production application or business-data access.

**Safety confirmation:** documentation-only; produced without accessing any environment, application, browser, deployment provider, database, logs, fixtures, credentials, sessions, or business data; no code/test/schema/flag/config/deploy/data change; no public-token value, token-bearing URL, credential, cookie, authorization header, connection string, supplier identity, contact identity, or PII reproduced.

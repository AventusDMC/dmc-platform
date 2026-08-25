# ERP V2 — CP-Ta: Internal Hydration Public-Token Security — Prerequisite Verification

**Documentation-only, static, read-only.** Verified against `main` (contains CP-T0 merge `38cc3437944aad2c360d547b5f8aa3609e228f79`) using committed code, tests, docs, and Git history only. **No** staging/production/Vercel/Railway/database/browser/application/fixture/log/session/env/credential/business-data access. **No** token value or token-bearing URL is reproduced.

Legend: **[FACT]** verified `file:line`; **[REC]** recommendation; **[UNVERIFIED]** not provable from the repo; **[DECISION REQUIRED]** owner decision.

**Owner-set contract for this slice:** generic authenticated quote responses must not expose `publicToken` to **any** internal role (admin, super_admin, finance, operations, agent_admin, agent, viewer, unknown, null, missing); preserve `publicEnabled`; no flag/OFF switch; tokens returned/minted only via a dedicated authorized public-link workflow. Agent-portal exposure is included in the overall closure.

---

## 1. Generic `GET /quotes/:id` serialization — the single choke point

- **[FACT]** `loadQuoteState` runs an **unprojected** `prisma.quote.findFirst({ where: { id } })` (`quotes.service.ts:12694`) and spreads the full row `{ ...quote }` into `hydratedQuote` (`:12966`) → `attachResolvedQuoteFields` → `return { ...quote, … }` (`:13010,:13071`). So `publicToken` reaches every role.
- **[FACT]** `findOne` = `return this.loadQuoteState(id, this.prisma, actor)` (`:636-638`); the detail route `@Get(':id')` returns it verbatim (`quotes.controller.ts:351-360`).
- **[FACT]** The **list** endpoint already omits it — `findAll` uses an explicit `select` that excludes `publicToken` (`quotes.service.ts:603-622`).
- **[FACT]** Other `publicToken` occurrences are **not emitters**: `where`-clause token lookups for public routes (`:843-864,:867-883,:1071-1081,:1146-1155`); a `publicToken: null` write on revision (`:2092`); and the dedicated `enable/disable/regenerate` methods (`:654-758`, the intended surface). Version-summary and hotel-contract-summary shapes already exclude it (asserted `quotes-version-summary.test.ts:62-73`, `quotes-hotel-contract-summary.test.ts:55`).
- **[FACT] Single choke point confirmed:** a projection in `loadQuoteState` (select needed fields, **omit `publicToken`, keep `publicEnabled`**) removes it from every authenticated detail response in the quotes module — used by **both** the V2 builder and the Classic workspace. It also strips it from the public-proposal read path (`findPublicProposalQuote`/`findPublicView` → `loadQuoteState`, `:864,:890`), which is **harmless** (the anonymous client already holds the token in the URL) — noted deliberately.

---

## 2. Consumers of the generic authenticated quote response

- **[FACT] V2 builder / ProposalStep:** `builder-v2/page.tsx` (server GET → redactor → client); `quote-builder-v2.tsx:550` → `proposal-step.tsx`.
- **[FACT] Classic workspace / ShareQuoteButton:** `ClassicQuoteWorkspace.tsx` client-side GET (`:913`), `initialPublicToken={quote.publicToken}` (`:606,:3615,:3860,:4145`) → `ShareQuoteButton.tsx`.
- **[FACT] Agent portal:** **separate** query — see §6.
- **[FACT] Other internal clients / export paths:** every other controller route that calls `findOne` (versions, items, options, rooming) uses it only for **gating** and returns its own sub-shape (no token). Ops voucher preview, version-summary and hotel-contract drawers already exclude the token (`ops-voucher-preview.test.ts:94-95`, `builder-v2-version-summary-drawer.test.ts:98`, `builder-v2-hotel-contract-drawer.test.ts:84`); proposal-email audit logs booleans/recipient only (`quotes.service.ts:818-837`). No other export/download emits it.

---

## 3. Field / type contract

- **[FACT]** Already nullable end-to-end: Prisma `publicToken String? @unique` (`schema.prisma:1628`), `publicEnabled Boolean @default(false)` (`:1629`); frontend `QuoteMeta.publicToken?: string | null` (`quote-types.ts:472-473`); adapter coerces to null (`quote-v2-adapter.ts:295,1419`).
- **[FACT]** Consumers use **truthiness** (`!!publicToken`, `if (!publicToken)`), not direct string ops or non-null assertions — `ShareQuoteButton.tsx:25,30,60`; `proposal-step.tsx:283,288`; `builder-v2-client.tsx:983`. Returning `null`/omitting is compatibility-safe and does not hide errors.
- **[REC]** Backend contract: **omit `publicToken` from the `loadQuoteState` projection** (keep `publicEnabled`). This is the least-disruptive form (the field is optional/nullable on the type; consumers already tolerate absence). Removing it from the shared type is unnecessary and riskier; a plain projection omission suffices.

---

## 4. V2 ProposalStep compatibility

- **[FACT]** `share` seeds from props (`proposal-step.tsx:281-284`); `linkActive = share.publicEnabled && !!share.publicToken` (`:288`). Enable/disable use `onEnablePublicLink`→`postPublicLink` returning `{publicEnabled, publicToken}` with immediate `setShare` (`builder-v2-client.tsx:962-987`; handlers `proposal-step.tsx:294-333`).
- **[FACT]** V2 **never needs the token from initial hydration.** If `publicEnabled=true` but token null, `linkActive=false` → it shows the "Enable public link" button (`:936-949`, **not** disabled-by-enabled-state), which hits the idempotent enable and self-heals with the real token. **No V2 code change strictly required** (only a cosmetic "No public link" badge for an already-enabled quote until the click).

---

## 5. Classic ShareQuoteButton compatibility — a real regression to fix

- **[FACT]** Token comes **only from initial hydration** for an already-enabled link: `useState(initialPublicEnabled ? initialPublicToken : null)` (`ShareQuoteButton.tsx:25`). It re-fetches only on explicit enable/disable/regenerate clicks (`handleLinkAction` POSTs the dedicated endpoints and reads `data.publicToken`, `:41-83`).
- **[FACT] This BREAKS if hydration returns `publicToken=null` while `publicEnabled=true`:** `shareUrl` becomes `""` (`:30-31`); the enabled block (copy/regenerate/disable) is gated on `isPublicEnabled && shareUrl` and **disappears** (`:111`); the Enable button is `disabled` because `isPublicEnabled` is true (`:108`). The user cannot copy, disable, or regenerate an already-enabled link.
- **[REC] Smallest fix (no new backend route):** on mount, when `initialPublicEnabled && !publicToken`, call the **idempotent** `enable-public-link` (which returns the current token without mutating, §10) to repopulate `publicToken` and restore `shareUrl`/copy/disable/regenerate. Alternatively, loosen the `:111` gate to `isPublicEnabled` and lazily fetch the token on first Copy. **This means CP-Tb is not backend-only — it includes this small Classic frontend adjustment.**

---

## 6. Agent-portal path

- **[FACT]** Separate authenticated surface: `agent.controller.ts:115-117` (`@Get('proposals')`, authenticated agent) → `agent.service.ts` `getProposals` runs its **own** `prisma.quote.findMany({ where: { …assigned, publicEnabled: true, publicToken: { not: null } } })` (`:474-485`) and independently emits `publicToken`, `publicUrl` (`/proposal/${token}`), `pdfUrl` (`:493-495`); `mapAgentQuoteSummary` also builds `publicUrl` from the token (`:525-526`).
- **[FACT]** **Removing `publicToken` from `loadQuoteState` does NOT close the agent portal** — it is a separate query/projection. So it survives the primary change.
- **[FACT]** The admin-web agent pages consume only **`publicUrl`** (e.g. `app/agent/quotes/[id]/page.tsx:14,65`, `app/agent/dashboard/page.tsx`), **not** the raw `publicToken` field — so the raw `publicToken` at `agent.service.ts:493` is an **unused, droppable** field.
- **[DECISION REQUIRED]** The agent portal is a **different authorization context** — an external agent whose role is to **share** the proposal link with the end client, so `publicUrl` is a *legitimate* share surface, not an accidental internal leak. Two sub-decisions:
  - **(minimum, [REC])** drop the **unused raw `publicToken`** field from the agent response (`agent.service.ts:493`) — reduces exposure with **no** frontend break (FE uses `publicUrl`). A small, bounded PR.
  - **(scope, [DECISION REQUIRED])** whether the token-bearing **`publicUrl`** itself should change — it is the agent's intended sharing mechanism; removing it would break the legitimate agent workflow, so it is likely **retained** (out of the internal-exposure scope). Confirm the product intent.
- **[REC]** Treat the agent-portal closure as a **separate small code PR** (drop the unused raw token field), sequenced after/alongside the primary CP-Tb; do **not** declare the exposure fully closed until this is landed and the `publicUrl` decision is recorded.

---

## 7. Complete alias sweep — what survives the `loadQuoteState` projection

| Surface | `file:line` | Class | Survives projection? |
|---|---|---|---|
| Generic detail (`loadQuoteState`/`findOne`/`@Get(':id')`) | `quotes.service.ts:12694,12966`; `controller:351-360` | generic GET | **No — closed by the projection** |
| `enable/disable/regenerate` responses | `controller:507/519/531`; service `:654-758` | dedicated authorized workflow | Yes (legitimate; intended) |
| Public `@Public()` view/accept/request-changes/PDF | `controller:316/328/340`; `public-proposals.controller.ts`; service `:843-1155` | anonymous public routes (token in URL) | Yes (legitimate; must keep) |
| **Agent portal** raw `publicToken` + `publicUrl` + `pdfUrl` | `agent.service.ts:493-495,525-526` | separate authenticated surface | **Yes — needs its own PR (§6)** |
| Admin-web derived `/proposal/${token}` (V2/Classic) | `proposal-step.tsx:291`, `ShareQuoteButton.tsx:35-38` | client-derived from hydration/enable response | Closed once hydration stops carrying the token + enable-on-mount fix |

- **[FACT] Conclusion:** after the `loadQuoteState` projection **and** the Classic on-mount fix, the **only surviving authenticated internal emitter of a usable token / token-URL is the agent portal** (`agent.service.ts:493`). No other admin-side alias survives. No log/audit/analytics/toast string embeds the token.

---

## 8. Safest implementation boundary

- **[REC] Primary boundary = project/omit `publicToken` in the shared quote loader `loadQuoteState`** (`quotes.service.ts:12694`), keeping `publicEnabled`. Rationale: single choke point → closes V2 + Classic + every authenticated detail consumer at once; fail-closed at source; unconditional (no role branching, no flag).
- **Must NOT affect:** public-route token **verification** (the `where: { publicToken }` lookups on `@Public` routes read the DB directly, unaffected by the response projection), token **storage/generation**, public-proposal behavior, pricing, or quote-mutation logic. The projection is a pure read-path field omission.
- A dedicated authenticated DTO/view-model is an alternative but heavier; the loader projection is smaller and equally durable. Route-specific serialization is rejected (would need touching many routes vs one loader).
- **Agent portal:** separate boundary (its own query) → separate small PR (§6).

---

## 9. Routes that legitimately need to return/mint the token

- **[FACT]** `POST /:id/enable-public-link` (`quotes.controller.ts:507-517`, `@Roles('admin','viewer','finance')`) — company-scoped actor; returns token.
- **[FACT]** `POST /:id/regenerate-public-link` (`:531-541`, same roles) — rotates.
- **[FACT]** `POST /:id/disable-public-link` (`:519-529`, same roles) — nulls token (no token returned).
- **[FACT]** No `@Get` "current link" route exists (see §10).
- **[FACT]** Public `@Public()` routes (`view/accept/request-changes/pdf`) consume the token from the URL and gate on `publicEnabled` (+status for mutations) — they legitimately require the stored token to function.
- All enable/disable/regenerate enforce company scope + the lifecycle guards in §11.

---

## 10. Dedicated retrieval — needed, or does enable-idempotency suffice?

- **[FACT] No dedicated GET-current-link route exists** (only the three POSTs in §9).
- **[FACT] `enablePublicLink` is idempotent** for an already-enabled quote: when `existing.publicEnabled && existing.publicToken`, it **returns the existing token without any DB write / regeneration** (`quotes.service.ts:672-678`); it only generates when disabled/absent (`:680-696`).
- **[REC] Enable-idempotency suffices** — no new "retrieve" route is strictly required (the Classic on-mount fix calls the idempotent enable). A dedicated `@Get(':id/public-link')` returning `{ publicEnabled, publicToken? }` would be more semantically correct (GET for a read) and is a clean **optional** addition, not a blocker. **[DECISION REQUIRED]** whether to add it.

---

## 11. Public-link lifecycle & revocation (documented only — unchanged by CP-Ta)

- **[FACT]** Mint: `randomBytes(24).toString('hex')` (`quotes.service.ts:640-642`).
- **[FACT]** Enable: reuse existing token if enabled, else mint (`:654-696`).
- **[FACT]** Disable: `publicEnabled:false` **AND `publicToken:null`** (`:717-720`) — token destroyed.
- **[FACT]** Regenerate: mints fresh (rotation) (`:744-749`).
- **[FACT]** Reuse: only via idempotent enable while already enabled; a re-enable after disable mints a NEW token → **an old/disabled token can never become valid again**.
- **[FACT]** Expiry: none (valid until disabled/regenerated).
- **[FACT]** Status changes: token not cleared; after accept the mutating public routes become inert (status gates), read/PDF remain while `publicEnabled=true`. Revision clears the link (`:2092-2093`).

---

## 12. Implementation-test matrix (for CP-Tb)

- Generic authenticated `GET /quotes/:id` returns **no `publicToken`** for every role (admin/super_admin/finance/operations/agent_admin/agent/viewer) and unknown/null/missing — new assertion (**[UNVERIFIED]** none exists today; must be added).
- `publicEnabled` remains present/accurate.
- No token-bearing alias/URL survives in the generic response (grep-style assertion).
- V2 and Classic initial hydration still render; Classic already-enabled link: after the on-mount idempotent enable, copy/disable/regenerate work.
- Authorized enable/disable/regenerate still return/rotate/clear the token from their dedicated responses.
- Agent portal (separate PR): raw `publicToken` field removed; `publicUrl` per the §6 decision; agent pages still render.
- Public `view/accept/request-changes/pdf` retain their independent `publicEnabled`(+status) gates — unchanged.
- **Regression guard:** `disablePublicLink` still nulls the token.
- No pricing, totals, status, invoice, booking, or unrelated behavior changes; CP-Sb/CP-N1b redactor tests stay green.

---

## 13. Deployment isolation (from committed config/docs — no Railway/Vercel access)

- **[FACT]** This is a **backend/API response change** (the `loadQuoteState` projection).
- **[FACT]** Both the **staging** Railway API (`dmc-platform-staging` / service `dmc-platform`) **and** the **production** Railway API (`cheerful-enthusiasm` / service `dmc-platform`, env `production`) **auto-deploy `main`** (`deployment-migration-governance.md:12-16`); the prod-API auto-deploy hardening is **documented but not applied** (`:53-57,:131-134`).
- **[FACT]** **No genuine isolated staging backend deployment is proven** — a Railway per-PR/preview backend is not established (unlike Vercel frontend previews). Merging to `main` auto-deploys the API to staging **and** actual production. CP-Tb is a **non-mutating response projection with no schema/migration**, so the migration-deploy concern does not apply — but it is still a production read-path change.
- **[REC] Recommended flow** (matches the owner's fallback): (1) CP-Tb implementation + tests in an **open, unmerged** PR; (2) a **separate explicit owner approval** acknowledging the non-mutating production read-path deployment; (3) normal merge; (4) post-merge **staging** validation; (5) validation-document PR.

---

## 14. Fixture status

- **[FACT]** Committed seed retains synthetic quotes with `publicEnabled=true` (created via idempotent `enablePublicLink`; titles/booleans only, no token reproduced): "Demo FIT Quote - Sent Portal" (`seed.ts:15`; enabled `:3065`, summary `:3078`) — **ideal** (SENT + publicEnabled satisfies read + accept/request-changes gates); "Demo FIT Quote - Accepted Booking" (`:14`; `:2841`); "Demo FIT Quote - Revision Requested" (`:17`; `:3533`). Backend unit fixtures asserting exclusion contracts: `quotes-version-summary.test.ts:62-73`, `quotes-hotel-contract-summary.test.ts:55`, `agent.service.test.ts:117-126`, `quotes-public-link.test.ts:37-68`.
- **[UNVERIFIED]** whether such a token-bearing synthetic quote is currently present on **staging** — not checked (no staging access). Reverify by hard guard at validation time; do not create one now.
- **[REC]** If a token-bearing fixture must be created later, define a create + mandatory cleanup/restoration (mirroring the CP-N1b net-zero pattern); never inspect/use the token value.

---

## 15. Later staging-validation safety plan (separately approved; not now)

- Synthetic fixture only; **token value never displayed/printed/logged/copied/retained/documented** — inspect only response **keys** and presence/absence booleans.
- Validate generic authenticated hydration for **Admin and Operations** (token absent, `publicEnabled` correct, UI renders, Classic already-enabled link recovers via enable-on-mount).
- Validate agent portal only if an authorized synthetic agent context exists.
- **No** anonymous public-page navigation; **no** Accept/request-changes/invoice/booking/version-creation/PDF-generation-or-download/email/supplier-send/voucher/packet action; public-link enable/disable or token creation requires a **separate explicit mutation approval**.
- Define fixture reconciliation + cleanup; production access prohibited.

---

## 16. Facts vs REC vs UNVERIFIED vs DECISION

- **[FACT]** §1-§2, §4-§7, §9-§11, §13-§14 — all `file:line`-cited.
- **[REC]** loadQuoteState projection (omit token, keep `publicEnabled`); Classic on-mount idempotent-enable fix; separate small agent-portal PR (drop unused raw token); open-unmerged-PR + separate-deploy-approval flow; optional GET current-link route.
- **[UNVERIFIED]** no test asserts the generic GET omits `publicToken` yet (must add); staging presence of a token-bearing fixture.
- **[DECISION REQUIRED]** agent-portal `publicUrl` scope (legitimate external-agent share vs redact); whether to add a dedicated GET current-link route; the separate production read-path deploy approval.

---

## 17. Verdict

### **CONDITIONAL GO** — to a **CP-Tb implementation-and-tests-only** PR, kept **open and unmerged**. No implementation is authorized by this instruction.

- **Precise response contract:** the authenticated `GET /quotes/:id` (and every `loadQuoteState`-derived detail response) **omits `publicToken` for all roles**, **preserves `publicEnabled`**, unconditional, no flag; tokens are obtained only via the dedicated `enable/disable/regenerate` endpoints (enable is idempotent for already-enabled links).
- **Exact implementation boundary:** a **projection in `loadQuoteState`** (`quotes.service.ts:12694`) omitting `publicToken`; plus a **small Classic `ShareQuoteButton` on-mount fix** (idempotent enable to repopulate an already-enabled link); plus tests. V2 needs no code change.
- **Is the agent portal covered by the same change?** **No** — it is a separate query (`agent.service.ts:474-495`) and requires a **separate small PR** (drop the unused raw `publicToken` field; `publicUrl` scope is [DECISION REQUIRED]). The exposure is **not** declared closed until that PR lands.
- **Fixture status:** seed-retained token-bearing synthetic quotes exist (ideal: "Demo FIT Quote - Sent Portal"); staging presence [UNVERIFIED]; a new generic-GET-omits-token test must be added.
- **Deployment-isolation conclusion:** no isolated staging backend is proven (staging + prod Railway API both auto-deploy `main`) → open-unmerged PR → separate explicit deploy approval acknowledging the non-mutating production read-path deployment → merge → staging validation → validation-doc.
- **Remaining owner decisions:** agent-portal `publicUrl` scope; optional GET current-link route; the separate production read-path deploy approval.
- **Smallest proposed PR sequence:** (1) **CP-Ta** — this report. (2) **CP-Tb** — `loadQuoteState` projection + Classic on-mount fix + tests; PR open/unmerged. (3) **CP-Tb-agent** — separate small agent-portal PR (drop unused raw token). (4) separate deploy/merge approval after clean checks + compatibility proof. (5) staging validation (synthetic, booleans only). (6) validation-document PR. (7) only after complete PASS may non-finance pilot readiness be reassessed (a CP-N0 re-run) — no pilot auto-authorized.

The `meta.publicToken` internal-hydration exposure **remains a blocker for any non-finance pilot** until CP-Tb (+ agent-portal PR) land and validate.

---

## Standing boundaries (reaffirmed)

ERP V2 remains build/test only; Classic remains the system of record; no staff rollout or non-finance participation; no additional pilot/session; no live records or bookings; production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept / invoice / booking / conversion / public link / voucher / packet / supplier-send / email / send; no environment or production application access.

**Safety confirmation:** documentation-only; produced without accessing any environment, application, browser, deployment provider, database, logs, fixtures, sessions, or business data; no code/test/schema/migration/flag/config/deploy/data change; no token value, token-bearing URL, credential, cookie, authorization header, connection string, supplier identity, contact identity, or PII reproduced.

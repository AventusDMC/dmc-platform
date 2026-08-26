# ERP V2 — CP-Tb: Internal Hydration Public-Token Security — Staging Validation Report

**Documentation-only.** This report records the outcome of the CP-Tb staging validation performed against `main` containing the CP-Tb implementation merge `ea6d9b5ab04d00a016c432feee3ae285c53a6af6` (PR #875). It creates no code, schema, flag, configuration, or runtime change. No token value or token-bearing URL is reproduced anywhere in this document.

Legend: **[PASS]** validated observation; **[FACT]** verified property; **[SCOPE]** boundary of the result; **[OPEN]** unresolved residual; **[LIMIT]** stated limitation of evidence.

**Result in one line:** **NARROW PASS** — the authenticated V2 + Classic quote hydration surface omits the `publicToken` key for both Admin and Operations while preserving `publicEnabled`, and Classic recovery performs exactly one idempotent call for an already-enabled link. The result applies **only** to that internal authenticated hydration surface; the agent-portal raw `publicToken` exposure remains **unresolved** and is a separate required track (CP-Tb-agent).

---

## 1. What CP-Tb changed (context)

- **[FACT]** CP-Tb (merge `ea6d9b5a`, PR #875) added a backend projection at the single authenticated hydration choke point `loadQuoteState` (`apps/api/src/quotes/quotes.service.ts`): the stored `publicToken` is destructured out (`const { publicToken: _omitted, ...rest } = quote`) before the row is spread into the hydrated response, so the `publicToken` key is absent from every authenticated `GET /quotes/:id` response for all roles, while `publicEnabled` is preserved. The change is immutable (no Prisma write), unconditional (no flag/role branch), and does not touch token storage, pricing, or schema.
- **[FACT]** Because the Classic `ShareQuoteButton` previously sourced an already-enabled link's token only from initial hydration, CP-Tb added a compatibility recovery: on mount, when `publicEnabled === true` and no token is hydrated, it calls the **idempotent** `enable-public-link` endpoint exactly once (ref-guarded), which returns the existing token without mutating an already-enabled link. It never auto-enables a disabled link and swallows errors (fail-closed). The V2 ProposalStep self-heals on its own enable action and needed no change.
- **[FACT]** Unit coverage merged with PR #875: backend `quotes-public-link.test.ts` (own-key-absence via `hasOwnProperty`, `publicEnabled` preserved true/false, omission unconditional across admin/super_admin/finance/operations/agent_admin/agent/viewer/unknown/missing, no alias, no mutation) and frontend `ShareQuoteButton.recovery.test.ts` (single idempotent call; zero calls for a disabled link or when a token is already held; errors return null with no retry).

This report records the **live staging** confirmation of that behavior.

---

## 2. Preflight and deployment lineage

- **[FACT]** Railway staging backend (`dmc-platform-staging`, service `dmc-platform`) served commit `ea6d9b5ab04d00a016c432feee3ae285c53a6af6` — the PR #875 merge. This was **machine-confirmed** via the Railway CLI deployment metadata (commit hash and merge-commit message).
- **[LIMIT]** The staging **frontend** deployment (`dmc-platform-admin-web-staging.vercel.app`) commit mapping to `ea6d9b5a` was **owner-confirmed / dashboard-observed**; independent verification via a Vercel API/token was **not available** in this environment. The frontend and backend both auto-deploy the same `main`, which is consistent with the confirmed mapping, but the frontend SHA itself was not machine-read.
- **[FACT]** Actual production was excluded from all steps.
- **[FACT]** Authentication was performed by the owner in the browser as the **Admin** role and (via a manual sign-out/sign-in role switch) the **Operations** role. No credentials, cookies, or authorization headers were handled, read, or recorded by the operator of this validation.

---

## 3. Validated behavior — NARROW PASS

Performed against one quote-only synthetic DRAFT fixture (see §4).

### 3.1 Authenticated generic hydration omits the token — both roles

| Assertion | Admin | Operations |
| --- | --- | --- |
| `publicToken` own-key present in `GET /quotes/:id` | **[PASS]** absent | **[PASS]** absent |
| `publicEnabled` value | **[PASS]** `true` (preserved after enable) | **[PASS]** `true` |
| token / `publicUrl` / `/proposal/` alias anywhere in the serialized body | **[PASS]** none | **[PASS]** none |
| V2-renderable payload shape (id, status, pricing fields intact) | **[PASS]** intact | **[PASS]** intact |
| any public-link POST triggered by the read | **[PASS]** none (raw GET) | **[PASS]** none (raw GET) |

The identical Operations result confirms the projection is **unconditional** for a non-finance role on the live backend, matching the merged unit coverage.

### 3.2 Classic recovery — exactly one idempotent call

- **[PASS]** A single mount of the Classic workspace for the already-enabled DRAFT quote produced **exactly one** recovery request: method `POST`, path `/api/quotes/:id/enable-public-link`, HTTP `201`. Re-reading the network log after a short wait showed the count unchanged (**no retry loop**), and the quote's token was **not** rotated (idempotent reuse — no new token minted, no DB write). No reload or remount was performed.
- **[FACT]** The recovery response-key-names and the "a token value was returned" boolean are the same contract as the enable endpoint observed at enable time (keys `publicEnabled`, `publicToken`, `publicUrl`; token-returned `true`). The recovery response **body was deliberately not read** to avoid surfacing the token value; the request/status metadata above is the recorded evidence.

### 3.3 Read-only invariant during validation

- **[PASS]** The quote remained `DRAFT` throughout. No status transition occurred.
- **[PASS]** Zero accept / request-changes / invoice / booking / version / status / export / PDF / email / supplier / voucher / packet / regenerate activity was observed in the network log for the fixture.

---

## 4. Fixture lifecycle, enabled window, and net-zero cleanup

- **[FACT]** Exactly one synthetic fixture was created: a **quote-only DRAFT** quote (synthetic id `fbb9c8b5-4012-4d70-bc56-16af59caa694`), title `UAT-STAGING-CP-TB-PUBLIC-TOKEN-DRAFT — DO NOT SEND`, under the Default Company using its documented synthetic contact. **No** item, option, itinerary, passenger, rooming, or version child was added.
- **[PASS] Baseline:** DRAFT, latest revision, zero items/options/versions/passengers, no accepted version, no invoice, no booking, `publicEnabled=false`, and the `publicToken` key already **absent** (the projection applies even before enablement).
- **[FACT] Enablement:** the public link was enabled **exactly once** on the DRAFT quote via the supported `enable-public-link` endpoint (option (b): enable-on-DRAFT — the status endpoint was **not** called and the quote was **not** transitioned to SENT). Enable returned HTTP `201`, `publicEnabled=true`, and a token (recorded only as the boolean "a token was returned = true").
- **[FACT] Enabled window:** approximately **12.2 minutes** (enable → disable), within the mandated ≤15-minute cap.
- **[PASS] Mandatory cleanup, in order:**
  1. Disable via the supported `disable-public-link` endpoint → HTTP `201`, `publicEnabled=false`, token nulled server-side (no token returned).
  2. Post-disable `GET` → `publicEnabled=false`, `publicToken` key absent, still DRAFT.
  3. Delete the quote → HTTP `200`.
  4. Post-delete `GET` → HTTP `404`; the fixture is **absent** from the quote list (the 12 pre-existing staging quotes remained untouched).
  5. Sign out → logout `200`; a protected route redirected to `/login` and `GET /api/auth/me` returned `401` (protected-route denial confirmed).
- **[PASS] True net-zero:** the temporary quote and its enabled-link/token record no longer exist; no item, version, booking, invoice, or enabled-link artifact remains; no retained fixture was modified.

---

## 5. Token non-exposure attestation

- **[FACT]** No token value or token-bearing URL was inspected, printed, copied, hashed, opened, navigated to, shared, or retained at any point. Only booleans, counts, statuses, response-key-names, and HTTP status codes were recorded. The rendered Classic share affordance (which embeds the token in a link) was not read; the recovery response body was not read; no public proposal URL was visited; and no Copy/Regenerate/Disable/Enable UI control, Accept, Request Changes, Mark as Sent, proposal preview, or download control was clicked.

---

## 6. Attempt history (accurate classification)

Three validation attempts preceded the successful cycle. The first two were blocked by **environmental / procedural** conditions, **not** by any CP-Tb functional defect. In every attempt the backend projection behaved correctly wherever it could be exercised.

1. **Attempt #1 — blocked: frontend staging-alias lineage mismatch.** The bare staging alias was serving an older deployment (a prior Instant-Rollback pin predating CP-Tb), so the frontend did not yet correspond to `ea6d9b5a`. Validation was stopped before authenticating; the owner re-assigned the alias to the CP-Tb deployment. **Not a CP-Tb functional failure.**
2. **Attempt #2 — blocked: missing retained token-bearing fixture.** The seed-derived token-bearing SENT fixture assumed by the plan was absent on staging (demo seed data had never been applied), and no fixture creation was authorized at that time. Validation was stopped before any hydration/recovery assertion; zero writes and zero public-link actions occurred. **Not a CP-Tb functional failure.**
3. **Attempt #3a — blocked: quote-only SENT transition rejected by the priced-item readiness guard.** With fixture-creation authorized, a quote-only DRAFT fixture was created, but a `SENT` transition was rejected with a workflow readiness guard ("at least one priced quote item"). A quote-only fixture cannot reach SENT; the authorized quote-only + SENT lifecycle was therefore internally infeasible. No public link was enabled. The fixture was deleted with verified **net-zero** cleanup (DELETE 200 → GET 404 → absent from list) and the operator signed out. This established that CP-Tb hydration + Classic-recovery validation is **status-independent** (it needs only `publicEnabled` + a stored token; SENT is required only for the anonymous accept/request-changes routes, which CP-Tb does not touch). **Not a CP-Tb functional failure** — a fixture-construction constraint.
4. **Attempt #3b — PASS (this report).** Re-run under option (b), enable-on-DRAFT, completed the full cycle in §3–§4.

---

## 7. Scope of the PASS and residual exposure

- **[SCOPE]** The PASS applies **only** to the internal **authenticated V2 + Classic** quote-hydration surface (`GET /quotes/:id` via `loadQuoteState`, consumed by the V2 builder and the Classic workspace). It confirms that this surface no longer emits `publicToken` to internal roles while preserving `publicEnabled`, and that Classic remains functional via a single idempotent recovery call.
- **[OPEN]** The **agent-portal** path is a **separate** authenticated surface: `agent.service.ts` runs its own `prisma.quote.findMany(...)` and independently emits the raw `publicToken` (alongside `publicUrl`/`pdfUrl`). It is **not** closed by the `loadQuoteState` projection and remains **unresolved**. Closing it (dropping the unused raw `publicToken` field while retaining the legitimate external-agent `publicUrl` share surface) is a **separate required track: CP-Tb-agent**, with its own implementation, tests, and validation.
- **[SCOPE]** Until CP-Tb-agent is completed and validated, the overall `publicToken` capability-token exposure is **narrowed but not fully closed**, and remains a blocker for any non-finance read/review pilot.

---

## 8. Authorization boundaries (unchanged)

- No non-finance pilot, staff rollout, production business use, live records, mutations, sending, or Classic retirement is authorized by this result.
- Standing boundaries preserved: ERP V2 is **build/test only**; **Classic remains the system of record**; production item mutation is **OFF**; supplier sending is **disabled**; the voucher-send allowlist is `ziad@axisdmc.com` only.
- This document is documentation-only. No environment, browser, authentication, fixture, public-link, deployment, alias, code, schema, flag, configuration, or runtime action was taken to produce it.

---

## 9. Next steps (not authorized here)

- **CP-Tb-agent** — remove the unused raw `publicToken` from the agent-portal serialization (retain `publicUrl`); add tests; validate. Required before non-finance pilot readiness is reassessed.
- Reassessment of non-finance read/review pilot readiness (a re-run of the CP-N readiness gate) once the agent-portal exposure is closed.

Each is a separate, individually-approved slice.

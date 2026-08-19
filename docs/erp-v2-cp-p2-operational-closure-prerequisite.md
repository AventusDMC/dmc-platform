# ERP V2 — CP-P2: Controlled-Pilot Operational Closure Prerequisite

**Status: documentation-only, read-only.** Turns CP-P1's five unresolved conditions into a decision-ready operational-closure plan, resolved through **static repository evidence** where possible. CP-P2 authorizes **no** pilot, participant access, role assignment, access revocation, monitoring configuration, environment change, or rehearsal involving real actions.

Labels: `[VERIFIED]` repository fact (cited); `[REC]` recommendation; `[UNVERIFIED]` operational/environment-dependent claim; `[DECISION REQUIRED]` needs Ziad's explicit decision. Conversation history is **not** used as evidence.

---

## 1. Current boundary

- **CP-P1 result: CONDITIONAL PASS** (`docs/erp-v2-cp-p1-staging-preflight-tabletop-validation-report.md`, PR #860).
- **R0 remains NO-GO.** **CP-P2 is not pilot authorization.**
- R0 remains **finance-visible-only, staging-only, synthetic-fixture, read/review-only**.
- The **Meal `unitCost` payload leak remains unresolved**; **non-finance participation remains prohibited**.
- **Scope M remains NO-GO.**

---

## 2. Evidence base & verification method

- **Prior slices:** CP-0 (PR #857), CP-a (PR #858), CP-P0 (PR #859), CP-P1 (PR #860).
- **Auth/session code:** `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/cost-visibility.ts`.
- **Audit code:** `apps/api/src/audit/audit.service.ts`, `apps/api/prisma/schema.prisma` (`AuditLog`), `apps/api/src/quotes/quotes.controller.ts:1493` (`pricing-apply-audit`).
- **Monitoring/rollback docs:** `docs/erp-v2-production-monitoring-plan-controlled-beta.md`, `docs/erp-v2-governance-decisions-2026-07-15.md`.
- **Leak trace:** `apps/api/src/quotes/quotes.service.ts:12690`, `apps/admin-web/lib/quote-v2-adapter.ts:1298`, `apps/admin-web/lib/quote-v2-cost-redaction.ts`.

Facts below are `[VERIFIED]` from these files; everything requiring a live system, a person, a configuration, or an executed action is `[UNVERIFIED]` or `[DECISION REQUIRED]`.

---

## 3. Five-condition closure matrix

| # | Condition | Current status | Existing evidence | Established statically | NOT establishable statically | Exact closure evidence | Decider/performer (role) | Closes in CP-P2? |
|---|---|---|---|---|---|---|---|---|
| 1 | Evidence-retention owner | open | CP-P0 §9 template; no storage/owner defined | the evidence *package* (§4) | who owns it; where stored; retention period | owner-approved retention policy + assigned role | Pilot Owner + Ziad | **No** — [DECISION REQUIRED] |
| 2 | Access-removal mechanism & rehearsal | open | **[VERIFIED] stateless token, no revocation store** (§5) | that immediate server-side revocation is **not implemented**; TTL 12h; no logout route | that sign-out→401 works live; that a chosen model is accepted | accepted model + a live sign-out→401 rehearsal (CP-P3) | Ziad (model) + Technical Responder (rehearsal) | **No** — [DECISION REQUIRED] + later rehearsal |
| 3 | Audit-anomaly source/substitute | partially open | **[VERIFIED]** `auditLog` writes + scoped read endpoint `:1493`; **network inspector** primary (CP-P1) | that a *scoped* pricing-apply read surface exists; that network inspector detects mutations | that a *general* read-only audit-query surface exists | approved audit source (scoped endpoint + network-primary) **or** an approved read-only auditLog query | Ziad | **Partial** — network-primary [REC]; general source [UNVERIFIED] |
| 4 | Monitoring model (automated vs supervised) | open | CP-P1: ad-hoc read-only tools available; no automated dashboards/alerts | that deploy-health/console/gate/network checks are available | that automated alerting exists; that an Observer is staffed | owner choice + (if supervised) an accepted checklist | Ziad | **No** — [DECISION REQUIRED] |
| 5 | Observer + Stop Authority assignment | open | CP-P0 role definitions | the role responsibilities (§8) | who fills them | assigned roles (no names in-repo) | Ziad | **No** — [DECISION REQUIRED] |

**None of the five fully closes in CP-P2.** Each needs an owner decision and/or a later read-only rehearsal (§10).

---

## 4. Evidence-retention operating contract (recommendation)

**[REC] Minimal R0 evidence package (per session):** approved fixture identifier; target/deployment verification (project/env/service IDs + deployed commit; production-exclusion confirmed); participant **role** confirmation (no credentials/cookies/tokens); start + end fixture state; browser-console + network observations (methods/paths/status, sanitized); incident/stop record; final outcome; explicit confirmation of no prohibited actions. (This mirrors the CP-P0 §9 template.)

**[REC] Handling recommendations (all require approval):** storage = an access-controlled internal location (not a public repo, not this documentation); minimum retention = a defined period `[DECISION REQUIRED]`; access restricted to Pilot Owner + Evidence-Retention Owner roles; naming convention `R0-<seq>`; **required redaction** of any credential/token/cookie/PII/supplier/customer data; a disposal/review rule at end of retention.

CP-P2 **creates no storage location and uploads no evidence.** The specific owner role and retention policy require **Ziad's approval** `[DECISION REQUIRED]`.

---

## 5. Access-removal mechanism (static inspection)

**[VERIFIED] The session is a stateless, HMAC-signed bearer token — there is no server-side session store or revocation list.**
- Format `v1.<base64url(payload)>.<hmac>` minted by `createSessionToken` (`apps/api/src/auth/auth.service.ts:350-363`); TTL from `DMC_AUTH_SESSION_TTL_HOURS` default **12h** (`:351`).
- `verifySessionToken` (`:278-326`) validates **only** the signature (`:285-293`) and the embedded `exp` (`:314-315`), then **builds the actor entirely from the token payload** (`toActor({ id: payload.sub, email, role, companyId })`, `:318-325`) — **no database user/session re-load**.
- **No `logout`/session-invalidation route** exists (`apps/api/src/auth/auth.controller.ts` exposes login / signup / accept-invite / invite-details / password-reset / me only).
- The `revokedAt` column at `schema.prisma:302` belongs to **`Invitation`**, not to any session model — there is **no session-revocation column**.

**Consequences [VERIFIED]:**
- **Ordinary browser sign-out clears the client `dmc_session` cookie only; the server does not invalidate the token.** Sign-out is **not** server-side revocation.
- **Immediate per-user / per-session server-side revocation of an outstanding token is not implemented.** Disabling/deleting a user does **not** invalidate an existing token before `exp` (no DB re-check).
- The only ways to invalidate an outstanding token are: (a) wait for `exp` (≤ 12h default); (b) rotate `DMC_AUTH_SESSION_SECRET` — a **global break-glass** that invalidates every session; (c) reduce TTL for future tokens.

**Evidence that removal succeeded (definition):** after sign-out, a subsequent request **without** the cookie returns **401**; and (break-glass) after secret rotation, the previously issued token fails signature verification (401). Neither is executed by CP-P2.

**[UNVERIFIED / smallest later rehearsal (CP-P3):]** verify live that browser sign-out clears the cookie and a fresh no-cookie request is 401; confirm the TTL value in the staging config (read-only); document `DMC_AUTH_SESSION_SECRET` rotation as the break-glass. **Ordinary sign-out is not treated as server-side revocation** because the implementation proves it is not.

**[DECISION REQUIRED]:** accept the stateless-token access model for R0 (short TTL + sign-out + secret-rotation break-glass, mitigated by finance-only/staging/synthetic/read-only scope), **or** require a separate code track to add server-side session revocation before R0.

---

## 6. Monitoring model (smallest sufficient for read-only R0)

**Comparison:**
- **Automated monitoring/alerting:** no dashboards/alerts proven in-repo `[UNVERIFIED]`; would need provisioning (out of CP-P2 scope).
- **Human-supervised monitoring using already-verified tools (CP-P1):** deploy health (Vercel/Railway status), browser console, feature-gate state, and the **network inspector** (which directly surfaces any mutation-method request) — all `[VERIFIED AVAILABLE]` in CP-P1.

**[REC] For read-only R0: the human-supervised model** — sufficient because R0 makes no writes and any mutation would appear as a non-GET business-route request in the network inspector. Specify:
- **Preflight checks:** target identity + production exclusion; deployed commit lineage; finance role; gate states; fixture baseline.
- **Observer responsibilities:** watch the live network log + console; confirm read-only methods; confirm no mutation/Accept/booking/invoice/send route; watch deploy health.
- **Live network/console observation:** required throughout the session.
- **Backend-health/log observation:** deploy status `[VERIFIED]`; backend log tailing `[UNVERIFIED / PARTIAL]` — capability exists read-only but is not an established monitor.
- **Audit-anomaly check:** §7.
- **Stop triggers:** CP-P0 §12 (any mutation/ambiguity/exposure).
- **Evidence capture:** the §4 package.
- **Post-session reconciliation:** confirm fixture invariance vs baseline.

**[DECISION REQUIRED]:** Ziad must explicitly approve the human-supervised substitute if automated monitoring is not provided.

---

## 7. Audit-anomaly monitoring

**[VERIFIED] Audit events exist:** `AuditService.log` writes `AuditLog` rows (`apps/api/src/audit/audit.service.ts`; model `schema.prisma` `audit_logs` with `action`/`entity`/`entityId`/`metadata`/`createdAt`). Mutation actions include `quote.item.created` / `quote.item.updated` / `quote.item.removed` and `quote.pricing.apply`.

**[VERIFIED] Read surface (scoped):** `@Get(':id/pricing-apply-audit')` (`apps/api/src/quotes/quotes.controller.ts:1493`, role-gated) returns sanitized pricing-apply audit for a quote — but it is **scoped to pricing-apply**, not all mutation actions.

**Anomaly definition during R0 (any of these = anomaly):** item creation / edit / removal / pricing apply; passenger / rooming mutation; Accept / booking / invoice / public-link / voucher / packet / supplier / email-send event; any unexpected Classic write — on the approved fixture during a read/review session.

**[REC] Primary detector = the network inspector** (`[VERIFIED AVAILABLE]`, CP-P1): any such action is a non-GET request to a business route and is caught immediately. **Confirmatory detector = the audit log** — the `pricing-apply-audit` endpoint covers pricing-apply; a **general read-only audit-query surface for all actions is `[UNVERIFIED]`** (would need a new read endpoint or an explicitly approved read-only `auditLog` query; CP-P2 queries neither staging nor production).

**[DECISION REQUIRED]:** approve the source — network-inspector-primary + the scoped pricing-apply endpoint — **or** provision an approved read-only audit-query for the fixture. The exact later prerequisite: establish/verify a read-only method to list `auditLog` rows for the fixture quote in staging without mutation (CP-P3).

---

## 8. Operational role definitions (no people assigned)

| Role | Responsibilities |
|---|---|
| **Pilot Owner** | owns the session; approves scope/fixtures; authorizes resumption |
| **Participant** | finance-visible reviewer; performs only R0 read/review |
| **Observer** | live network/console/health watch; flags anomalies |
| **Stop Authority** | may halt the session immediately on any stop trigger |
| **Evidence-Retention Owner** | preserves + retains the sanitized evidence package |
| **Technical Responder** | performs approved technical checks (e.g. the CP-P3 sign-out→401 verification) |

- **May combine [REC]:** Pilot Owner + Stop Authority; Observer + Technical Responder.
- **Should remain separate [REC]:** Participant vs Stop Authority (independent halt); Participant vs Evidence-Retention Owner (independent record).
- **Who can stop:** Stop Authority or Pilot Owner. **Who authorizes resumption:** Pilot Owner (after a P0/P1, with Ziad). **Who preserves evidence:** Evidence-Retention Owner. **Who verifies final fixture invariance:** Observer + Participant.

No role is assigned to Ziad or any staff member without a separate explicit decision.

---

## 9. Owner decision sheet

| # | Decision | Recommended `[REC]` | Alternative | Trade-off | Closure evidence | Rehearsal still required? |
|---|---|---|---|---|---|---|
| 1 | Evidence-retention owner + policy | assign Evidence-Retention Owner role; access-controlled store; defined retention + redaction | ad-hoc per-session capture | governance vs speed | approved policy + assigned role | No (policy) |
| 2 | Access-removal mechanism to rehearse | accept stateless model (sign-out + short TTL + secret-rotation break-glass) | build server-side revocation (code track) | limited immediate revocation vs added scope | CP-P3 sign-out→401 + TTL confirmed | **Yes** (CP-P3) |
| 3 | Audit-anomaly source/substitute | network-inspector-primary + scoped pricing-apply endpoint | provision general read-only auditLog query | simplicity vs completeness | approved source | Partial (verify in CP-P3) |
| 4 | Automated vs human-supervised monitoring | human-supervised for read-only R0 | provision automated alerting | effort vs assurance | approved model + checklist | Verify in CP-P3 |
| 5 | Observer + Stop Authority assignment | assign both roles (no names here) | single combined supervisor | independence vs headcount | assigned roles | No |

**Approval of CP-P2 does not imply approval of any row above.** Each is a separate `[DECISION REQUIRED]`.

---

## 10. Next-slice decision

**Verdict: `CONDITIONAL GO` — to one narrowly scoped, separately approved operational-rehearsal slice (`CP-P3`) only.**

Rationale: the remaining conditions **can be safely verified through a read-only, finance-only, synthetic, non-mutating rehearsal** — sign-out→401 behaviour, the audit read surface, the human-supervised monitoring observation, and evidence capture — **with one documented caveat:** immediate server-side session revocation is **not implemented** (§5). This is **not** a blocker to a *safe read-only* rehearsal (R0's blast radius is finance-role + staging + synthetic + read-only), but the owner must **explicitly accept** the stateless-token access model (Decision 2) or escalate to a code track. No unresolved *security* condition prevents a safe read-only rehearsal.

**[REC] `CP-P3` — Staging Operational Closure Rehearsal** — staging-only; finance-visible; synthetic-fixture only; non-production; **no business mutation**; no staff pilot; no Accept/invoice/booking/public-link/voucher/packet/supplier/email/send; limited to explicitly approved verification of: (a) sign-out→401 + TTL, (b) the audit-inspection method, (c) the human-supervised monitoring model, (d) evidence-retention capture. **CP-P3 is not started by this document.**

---

## 11. Standing restrictions (reaffirmed)

ERP V2 build/test only; **Classic remains the system of record**; no staff rollout; no live bookings or real records; no production access; production item mutation **OFF**; supplier sending **disabled**; voucher-send allowlist **`ziad@axisdmc.com`** only; no Accept / invoice / booking / conversion / public link / voucher / packet / supplier-send / email / send; **no non-finance R0 participation while the Meal `unitCost` leak remains unresolved**.

**Safety confirmation:** documentation-only, read-only; no code/schema/migration/test/flag/environment/configuration/deployment/role/permission/session/data change; no sign-out or access revocation executed; no staff invited/nominated; no pilot/rehearsal/business mutation; no staging/production/Vercel/Railway/DB/deployed-app/monitoring/comms access; no credentials, tokens, cookies, connection strings, or PII recorded.

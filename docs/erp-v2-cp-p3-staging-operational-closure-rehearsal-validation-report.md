# ERP V2 — CP-P3: Staging Operational Closure Rehearsal — Validation Report

**Status: CONDITIONAL PASS.** Documentation-only record of the completed CP-P3 narrow, non-mutating staging operational-closure rehearsal (owner's authenticated staging session + tabletop-only incident scenarios). This report records evidence already captured during CP-P3; **no environment was re-accessed to produce it**.

CP-P3 is **not** an unconditional PASS, **not** pilot authorization, **not** rollout authorization, and **not** proof of production readiness. **R0 remains NO-GO** pending a separate explicit owner decision.

**Result:** all **safety-critical** CP-P3 controls passed, with two **non-critical evidence-method limitations**: (a) no general read-only audit-query surface was available; (b) backend live-log monitoring was not established or exercised. The owner-approved **network-monitoring + before/after fixture-reconciliation substitute worked and detected no business mutation.**

---

## 1. Scope & authorization boundary

- **Staging only; finance-visible role only; synthetic fixture only; read/review + operational verification only.**
- **No** business mutation; **no** temporary item; **no** production access; **no** staff pilot.
- **R0 remained and remains NO-GO** pending a separate explicit owner decision. This report authorizes documentation only.

---

## 2. Target & production-exclusion evidence

**Verified staging targets:**
- Vercel team **`aventus-dmc-portal`**
- Frontend project **`dmc-platform-admin-web-staging`**, ID **`prj_16zwSKd2ckY5J15LkfArl8wnrmek`**
- Staging alias **`dmc-platform-admin-web-staging.vercel.app`** (on a Ready `git-main` deployment)
- Railway project **`dmc-platform-staging`**, ID **`26e31130-a684-448a-bb96-f0da7a0a60c9`**
- Railway service **`dmc-platform`**, ID **`acf269c3-05b7-4848-a992-f8b1a2a92e44`**

**Actual production excluded (not queried or opened):**
- Vercel `dmc-platform-admin-web` / `dmc-platform-admin-web.vercel.app`
- Railway project prefix `60d81051` / project `cheerful-enthusiasm`

The Railway environment label `production` exists **inside the staging project** and did **not** change the staging classification, because the staging **project ID matched** (`26e31130…`).

---

## 3. Deployment & lineage evidence

- **Backend:** deployed literal commit **`1c057fbd…`** (PR #861 merge = current `main`), deployment **SUCCESS**.
- **Frontend:** `git-main` deployment **Ready** (tracks `main`).
- The **literal frontend SHA was not machine-read**; frontend confirmation is **deployment-lineage and behavioral evidence only** (E-a #853 / E-b #855 are ancestors of deployed `main`; the E-b "Edit commercial terms" affordance was **observed but not invoked**).
- Behavioral confirmation is **not** presented as literal commit metadata.

---

## 4. Gate evidence (no gate changed)

- Backend **`QUOTE_EXTERNAL_PACKAGE_EDIT = true`**; backend **`QUOTE_ITEM_CREATE = true`**.
- Frontend external-package-edit gate is **behaviorally ON** (the gate-conditional affordance renders on the deployed build).
- The frontend **environment-variable read was not machine-verifiable** this session because the Vercel API token response was **forbidden/invalid**; the behavioral signal was used instead.
- **No gate was changed; no production gate was inspected.** No secret value is included.

---

## 5. Authentication & role

- **Ziad authenticated manually** through the normal staging login.
- The validator **entered no credentials** and **minted, inspected, copied, decoded, printed, retained, or reused no token or cookie**.
- Visible role **`admin`** — finance-authorized (`apps/api/src/auth/cost-visibility.ts:20`).
- `POST /api/auth/login` and **Sign out** were **authentication/session actions**, explicitly **not** business mutations.

---

## 6. Owner decisions & role assignments (dated 2026-08-19)

- **Evidence-Retention Owner: Ziad.**
- **Minimum retention: 90 days** (restricted storage; the validation document is the durable sanitized evidence — no raw cookies/tokens/HAR/credentials/sensitive screenshots).
- **Access model accepted only for CP-P3 and a possible one-person, finance-only, staging, synthetic, read-only R0.**
- **Audit substitute:** network monitoring + before/after fixture reconciliation + any authorized read-only audit evidence.
- **Monitoring model: human-supervised.**
- **Observer: Ziad. Stop Authority: Ziad.**

Stated clearly:
- Ziad **intentionally combines Observer and Stop Authority**.
- This **reduces independent oversight**.
- The combination is **accepted only for this one-person scope**.
- **Adding any participant requires a separate Observer decision.**
- **These decisions do not authorize R0.**

---

## 7. Fixture evidence

- Quote **`fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`** — "UAT-STAGING-M3A-EXTERNAL-PACKAGE-CREATE — DO NOT SEND"
- Retained item **`4beecd88-569f-43d7-8854-79c2be60c9ef`**
- **DRAFT; one item; total cost 200; total sell 240; no accepted version; no booking or invoice; no public link.**
- **Final state identical to baseline; no restore action was needed** (net-zero — nothing changed).

---

## 8. Monitoring evidence

**Available:** frontend deployment health; backend deployment health; browser console (read-only; no errors); browser network activity (methods/paths/status); gate-state observation; before/after fixture reconciliation.

**Unavailable / partial:** backend **live-log monitoring was not established/exercised**; **no general read-only audit-query surface was available**.

The **owner-approved network + reconciliation substitute worked** and detected no unexpected mutation or audit event.

---

## 9. Navigation & network evidence

**Exact read-only navigation:** opened the approved fixture; reviewed the **Experiences** step; reviewed itinerary, totals, cost/margin (finance role), the retained External Package row, and item count = 1. **No mutation or prohibited control was invoked** (presence observed only).

**Observed requests:**
| Method | Route | Classification |
|---|---|---|
| POST | `/api/auth/login` | authentication |
| GET | `/api/quotes/:id/version-readiness` | read |
| GET | `/api/quotes/:id/versions` | read |
| GET | `/quotes/:id/builder-v2` (RSC) | read |

**Zero business-mutation requests** (Performance-API path scan: zero mutation-route suspects). Two `?_rsc=` prefetch entries aborted benignly.

---

## 10. Prohibited actions not taken

Explicitly confirmed **no**: Add / edit / remove / apply / mutation preview; passenger or rooming change; Accept or version creation; booking or conversion; invoice; public link; proposal preview/download; voucher or packet; supplier action; email/send; Classic write; database access; production access; secret rotation.

---

## 11. Sign-out rehearsal

- The **normal Sign out control was used**.
- Revisiting the protected builder URL **redirected to `/login?reason=session-expired&next=…`**; the **builder did not render**.
- **Browser-session removal was verified.** The validator **did not sign back in**.

Stated precisely:
- This **proves browser-session removal**.
- It **does not prove server-side token revocation**.
- The session is a **stateless HMAC token**.
- Default TTL is **12 hours**, confirmed from committed code (`apps/api/src/auth/auth.service.ts:351`).
- **No per-session server-side revocation store exists** (`verifySessionToken` trusts the token payload with no DB re-load; no logout/revocation route).
- Outstanding tokens invalidate **only** through TTL expiry or **global secret rotation**.
- **Secret rotation was reviewed only as a break-glass procedure and was not executed.**

---

## 12. Five-condition closure status (this scope only)

1. **Evidence retention** — **closed for this scope by owner decision** (Ziad; minimum 90 days; validation document as durable sanitized evidence).
2. **Access removal** — **rehearsed and accepted with limitation** (browser sign-out denial verified; **no true server-side revocation**).
3. **Audit-anomaly detection** — **closed for this scope** through the owner-approved network/reconciliation substitute; **general audit-query access remains unavailable**.
4. **Monitoring** — **closed for this scope** through the approved human-supervised model; **backend live-log monitoring remains a limitation**.
5. **Observer and Stop Authority** — **closed for this one-person scope** through Ziad's combined assignment; **reduced independence recorded**.

**These closures do not generalize** to production, multi-user use, non-finance participation, Scope M, live records, or mutation workflows.

---

## 13. Unresolved technical & scope limitations

- **Server-side token revocation is not implemented.** A separate code/readiness track is required before broader or higher-risk use **if immediate revocation is required**.
- **Meal `unitCost` browser-payload leak remains unresolved.** **Finance-only participation remains mandatory**; **non-finance R0 remains prohibited** until server-side redaction, regression testing, staging validation, and validation documentation are complete.
- **Backend live-log monitoring remains unestablished.**
- **General audit-query access remains unavailable.**

---

## 14. Final boundary & next decision

- **CP-P3 is complete with a CONDITIONAL PASS.**
- The operational prerequisites are sufficient **only for considering** a **one-person, finance-only, staging, synthetic, read-only R0**.
- **R0 is not authorized by this report.**
- Any R0 session requires a **new explicit owner approval** specifying its exact fixture, date/window, participant, permitted actions, stop conditions, and evidence requirements.
- **No staff rollout, Scope M, non-finance use, production, live records, mutation, public exposure, or sending is authorized.**

This report does not begin an R0 plan, session, or another slice.

---

## 15. Standing boundaries (reaffirmed)

ERP V2 remains build/test only; **Classic remains the system of record**; production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept / invoice / booking / conversion / public link / voucher / packet / supplier-send / email / send; no production access; no live bookings or real records; no non-finance participation; no Scope M.

**Safety confirmation:** documentation-only; produced without re-accessing staging, production, Vercel, Railway, the deployed application, browser sessions, databases, logs, monitoring, or authentication/access administration; no sign-in performed for this document; no code/test/schema/migration/flag/environment/deployment/configuration/role/permission/session/data change; no secrets, credentials, tokens, cookies, authorization headers, connection strings, or PII recorded.

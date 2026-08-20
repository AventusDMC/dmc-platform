# ERP V2 — R0: Owner-Only Staging Read/Review Session — Validation Report

**Status: PASS — narrowly scoped.** Documentation-only record of the single owner-only staging read/review session executed on 2026-08-19. This report records evidence already captured during R0; **no environment was re-accessed to produce it**.

**The PASS applies only to the single owner-only R0 session executed on 2026-08-19.** It is **not** staff-rollout approval; **not** authorization for another session; **not** production-readiness proof; **not** approval for Scope M, non-finance participation, real records, mutations, public exposure, sending, or Classic retirement.

---

## 1. Executive result & boundary

- **One owner-only session completed successfully.**
- **Staging only; synthetic fixture only; finance-authorized participant only; read/review only.**
- **Maximum authorized duration 30 minutes; actual duration ≈ 5 minutes 34 seconds.**
- **No business mutation** occurred.
- The **fixture remained invariant** (identical baseline → final).
- **Sign-out denied protected access.**

---

## 2. Session authorization

- **Date:** 2026-08-19, Asia/Amman.
- **Participant:** Ziad. **Observer:** Ziad. **Stop Authority:** Ziad. **Evidence-Retention Owner:** Ziad.
- **Retention period:** minimum 90 days.
- **Combined roles were explicitly approved for this one-person scope**; **reduced independent oversight was accepted**; **any additional participant requires a separate Observer decision and new authorization.**

**Timing (UTC, as captured):**
- **Start:** 16:48:06 UTC (timer began when the authenticated fixture opened).
- **End:** ≈ 16:53:40 UTC (at sign-out).
- **Duration:** ≈ 5 minutes 34 seconds. The **30-minute cap was not approached** (cap 17:18 UTC).

---

## 3. Staging targeting & production exclusion

**Verified staging targets:**
- Staging host **`dmc-platform-admin-web-staging.vercel.app`**
- Vercel team **`aventus-dmc-portal`**
- Staging project **`dmc-platform-admin-web-staging`**, ID **`prj_16zwSKd2ckY5J15LkfArl8wnrmek`**
- Railway staging project **`dmc-platform-staging`**, ID **`26e31130-a684-448a-bb96-f0da7a0a60c9`**, service ID **`acf269c3-05b7-4848-a992-f8b1a2a92e44`**

**Actual production excluded (not queried or opened):**
- Vercel `dmc-platform-admin-web` / `dmc-platform-admin-web.vercel.app`
- Railway prefix `60d81051…` / `cheerful-enthusiasm`

---

## 4. Deployment & gate evidence

- Backend deployment was **healthy** through successful fixture reads (GET → 200).
- Recent **CP-P3 machine evidence** showed the staging deployment **SUCCESS at commit `1c057fbd…`**.
- Frontend staging deployment **served successfully** (app loaded, no post-auth console errors).
- The **literal frontend SHA was not machine-read**; frontend evidence remained **deployment-lineage / behavioral**.
- Existing **backend gates had been verified ON during CP-P3**; **no gate was changed; no production gate was inspected.**

**Disclosed accurately:** the **Vercel/Railway API tokens were unauthorized during R0**, so infrastructure re-verification relied on the **recent CP-P3 machine evidence plus current behavioral confirmation** (healthy reads, deployed guarded build). This is **not** presented as fresh literal infrastructure metadata verification.

---

## 5. Authentication & role

- Ziad authenticated **manually**.
- **Two mistyped-password attempts returned `401`**; the **third login attempt succeeded with `200`**.
- Visible role **`admin`** — finance-authorized (`apps/api/src/auth/cost-visibility.ts:20`).
- The validator **entered no credentials** and did **not** mint, inspect, decode, copy, print, retain, or reuse a token or cookie; **no authorization headers were read**.
- **Login and sign-out were authentication actions, not business mutations.**
- The two failed login attempts were **benign authentication failures** (wrong password), **not authorization bypasses or business-action failures**.

---

## 6. Fixture baseline

- Quote **`fbd0fde8-66ef-4c8d-9e8d-8c2d97cc1e01`** — "UAT-STAGING-M3A-EXTERNAL-PACKAGE-CREATE — DO NOT SEND"
- Retained item **`4beecd88-569f-43d7-8854-79c2be60c9ef`**
- **DRAFT; one item; total cost 200; total sell 240; per-person selling value 120; margin 40 / 20%.**
- No accepted version; no saved quote version; no booking; no invoice; no public link; no warning.

---

## 7. Participant actions

Ziad **personally**: signed in manually; opened the approved fixture; reviewed the V2 itinerary and day structure; reviewed the retained Experience item; reviewed selling totals; reviewed cost and margin; returned toward the summary; signed out.

**The validator guided and observed (read-only) but did not perform the participant review on Ziad's behalf.**

---

## 8. Monitoring evidence

**Available:** browser console; browser network classification; frontend/backend behavioral health; recent CP-P3 deployment evidence; before/after fixture reconciliation.

**Approved substitute:** network monitoring + fixture reconciliation.

**Continuing limitations:** no general read-only audit-query surface; backend live-log monitoring not established; no server-side per-session token revocation.

---

## 9. Network evidence

- `POST /api/auth/login` **three times**: **two `401`** (mistyped passwords) + **one `200`** (successful authentication).
- Normal **sign-out** authentication/session action.
- **All business-data requests were GET/read** operations (page/RSC, `version-readiness`, `versions`, a benign `/quotes` list prefetch, static assets).
- **Two aborted Next.js RSC prefetch requests were benign.**
- **Zero business-mutation requests.**

Explicitly, **no** item, pricing, passenger, rooming, hotel, transport, Accept/version-create, booking, invoice, public-link, voucher, packet, supplier, email/send, or Classic-write request occurred.

---

## 10. Console & deviation evidence

- **Two login `401` console errors** corresponded to the mistyped passwords.
- **No post-authentication application error** occurred.
- The observable browser pane **initially remained on the login page** when the fixture was first reported as open.
- **This mismatch was detected before any application action**; the session **paused** until Ziad authenticated in the observable pane.
- **No prohibited action or fixture exposure occurred** during that mismatch.

---

## 11. Participant feedback

Ziad's responses (recorded as given):
1. Itinerary easy to understand: **yes**
2. Totals, cost, and margin clear: **yes**
3. Important information missing or confusing: **no**
4. Hesitation about relying on V2 for this restricted review: **no**
5. Confidence rating: **5 / 5**

**This feedback applies only to the restricted owner-only read/review scope and does not approve a broader phase.**

---

## 12. Final reconciliation

The fixture remained **identical**: DRAFT; one retained item; retained item unchanged; cost 200; sell 240; **no new version; no accepted version; no booking; no invoice; no public link; no business side effect.** **No restore action was needed** (zero business-mutation requests ⇒ no create/remove/edit could have occurred).

---

## 13. Sign-out evidence

- Normal **Sign out** control used.
- Revisiting the protected builder URL **redirected to `/login?reason=session-expired&next=…`**; the **builder did not render**.
- **Browser-session removal verified.** **No sign-back-in occurred.**

Stated precisely: **sign-out proves browser-session removal only.** The **stateless 12-hour token has no per-session server-side revocation** (`apps/api/src/auth/auth.service.ts:278-363`). **No secret rotation occurred.**

---

## 14. Prohibited actions — absent

Confirmed **no**: Add / edit / remove / apply / mutation preview; passenger or rooming change; hotel or transport mutation; Accept or Mark as Sent; version creation; booking or conversion; invoice; public link; proposal preview/download; voucher or packet; supplier action; email/send; Classic access/write; temporary item; other quote opened/mutated; negative or tampered request; direct database access; production access; code/configuration/access/data change.

---

## 15. Remaining limitations

- **Server-side session revocation is not implemented.**
- **Meal `unitCost` browser-payload leak remains unresolved.**
- **Finance-only participation remains mandatory; non-finance R0 remains prohibited.**
- **Backend live-log monitoring remains unestablished.**
- **General audit-query access remains unavailable.**
- **Infrastructure API tokens were unauthorized during the R0 session**; recent CP-P3 machine evidence plus R0 behavioral confirmation was used.

None of these issues is fixed by this session.

---

## 16. Final authorization boundary

- **This R0 PASS authorizes no additional R0 session.**
- It authorizes **no R1**.
- It authorizes **no Scope M**.
- It authorizes **no other participant**.
- It authorizes **no staff rollout**.
- It authorizes **no production or live records**.
- It authorizes **no mutation or sending**.
- **Every future session requires a new explicit owner approval** defining fixture, date/window, participant, permitted actions, stop conditions, and evidence.
- **No automatic next phase follows from this PASS.**

---

## 17. Standing restrictions (reaffirmed)

ERP V2 remains build/test only; **Classic remains the system of record**; production item mutation remains **OFF**; supplier sending remains **disabled**; voucher-send allowlist remains **`ziad@axisdmc.com`** only; no Accept / invoice / booking / conversion / public link / voucher / packet / supplier-send / email / send; no production access; no real/live records; no non-finance participation; no Scope M.

**Safety confirmation:** documentation-only; produced without re-accessing staging, production, Vercel, Railway, the deployed frontend, browser sessions, authentication, databases, logs, or monitoring; no sign-in performed for this document; no code/test/schema/migration/flag/environment/deployment/configuration/role/permission/session/data change; no credentials, passwords, tokens, cookies, authorization headers, connection strings, raw secrets, or PII recorded.

# ERP V2 — CP-Tb / CP-Tb-agent: Public-Token Hydration Security — Closeout & Agent-Portal Live Validation

**Documentation-only.** This closeout records the final outcome of the CP-Tb public-token hydration-security track, including the agent-portal live validation performed on staging. It changes no source code, tests, configuration, flags, schema, or environment. **No** password, email address, cookie, authorization header, raw token, token value, `publicUrl`, `pdfUrl`, or token-bearing URL is printed, copied, or retained anywhere in this document.

Legend: **[PASS]** validated observation · **[FACT]** verified property · **[SCOPE]** boundary of the result · **[RESIDUE]** unavoidable, non-deletable artifact.

**Result:** **PASS.** All known authenticated hydration surfaces within the documented CP-Tb scope — the internal V2 builder, the Classic workspace, and the agent portal — omit the capability-bearing raw `publicToken` while preserving the intended enable/share affordances. This is confirmed both by merged unit tests and by live staging validation.

---

## 1. Scope and final result

- **[SCOPE]** CP-Tb closed the exposure of the capability-bearing `meta.publicToken` in **authenticated** quote hydration. The token grants anonymous read / PDF / accept-with-invoice / request-changes via the dedicated public routes, so it must never be serialized to internal roles that do not need it. The remediation is a backend projection at the single hydration choke point (`loadQuoteState`) plus a Classic on-mount recovery, and a separate agent-portal projection.
- **[SCOPE]** This closeout asserts closure **only** for the surfaces enumerated here (internal V2 + Classic hydration and the agent portal). It is **not** an exhaustive whole-platform security proof beyond that scope.
- **Final:** **PASS** for both the internal hydration surface (previously recorded) and the agent-portal surface (live-validated here).

---

## 2. Lineage (merged commits)

| Slice | PR | Merge commit |
| --- | --- | --- |
| CP-Tb — authenticated V2 + Classic hydration projection | #875 | `ea6d9b5ab04d00a016c432feee3ae285c53a6af6` |
| CP-Tb-agent — remove raw `publicToken` from agent-portal response | #877 | `ec5371d1f818812fb800a2d8a4c5fe7dfaed0c73` |
| Invitation-revoke DELETE proxy (support fix) | #878 | `61836d0989887e67a727fc99616bf875c9be677d` |
| Server-gated staging direct-create surface (default-off) | #879 | `339a2b83d1008219966bacc373aac2416bd80e27` |

This document is authored against `main` at `339a2b83d1008219966bacc373aac2416bd80e27` (which contains all four merges above).

---

## 3. Staging targeting and production exclusion

- **[FACT]** Railway staging only: project `dmc-platform-staging` (`26e31130-a684-448a-bb96-f0da7a0a60c9`), service `dmc-platform` (`acf269c3-05b7-4848-a992-f8b1a2a92e44`). The staging API deployment was SUCCESS on commit `339a2b83…`, which **contains** the CP-Tb-agent merge `ec5371d1…` (verified as an ancestor).
- **[FACT]** Frontend limited to `dmc-platform-admin-web-staging.vercel.app`.
- **[FACT]** Production project `cheerful-enthusiasm` and all non-staging Vercel projects were excluded — not opened, authenticated to, deployed, or inspected. Deployment facts were read from GitHub/Vercel/Railway metadata only.

---

## 4. Internal V2 + Classic validation (previously recorded)

- **[FACT]** Recorded in the CP-Tb validation report (`docs/erp-v2-cp-tb-public-token-hydration-security-validation-report.md`, merged via PR #876). Summary: authenticated generic hydration (`GET /quotes/:id`) omits the `publicToken` key for both a finance role (Admin) and a non-finance role (Operations) while preserving `publicEnabled`; the Classic workspace performs exactly one idempotent `enable-public-link` recovery call for an already-enabled link. That validation was a narrow **PASS**; token values were never read.

---

## 5. Agent-portal live validation (this closeout)

A temporary synthetic Agent (Default Company) queried `GET /api/agent/proposals` against the staging deployment carrying the CP-Tb-agent projection. Results were captured through a safe in-memory projection that emitted only booleans, counts, key names, IDs, and sanitized titles.

- **[PASS]** HTTP `200`; **exactly three** proposals returned:
  - two immutable synthetic baseline quotes (see §7), plus
  - one temporary synthetic fixture (a quote-only DRAFT with its public link enabled).
  - Proposal-count delta from the two-quote baseline = **+1**; no unexpected fourth proposal.
- **[PASS]** **Recursive raw `publicToken` key count = 0** across the entire response.
- **[PASS]** **No replacement raw-token alias** observed — a recursive key-name scan for token/secret/api-key/bearer/credential/capability-style keys found none (other than the intended URL fields).
- **[PASS]** `publicUrl` and `pdfUrl` were **present and non-empty** for all three proposals — recorded **only** as booleans; their values were never read, printed, or retained.
- **[PASS]** Safe response keys per proposal were exactly: `[id, pdfUrl, publicUrl, quoteNumber, status, title, updatedAt]` — note the absence of `publicToken`.
- **[PASS]** The Agent dashboard UI rendered **without crashing** (proposals section present, no error overlay). No proposal, PDF, or public link was opened, clicked, copied, or navigated; token-bearing `href` attributes were never read.

Conclusion: the agent portal serializes the intended token-bearing `publicUrl` (and derived `pdfUrl`) capability surfaces while the raw `publicToken` key is absent — the CP-Tb-agent projection behaves as designed in the deployed code.

---

## 6. Authorized validation writes and network classification

- **[FACT]** Network activity was read-only `GET`s plus normal login/logout, and exactly the authorized mutations: one temporary Agent creation, one temporary quote creation, one public-link enable, one disable, one temporary quote deletion, one temporary user deletion, and two unauthenticated empty-body (`{}`) feature-gate probes (one on-state, one off-state).
- **[FACT]** No Accept, Request Changes, booking, invoice, voucher, packet, supplier, email, or invitation action occurred. No baseline quote was modified. No production or database access occurred.

---

## 7. Net-zero cleanup and baseline reconciliation

- **[PASS]** Temporary public link **disabled** (verified `publicEnabled=false`, token nulled).
- **[PASS]** Temporary quote **deleted** and verified absent (`GET` → `404`, absent from list).
- **[PASS]** Temporary Agent user **deleted** and verified absent (absent from user list; Default-Company Agent count returned to `0`; total users returned to their pre-cycle count; zero pending Agent invitations).
- **[PASS]** The two immutable baseline quotes were **reconciled unchanged**:
  - `55555555-5555-5555-5555-555555550010` — `READY`, `agentId=null`, `publicEnabled=true`, bookings `0`, invoices `0`.
  - `1d0355c0-3d87-4acd-91b1-b4996d728e9f` — `ACCEPTED`, `agentId=null`, `publicEnabled=true`, bookings `1`, invoices `1`.
- Deleted temporary-resource IDs are intentionally omitted (they add no verification value post-deletion); the net-zero end state above is the verifiable record.

---

## 8. Feature lifecycle — `ENABLE_STAGING_DIRECT_AGENT_CREATE`

- **[FACT]** The server-only flag `ENABLE_STAGING_DIRECT_AGENT_CREATE` was enabled **temporarily** and **only** on the Production environment of the `dmc-platform-admin-web-staging` Vercel project, to expose the direct Agent-create form for one provisioning cycle.
- **[FACT]** On-state gate check: one unauthenticated `{}` POST to `/api/users/direct-agent` returned a **`400`** validation failure (flag-on path), not the flag-off `404`, with no backend call.
- **[FACT]** The flag was **removed** afterward and a **fresh flag-off deployment** of `339a2b83…` became Ready/Current on the bare staging alias (no Instant Rollback; alias advanced automatically).
- **[FACT]** Off-state gate check: the final unauthenticated `{}` POST to `/api/users/direct-agent` returned an **empty `404`** (the route's server-side flag-off short-circuit), with no backend call or mutation.
- **[FACT]** The direct-create form was **absent** from the Users page after deactivation.
- **[FACT]** The direct-create **route code remains deployed** but is **server-gated and dormant** (off by default). The code was **not** removed by this cycle, and this document does not claim otherwise.

---

## 9. Final sign-out

- **[PASS]** After cleanup and deactivation, the session was signed out; a protected route (`/users`) redirected to `/login`, and the browser was left signed out.

---

## 10. Residue disclosure

- **[RESIDUE]** Net-zero applies to **live** temporary resources and the enabled feature — all restored. The following are unavoidable and are disclosed, not claimed removed:
  - Sanitized audit-history rows for the temporary lifecycle (user created/deleted, quote created/deleted, public-link enabled/disabled).
  - Vercel configuration and deployment history for the temporary flag-on and flag-off redeployments of `339a2b83…`.

---

## 11. Confidentiality confirmation

- **[FACT]** No password, email address, cookie, authorization header, raw token, token value, `publicUrl`, `pdfUrl`, or token-bearing URL was printed, copied, exposed, or retained at any point. Only booleans, counts, response-key names, HTTP status codes, sanitized UAT titles, merge commit SHAs, and the two immutable synthetic baseline quote IDs were recorded. The owner-controlled Agent credentials were entered privately by the owner and never observed.

---

## 12. Conclusion (narrow)

Within the documented CP-Tb scope, **all known authenticated public-token hydration surfaces — internal V2, Classic, and the agent portal — are closed and live-validated**: the capability-bearing raw `publicToken` is not serialized to internal roles, while the intended enable/share affordances (`publicEnabled`, and the agent portal's `publicUrl`/`pdfUrl`) are preserved. This is a scoped closure, **not** an exhaustive whole-platform security proof.

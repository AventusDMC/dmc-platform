# ERP V2 — CP‑N4 Viewer Read‑Only Validation Closeout

**Status:** Closed (documentation-only closeout).
**Base / final commit:** `main` at `ac57dd0a99606e1b5a8ea340c11107669452deaa` (CP‑N4b merge).
**Scope of this document:** a factual record of the CP‑N4 work that made the internal
`viewer` role strictly read-only on the assessed quote surfaces — the backend enforcement
(CP‑N4a), the frontend gating (CP‑N4b), the staging Viewer smoke re-run (CP‑N2 Phase 2),
and the corrected/reconciled account of the earlier Phase‑1 public-link residue. It
records only what was implemented and observed; it introduces no code change and asserts
nothing beyond the surfaces actually assessed. It contains no credentials, tokens,
capability-bearing URLs, raw responses, real PII, or business data.

---

## 1. CP‑N4a — backend Viewer mutation & capability denial

- **PR #895**, merge commit `bf266fa9996272a4a66cf590a484fabf64ede1fe` (both Railway APIs
  reported `SUCCESS` at merge time).
- Every generic internal quote **write / capability / export / delete** handler runs an
  explicit, fail-closed authorization assertion as its **first statement**, before any
  service / snapshot / token / PDF / email / booking / invoice / database call. The
  assertions use canonical allowlists (not the coalescing `@Roles` guard), so `viewer`,
  `agent`, `agent_admin`, missing, unknown, and future-unlisted roles receive `403` before
  service. `@Roles` decorators are retained for metadata; the explicit assertion is
  authoritative.

**Preserved role matrix (unchanged / not widened):**

| Surface group | Allowed roles | Viewer |
|---|---|---|
| Quote write (create/update/status/cancel/reorder/move/requote/create-invoice/pricing-slabs/convert-to-booking/versions-create/item CRUD+assign+detach+display-text/templates/options/hotel-options/option-items/scenarios) + public-link enable/disable/regenerate | admin, super_admin, finance | denied (403) |
| Quote delete | admin, super_admin | denied (403) |
| Operational write (passengers, rooming, item preview/apply, proposal-email) | admin, super_admin, operations | denied (403) |
| Export / proposal / PDF | admin, super_admin, finance, operations | denied (403) |
| Version **reads** (list / readiness / summary) | admin, super_admin, finance, viewer | allowed |
| Version **writes** (create / convert-to-booking / status) | admin, super_admin, finance | denied (403) |
| Retired raw main + raw version detail | — | 404 (unchanged) |

Public token-authenticated client routes (public accept / request-changes / view) were
untouched. No DTO / mapper / projection / service / schema / migration / config / tenant /
environment change.

**Reported tests (as recorded at merge):** a new controller-boundary suite
`quote-viewer-mutation-denial.test.ts` (**501/501**) — table-driven denial for every
write/capability/export/delete handler (viewer + agent + agent_admin + missing + unknown +
future → 403, zero service calls; direct invocation cannot bypass; version read/write
split; retired routes 404; safe operational read allowed and finance-detail denied for
viewer; public-link enable/regenerate/disable expose no token/URL to viewer). Updated
`quote-version-route-auth.test.ts` (64/64) and `quote-cost-write-policy.test.ts` (16/16).
api `tsc` at baseline (0 errors in changed files). The pre-existing
`quotes-booking-conversion` service-level failures were confirmed unrelated (they call the
service directly, not the controller).

## 2. CP‑N4b — frontend strict read-only Viewer controls

- **PR #896**, merge commit `ac57dd0a99606e1b5a8ea340c11107669452deaa`.
- Canonical fail-closed helpers (`app/lib/auth-session.ts`) mirror the CP‑N4a allowlists
  and derive authority **only** from the trusted authenticated session role:
  `canWriteQuote` (admin/super_admin/finance), `canPerformOperationalQuoteWrites`
  (admin/super_admin/operations), `canExportQuote` (admin/super_admin/finance/operations),
  `canReadQuoteAsViewer` (internal read roles incl. viewer). Missing/unknown/agent/
  agent_admin → false for every action helper.
- The Classic workspace, item planner, rooming panel, day/itinerary editor, and quote
  list/table gate every write/capability/export/finance control on those helpers.
  **`ShareQuoteButton` is wrapped so it does not mount for the Viewer** (it can otherwise
  auto-request/expose a capability token — see §3/§4), and the item editor drawer never
  opens for read-only roles. Operations retains only its established authority; Admin /
  Super Admin / Finance behavior is unchanged; **Builder V2 was already role-gated and was
  not changed**. No API / backend / DTO / mapper / schema / route-URL / response change.
- **Tests (as recorded at merge):** new `quote-viewer-readonly-ui.test.ts` (21/21) —
  behavioral helper matrix + source-wiring proving each control gates on the helpers and
  capability components do not mount ungated; `page.test.tsx` obsolete expectations updated
  (44 pass / 21 fail = the pre-existing documented baseline). admin-web `tsc` at baseline
  (0 errors in changed files).

**Deployment metadata for the required admin-web targets (on merge `ac57dd0a`, verified via
GitHub/Vercel status metadata only):**

| Target | State |
|---|---|
| `dmc-platform-admin-web` | SUCCESS (Deployment has completed) |
| `dmc-platform-admin-web-4gu9` | SUCCESS (Deployment has completed) |
| `dmc-platform-admin-web-staging` | SUCCESS (Deployment has completed) |

Additional automatic contexts on that commit (reported, not interacted with):
`Vercel – dmc-platform` and both Railway API services reported SUCCESS; the Railway
`@dmc/admin-web` service was still building at last observation. No promote / redeploy /
rollback / alias / settings change was made.

## 3. Corrected Phase‑1 outcome (superseding the original Phase‑1 report)

The earlier CP‑N2 Phase‑1 staging exercise (conducted **before** CP‑N4a/CP‑N4b) succeeded
at: owner authentication; temporary Viewer provisioning via the supported
`POST /users` create-with-password path (owner-entered password, no credential exposed to
the assistant); empty-fixture reads; and net-zero temporary-account cleanup.

However, the original report's **"no public-link action"** and **clean-network**
classifications are **superseded and were inaccurate**. During the pre-CP‑N4b Phase‑1
Viewer session, `ShareQuoteButton` mounted (it was not yet gated) and its CP‑Tb
token-recovery effect automatically issued **three client `POST …/enable-public-link`
requests** that returned/rendered an **existing** capability (token + public URL) to the
Viewer's browser/DOM. **No user click occurred.** The original report classified only
owner clicks and did not account for the client-issued request stream.

Distinctions:
- owner/user click: **none**;
- automatic client request: **three**;
- persistent business mutation: **no** (established — see §4/§5);
- transient capability exposure to the Phase‑1 Viewer: **yes** (an already-existing token/
  URL reached the Viewer's browser; it was not printed or retained in the report).

## 4. Reconciliation evidence

- **All three requests targeted only the authorized fixture** `55555555-5555-5555-5555-555555550010`
  (observed in the browser network log).
- **Code-derived conclusion:** the `enable-public-link` service, when the quote is already
  enabled with a token present, **returns the existing token without updating the quote**
  (no write, no timestamp change, no new/rotated token) and performs **no audit, email, or
  downstream action**. HTTP **201** is the framework's default `@Post` status and **does not
  by itself establish that a mutation occurred**.
- **Directly observed state (targeted read-only staging check, admin, no mutation):** the
  fixture's `updatedAt` **still predates the sessions** (recorded as `2026-06-29`, months
  before the September sessions), which is inconsistent with any row write during Phase‑1;
  `publicEnabled` true, status `READY`, and zero booking/invoice/item counts matched the
  reported baseline. Token/URL values were neither revealed nor retained; the public link
  was not enabled, disabled, regenerated, copied, or opened.
- Code-derived vs observed are kept distinct above: the "no update on the enabled/token-
  present branch" is derived from committed code; the "baseline intact / `updatedAt`
  predates the sessions" is directly observed.

## 5. Residue

- **No persistent quote or public-link state change was established** through the three
  calls, and **no restoration was required** (nothing changed).
- **Existing browser/request history remains**: the three POSTs persist in the cumulative
  browser network log for that session and in the platform's Vercel/Railway access-log
  history. This closeout makes **no claim** that the capability was never exposed, that any
  historical record was scrubbed or altered, or that infrastructure logs were inspected.

## 6. CP‑N2 Phase‑2 outcome — LIMITED PASS (post‑CP‑N4)

A staging Viewer re-run after both CP‑N4 merges. Targeting was staging-only
(`dmc-platform-staging` / `dmc-platform` API and `dmc-platform-admin-web-staging`), with
production and non-staging applications excluded. Owner performed all authentication.

- **Viewer UI:** across the inspected surfaces — quote list, Classic default workspace,
  Classic review/preview, Builder V2, versions tab, and Internal View — the forbidden
  controls were **absent** (not merely disabled): no create/edit/delete quote; no item/
  template/scenario/pricing mutations; no passenger/rooming/itinerary mutations; no Save
  version; no Send/status/cancel/requote; no invoice; no booking conversion; no
  Share/Public-Link/Copy-link; no PDF/export; no finance/cost/margin/supplier labels or
  sections. **`ShareQuoteButton` did not mount** for the Viewer.
- **Reads:** operational endpoints returned `200`; the retired raw main quote route
  returned `404` (status only); a key-name scan of the operational payloads surfaced no
  token/snapshot/cost/margin/markup/FX/supplier/contract/internal-note/arbitrary-JSON/
  contact-email/phone/passenger-PII keys (empty fixture). No raw response body was printed
  or retained.
- **Network:** only authentication login/logout, GET/read traffic, and the one authorized
  Viewer create and delete were observed; **no new automatic write/capability/export
  request** was produced by the Phase‑2 Viewer session.
- **Cleanup:** both temporary-Viewer cycles restored user / Viewer-role / pending-invitation
  counts to **6 / 1 / 0**, generated no invitation or email, and ended signed out with a
  protected route redirecting to `/login`.

## 7. Validation limits

- The fixture was **empty**. Priced **cost, supplier provenance, internal-note, passenger,
  itinerary, and rooming redaction were not exercised with populated data**; no
  priced-payload validation is claimed.
- Backend write **denial is supported by controller tests** (§1); **live write probes were
  not performed** in the staging cycles.
- **Historical-version detail probing was skipped** (no known synthetic version id was
  available without listing/enumeration).
- Verdicts rest on committed code, existing sanitized reports, deployment/status metadata,
  and a single targeted read-only staging observation.

## 8. Remaining work (separate, not covered here)

- Priced synthetic-fixture validation to exercise the redaction sentinels with populated
  data (requires separate approval, including any shared-catalog write it entails).
- Legacy proposal-v2 PDF payload safety assessment (viewer already fails closed on export
  routes after CP‑N4a/b; the legacy non-actor-aware generation path is a separate review).
- Optional CP‑CI hardening (no CI exists in the repository today).
- Any Viewer pilot decision.

**This closeout establishes only the assessed quote-surface Viewer behavior — not
whole-platform security and not pilot readiness.**

# ERP V2 — CP‑N3b2 Closeout: Non‑Finance Quote & Historical‑Version Read‑Surface Hardening

**Status:** Closed (documentation-only closeout).
**Authoritative base / final deployed commit:** `main` at `45f81d01dc6126742cfbd2e1df55cc4c6591e128`.
**Scope of this document:** a record of the completed CP‑N3b2 closure arc — the sequence of
narrowly-scoped changes that closed non‑finance / non‑authorized exposure of internal data on
the generic quote‑detail and historical‑version read surfaces. This is a summary of already‑merged
work; it introduces no code change and asserts nothing beyond the surfaces actually assessed.

---

## 1. Original finding

The raw generic quote‑detail response (`GET /quotes/:id`) and the raw historical‑version detail
response (`GET /quotes/:id/versions/:versionId`) each returned a broad internal payload to roles
beyond those intended to see it. Between them the raw shapes exposed:

- **Cost / margin** (buy‑side figures alongside sell‑side).
- **Supplier provenance** (supplier and contract identity, rate provenance).
- **Internal notes** and pricing‑description free text.
- **Passenger / contact PII**.
- **Version snapshots** (`snapshotJson`, a full quote clone) including **nested `*SnapshotJson`
  blobs**.
- **Arbitrary JSON** columns (e.g. external‑package pricing matrix, fact‑sheet JSON, rate policies).
- **Capability‑bearing data** carried inside the snapshot (a live booking access token; only the
  quote‑level public token was stripped).

Client‑side redaction alone was insufficient because the same raw shapes were reachable through
multiple internal aliases (direct API, Classic, preview, raw JSON). The fix had to live on the
backend read boundary.

## 2. Corrected data model (no incorrect tenant filter introduced)

`clientCompanyId` on a quote identifies the **managed client company**, not an internal DMC tenant
boundary. This is a single‑DMC / multi‑client‑company model: internal quotes are intentionally not
filtered by `actor.companyId`. An earlier "cross‑tenant read gap" reading was a misinterpretation.
Accordingly, **no `clientCompanyId === actor.companyId` filter (or any equivalent tenant filter) was
introduced** — doing so would have broken legitimate internal reads. The hardening is purely
role‑based authorization plus response projection, leaving multi‑company behavior unchanged.

## 3. Change sequence (all merged)

| Slice | Change | PR | Merge commit |
|---|---|---|---|
| CP‑N3a′ | Internal‑role gate on generic `GET /quotes` and `GET /quotes/:id` (explicit allowlist; deny agent / agent_admin / missing / unknown; **no tenant filter**). | #882 | `8cca0de5` |
| CP‑N3b1 | Non‑finance **cost‑write gate**: strip restricted buy‑side fields from mutation bodies for non‑cost‑visible roles at seven item‑mutation entry points; finance passthrough; sell‑side preserved. | #883 | `da78c811` |
| CP‑N3b2a | **Operational quote‑detail endpoint** `GET /quotes/:id/operational` — a curated, cost‑free DTO (name‑only passengers; supplier/contract reduced to presence sentinels; no cost / token / snapshot / PII / arbitrary JSON). | #884 | `16742603` |
| CP‑N3b2a2 | **Operational companions** `GET /quotes/:id/operational/{itinerary,passengers,rooming}` — curated itinerary (no pricing description / rate‑variant ids / contract identity), name‑only passengers, rooming without internal pricing. | #885 | `fed6de6b` |
| CP‑N3b2b | **Role‑aware frontend routing** (admin‑web): cost‑visible roles fetch the cost surface; non‑finance fetch operational; PII‑gated passenger routing; rooming always operational; agent / agent_admin resolve to operational → denied. No raw fallback. | #886 | `bc1f176f` |
| CP‑N3b2c1 | **Secondary raw‑route gates**: raw itinerary → cost‑visible; raw passengers → full‑PII; raw rooming → admin / super_admin. Fail‑closed allowlists before any service call. | #887 | `5ad67a2d` |
| CP‑N3b2c2a | **Finance‑detail endpoint** `GET /quotes/:id/finance-detail` — a typed cost‑bearing allowlist DTO gated to cost‑visible roles; no tokens / snapshots / raw JSON. | #888 | `ba4089e0` |
| CP‑N3b2c2b | **Finance frontend migration**: cost‑visible surfaces fetch finance‑detail, non‑finance fetch operational; no admin‑web consumer of raw main detail remains. | #889 | `41e2faaa` |
| CP‑N3b2c2c | **Retire raw `GET /quotes/:id`** — fail‑closed 404 for every role before any service call. | #890 | `d5792f8c` |
| CP‑N3b2c3a | **Version‑route authorization** on the seven generic version handlers (explicit allowlist; agent_admin — which the coalescing role guard would admit — rejected before the service) + **metadata‑only version‑create response** (snapshot never serialized). | #891 | `0c0acb55` |
| CP‑N3b2c3b | **Classic historical‑version page → safe `/summary`** surface, and **deletion of its raw admin‑web proxy**. Frontend fetches only the summary; no raw fallback. | #892 | `9f5ed14b` |
| CP‑N3b2c3c | **Retire raw backend `GET /quotes/:id/versions/:versionId`** — fail‑closed 404 for every role before any service call. | #893 | `45f81d01` |

## 4. Final role / surface matrix

Role sets (canonical allowlists, verified in source):

- **Cost‑visible** (`QUOTE_COST_VISIBLE_ROLES`): `admin`, `super_admin`, `finance`.
- **Full‑PII** (`PII_FULL_ROLES`): `admin`, `super_admin`, `operations`.
- **Internal quote read** (`INTERNAL_QUOTE_READ_ROLES`): `admin`, `super_admin`, `finance`, `operations`, `viewer`.
- **Version‑route access** (`VERSION_ROUTE_ACCESS_ROLES`): `admin`, `super_admin`, `finance`, `viewer`.
- **Raw rooming** (`RAW_ROOMING_READ_ROLES`): `admin`, `super_admin`.

Gating is by **explicit allowlist membership checked before the service call**, not the coalescing
role guard (so `agent_admin` cannot satisfy an `admin` requirement).

| Surface | Allowed roles | Notes |
|---|---|---|
| `GET /quotes/:id/operational` (+ `/operational/itinerary`, `/operational/passengers`, `/operational/rooming`) | admin, super_admin, finance, operations, viewer | Curated, cost‑free; name‑only passengers; supplier/contract as presence sentinels. |
| `GET /quotes/:id/finance-detail` | admin, super_admin, finance | Cost‑bearing DTO; no tokens / snapshots / raw JSON. |
| `GET /quotes/:id/versions/:versionId/summary` | admin, super_admin, finance, viewer | Whitelist summary; **cost block included only for cost‑visible roles**. |
| Raw `GET /quotes/:quoteId/itinerary` | admin, super_admin, finance | Cost‑visible gate. |
| Raw `GET /quotes/:id/passengers` | admin, super_admin, operations | Full‑PII gate. |
| Raw `GET /quotes/:id/rooming` | admin, super_admin | Raw‑rooming gate. |
| Raw `GET /quotes/:id` | **none — retired (404)** | Fail‑closed before any service/DB call. |
| Raw `GET /quotes/:id/versions/:versionId` | **none — retired (404)** | Fail‑closed before any service/DB call. |

## 5. Confirmations

- **Raw main and raw historical‑version detail now fail closed.** Both `GET /quotes/:id` and
  `GET /quotes/:id/versions/:versionId` return an unconditional 404 for every authenticated role,
  before any service or database call; nothing is serialized; there is no redirect or fallback.
- **`agent` and `agent_admin` use neither the generic quote surfaces nor the version surfaces.**
  They are absent from every allowlist above and are rejected by the explicit membership checks
  (the coalescing role guard does not admit them here).
- **The safe version summary remains finance‑cost‑gated.** The summary payload includes the cost
  block only for cost‑visible roles; the summary route itself remains functional and unchanged.
- **Internal snapshot persistence remains server‑side.** `snapshotJson` is still persisted on
  version creation and still used server‑side for accepted‑version application and booking
  conversion; it is simply never returned through a read surface.
- **Version creation remains metadata‑only** in its response.
- The final version read surface is the safe `/summary`; the raw version‑detail path no longer
  yields data.

## 6. Test evidence and baseline distinction

- Focused suites for the closure (all green at the final commit): the raw‑main retirement suite,
  the raw‑version‑detail retirement suite, the version‑route authorization suite, the version
  read‑scope suite, the finance‑detail mapper/endpoint suite, the operational DTO/companion mapper
  suites, the secondary raw‑route gate suites, the version‑summary and version‑readiness suites,
  and the booking‑snapshot verification suite.
- **Known pre‑existing baseline (not regressions):** the API TypeScript compile carries a stable
  baseline error count unchanged by these slices (zero new errors in changed files at each step);
  a set of booking / multi‑company‑isolation and booking‑conversion tests fail on `main`
  independently of this arc. These were confirmed pre‑existing (e.g. by verifying the controller
  diff for the final slice touched only the retired handler, leaving conversion mechanics
  byte‑identical), and are explicitly distinguished from any change introduced here.

## 7. Deployment lineage

Merge‑commit lineage of the arc: `8cca0de5` → `da78c811` → `16742603` → `fed6de6b` → `bc1f176f`
→ `5ad67a2d` → `ba4089e0` → `41e2faaa` → `d5792f8c` → `0c0acb55` → `9f5ed14b` → **`45f81d01`**
(final deployed commit).

- **Both Railway API services reached `SUCCESS` on the final commit `45f81d01`** — staging
  (`dmc-platform-staging / dmc-platform`) and production (`cheerful-enthusiasm / dmc-platform`),
  confirmed via deployment/status metadata only.
- **The admin‑web migrations (CP‑N3b2b and CP‑N3b2c3b) were confirmed current on all three required
  Vercel targets** — `dmc-platform-admin-web`, `dmc-platform-admin-web-4gu9`, and
  `dmc-platform-admin-web-staging` — via deployment metadata only.

## 8. Security conclusion (scoped)

Within the surfaces actually assessed — the generic quote‑detail read path, the secondary raw
quote sub‑routes (itinerary / passengers / rooming), and the historical‑version read path — the
non‑finance / non‑authorized exposure of cost, supplier provenance, internal notes, passenger PII,
snapshots, arbitrary JSON, and snapshot‑borne capability data is closed: cost is role‑gated, PII is
role‑gated, the raw main and raw version‑detail paths are retired, and the remaining read surfaces
are curated allowlists. **This conclusion is limited to those surfaces and does not assert
platform‑wide security.** **No live validation was performed as part of this closure arc**; the
evidence above is build/test results and deployment/status metadata.

## 9. Outstanding work (outside this closeout)

- **CP‑N2 quote‑only Operations / Viewer read‑review** remains a separate activity requiring
  explicit approval **and** usable synthetic Viewer credentials (the prior attempt was blocked at
  Viewer authentication).
- **CP‑CI** (a continuous‑integration gate) remains **optional** hardening; no CI exists in the
  repository today.
- Any **remaining unrelated authorization surface** (e.g. the other generic quote sub‑routes not in
  scope here, the agent booking supplier‑name path), the **unrelated proposal‑PDF test issue**, and
  any **pilot or rollout** are outside this closeout.

## 10. Confidentiality

This document contains no credentials, session values, tokens, token‑bearing URLs, raw
public/proposal/PDF URLs, raw response bodies, real PII, or business data. Role names, endpoint
paths, PR numbers, and commit SHAs are the only identifiers included.

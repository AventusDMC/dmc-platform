# ERP V2 — Quote Builder V2: Proposal Versioning Gap Hardening Plan

**Date:** 2026-08-08
**Status:** Planning / read-only inspection. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this plan.

## 1. Current state
- **Model:** `QuoteVersion { id, quoteId, versionNumber, label, snapshotJson (Json), createdAt }`
  (`@@unique([quoteId, versionNumber])`). The snapshot is a **full deep-clone of `loadQuoteState(quote)`**
  (`createVersion`: `snapshotJson: JSON.parse(JSON.stringify(quote))`).
- **Save route:** `POST /quotes/:id/versions` → `createVersion`, `@Roles('admin','viewer','finance')`. This is the
  **only** way a version is created (nothing auto-creates one). `GET /quotes/:id/versions` +
  `GET /quotes/:id/versions/:versionId` read them.
- **V2 today:** **NO version-save affordance** (grep across `components/quote/v2` + `builder-v2` finds no
  `createVersion` / `/versions` / save-version). V2 lifecycle actions that DO exist: **Mark-as-Sent** (PR #535,
  `PATCH /status` → SENT), **Share / public link** (PR #536), and **public Accept / Request-Changes gating** (PR #537).
- **Mark-as-Sent / READY (`updateStatus`)** does **NOT** create a version (only the ACCEPTED/CONFIRMED branches touch
  versions).
- **Accept (public `POST /public/:token/accept`, token-based, unauthenticated):**
  1. requires `status === SENT`;
  2. `resolveAcceptedQuoteVersion` — uses `acceptedVersionId` if set, else scans saved versions and **requires at least
     one** ("Accepted quotes require at least one saved quote version"); each candidate must pass
     `assertQuoteWorkflowStateIsComplete` (≥1 passenger, valid pricing mode, …). **It never auto-creates a version.**
  3. sets `status = ACCEPTED`, `acceptedVersionId`, `acceptedAt`;
  4. **`ensureInvoiceForAcceptedQuote` → creates an invoice** (financial side effect).
- **Staff accept (`updateStatus` → ACCEPTED / CONFIRMED):** same version resolution + **invoice creation**; the plain
  `update()` path additionally refuses ACCEPTED unless `acceptedVersionId` is already set.
- **Booking dependency:** `Booking.acceptedVersionId` is a **required (non-null) FK** → a booking cannot be created
  without an accepted version → which requires a **saved version + accept**. (Booking Creation V2 Slice 1A is built but
  flag-OFF / unmerged.)

## 2. Gap list
- **V2 cannot save a proposal version.** A pure-V2 quote can be built (add activity/guide, hotel apply, etc.) and
  **Mark-as-Sent**, but because no version is saved and Mark-as-Sent does not auto-create one, the subsequent **Accept
  (client or staff) FAILS** with *"Accepted quotes require at least one saved quote version"*. Versioning is the missing
  link in the V2 quote lifecycle.
- **Saving a version is Classic-only** (the `POST /versions` action is not surfaced in V2).
- **Downstream (Accept → invoice → booking) is entirely Classic-driven** and carries a **financial side effect**
  (invoice creation) that must stay out of build-mode.

## 3. Answers
1. **What can V2 do today?** Mark-as-Sent, enable/copy/disable the public link, and the public Accept/Request-Changes
   gating is enforced — but **V2 creates no versions**.
2. **What is still Classic-only?** Creating a proposal version, the version list/history UI, selecting an accepted
   version, and the whole Accept → invoice → booking chain.
3. **Which fields are captured into a version?** `versionNumber`, `label`, `createdAt`, and `snapshotJson` — the entire
   `loadQuoteState(quote)`.
4. **Does the snapshot include itinerary / items / pricing / notes / inclusions-exclusions / hotels / guides /
   activities?** **Yes — comprehensively.** `snapshotJson` is a deep clone of `loadQuoteState`, which loads the full
   quote: itinerary days, all items (activities/guides/hotels/meals/entrance/transport/external), totals/pricing,
   inclusions/exclusions/terms text, passengers/rooming, etc. V2-created items (activity/guide via the shared
   `createItem`) are persisted normally, so they are already included — **no V2-specific snapshot gap**.
5. **What needs adding to V2 to save a version safely?** A **V2 "Save proposal version" action** that calls the
   **EXISTING** `createVersion` (`POST /quotes/:id/versions`) — reuse the `loadQuoteState` snapshot verbatim; **no new
   snapshot logic, no pricing change**. Add a V2-scoped proxy route + a proposal-step button. No schema change.
6. **Role / status gates required?** Mirror the existing route: **admin / viewer / finance**. Status: allow saving in
   **editable states (DRAFT / READY)** (save before Mark-as-Sent). Accept's SENT + completeness gate is already
   enforced server-side and stays.
7. **Risks around Accept and invoice?** Accept **creates an invoice** (`ensureInvoiceForAcceptedQuote`) and the public
   accept is **unauthenticated (token)**; Booking requires `acceptedVersionId`. None of Accept/invoice/booking should be
   enabled or exercised in build-mode. A version saved from an **incomplete** quote (0 pax / no pricing mode) fails the
   completeness gate at accept (fail-closed — good).
8. **What tests are missing?** V2 save-version (creates a version, versionNumber increments, snapshot present, includes
   V2-created activity/guide items); role/status gating; **no pricing/lifecycle/invoice side effect** from save-version;
   Mark-as-Sent version-readiness (advisory); the existing accept completeness/version-required behavior stays intact.
9. **Safest implementation sequence?** See §5.

## 4. Risks
- **Financial side effect on Accept** — invoice creation; keep Accept/invoice OUT of any V2 slice and out of build-mode.
- **Unauthenticated public accept** — enabling the link on a real quote lets a client trigger ACCEPTED + invoice; only
  ever exercise on synthetic staging data, never prod.
- **Completeness gate** — versions from incomplete quotes can't be accepted (by design); V2 save-version should surface
  this, not bypass it.
- **Booking prerequisite** — `Booking.acceptedVersionId` (required FK) means V2 versioning is a hard prerequisite for
  V2 booking creation; sequence versioning BEFORE any booking-create work.
- **Latest-revision guard** — status/version actions run through `assertLatestQuoteRevision`; V2 save-version must
  respect it (reuse the shared service, which already does).

## 5. Proposed V2 versioning design + implementation slices
- **Slice VV-1 (recommended first) — V2 "Save proposal version".** A V2-scoped proxy
  (`app/api/quotes/[id]/versions/route.ts` if not already present) + a **Save proposal version** action in
  `proposal-step.tsx`, calling the **existing** `createVersion`. Reuses the `loadQuoteState` snapshot; **no snapshot or
  pricing logic change; no lifecycle change; no invoice**. Gated role (admin/viewer/finance) + editable status. This
  closes the core gap: a V2 quote can now produce a version, making it accept-ready.
- **Slice VV-2 — Mark-as-Sent version-readiness (advisory).** Surface whether a saved (completeness-passing) version
  exists before/at Mark-as-Sent (and before enabling the public link), e.g. a warning + "Save version" shortcut. Prefer
  **advisory** over auto-saving on SENT (auto-save changes a shipped flow's behavior). Optionally offer "Save version &
  Mark as Sent" as one guided action.
- **Slice VV-3 — Version list / view in V2 (read-only).** Surface `GET /versions` + `GET /versions/:versionId` in the
  proposal step (history + view a snapshot). Read-only; no writes.
- **DEFERRED (NOT in build-mode scope) — Accept / invoice / booking.** The public Accept (invoice side effect) and
  Booking-create (acceptedVersionId dependency) stay Classic-driven until explicitly approved; Classic remains the
  system of record for the accept→invoice→booking chain.

## 6. Test plan
- **VV-1:** save-version creates a `QuoteVersion` (versionNumber = prev+1, `snapshotJson` present); role gate
  (admin/viewer/finance allowed; operations/agent/viewer-less rejected as the route requires); editable-status gate;
  the snapshot **includes V2-created activity + guide items**; **no invoice / no status change / totals unchanged**
  (assert no financial or lifecycle side effect).
- **VV-2:** the advisory correctly reflects "has a completeness-passing version" vs not; does not change Mark-as-Sent
  semantics.
- **VV-3:** version list/view render read-only; no writes.
- **Regression:** existing Classic version + accept + completeness tests still pass; accept still requires a saved
  completeness-passing version (unchanged, fail-closed).
- Staging synthetic validation for VV-1 (save a version on a UAT-STAGING quote; confirm snapshot; **do NOT accept** — no
  invoice), with the project-ID-pinned hard-fail guard + cleanup.

## 7. GO / NO-GO
- ✅ **GO** — build **Slice VV-1 (V2 Save proposal version)** reusing `createVersion`, gated, with **no** pricing /
  lifecycle / invoice side effect; then VV-2 (advisory) and VV-3 (read-only list).
- ⛔ **NO-GO** — enabling/exercising **Accept**, **invoice creation**, or **booking creation** in build-mode (financial
  side effects; Classic remains system of record).
- ⛔ **NO-GO** — production flag changes, staff rollout, live bookings, supplier send, full no-Classic launch.

## 8. Standing state
- ERP V2 remains **build-mode**.
- **Classic remains the system of record.**
- **Production item-create remains OFF** (`QUOTE_ITEM_CREATE` absent on prod).
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Read-only inspection only — no code, schema, flag/env, or data change was made. No production or staging touched.
- No secrets, DB URLs, or token values recorded — only model/route/method/field names and file paths.

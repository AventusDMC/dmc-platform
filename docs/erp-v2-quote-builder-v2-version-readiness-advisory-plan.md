# Quote Builder V2 — VV-2: Mark-as-Sent Version-Readiness Advisory Plan

Planning document. No code, no behavior change. Describes a warning-only advisory
that nudges the user to save a completeness-passing proposal version before (or
around) Mark-as-Sent, so the downstream Accept flow does not fail with a
confusing missing-version error.

---

## 1. Current state

- **V2 Mark-as-Sent is status-only.** `proposal-step.tsx` → `builder-v2-client#handleSend`
  → `PATCH /api/quotes/:id/status {status:"SENT"}`. No email, no PDF, no public
  link.
- **Mark-as-Sent does not create a version.** Sending changes status only; it does
  not snapshot a `QuoteVersion`.
- **Send already enforces live quote completeness.** Backend `updateStatus`
  (`quotes.service.ts`) runs `assertQuoteWorkflowStateIsComplete(loadQuoteState(id))`
  on the **live** quote when transitioning to `READY` or `SENT`. Any quote that
  can be Marked-as-Sent passes completeness at that moment.
- **Accept requires at least one saved completeness-passing version.**
  `resolveAcceptedQuoteVersion` prefers `acceptedVersionId`, else iterates saved
  versions newest-first for the first completeness-passing one, else throws
  (`"Accepted quotes require at least one saved quote version"`, or `"...a saved
  quote version with complete pricing and workflow details"`).
- **Booking Creation requires `acceptedVersionId`.** `Booking.acceptedVersionId`
  is a required FK; conversion depends on an accepted version existing.
- **VV-1 added Save proposal version, but no advisory exists yet.** VV-1
  (PR #792) added the "Save version" action reusing the existing `createVersion`
  (`POST /quotes/:id/versions`). Nothing yet prompts the user to save one, and
  nothing surfaces whether a saved version would satisfy Accept.

## 2. Gap

- A **pure V2 quote can be marked SENT with zero saved versions.**
- **Accept can then fail later** with a confusing missing-version error, after the
  proposal has already gone out.
- **The FE cannot currently know whether any saved version passes completeness.**
  `GET /quotes/:id/versions` returns `{id, quoteId, versionNumber, label,
  createdAt}` — no `snapshotJson` — and the completeness check is a private
  backend method. So "versions exist but none are complete" is invisible to V2.

## 3. Recommended design

- **Warning-only advisory in the Proposal step**, adjacent to Mark-as-Sent.
- **Do not block Mark-as-Sent** — Send already enforces live completeness; a saved
  version is an *Accept* prerequisite, not a *Send* one; Classic does not block
  Send on versions.
- **Do not auto-create a version** on Send in this slice.
- **Show a "Save a version now" action** inline in the advisory, reusing VV-1's
  save flow. (Live state passes completeness at Send, so a fresh snapshot will
  pass too.)
- **Re-check readiness after save** and update the banner.
- **Backend is the single source of truth** for readiness — the FE must not
  re-implement completeness (guaranteed drift from the Accept rule).

Advisory copy states:
- *No saved version* → "This quote has no saved proposal version. The client will
  not be able to Accept until one is saved." + **[Save a version now]**.
- *Versions exist, none complete* → "Saved versions don't yet pass completeness,
  so Accept will fail. Complete the flagged items, then save a new version." +
  **[Save a version now]**.
- *A complete version exists* → no banner (optionally a quiet "✓ Ready to accept:
  version N").

## 4. Backend — Slice A (read-only)

- **Extract a non-throwing completeness evaluator** (e.g.
  `evaluateQuoteWorkflowCompleteness(snapshot): { ok, reasons[] }`) that is
  **reused by the existing throwing completeness logic**
  (`assertQuoteWorkflowStateIsComplete`) so both paths share one implementation.
- **Add a read-only `version-readiness` endpoint**
  (`GET /quotes/:id/version-readiness`, `@Roles('admin','viewer','finance')`).
- **Return:** `versionCount`, `hasSavedVersion`, `hasCompleteVersion`,
  `latestVersionNumber`, `latestVersionComplete`, `acceptWillSucceed`, `reason`.
- **No writes.** **No schema.** **No flags.** **No Accept / invoice / booking.**
- Evaluate newest-first and short-circuit (mirroring
  `resolveAcceptedQuoteVersion`); return booleans only — do not ship `snapshotJson`
  to the FE.

## 5. Frontend — Slice B

- **Add an admin-web proxy** `/api/quotes/[id]/version-readiness/route.ts`.
- **Fetch readiness in `builder-v2-client`** (on load and after a Save).
- **Thread it to `ProposalStep`.**
- **Render a warning banner** for the no-version / no-complete-version states.
- **Inline "Save a version now"** reusing VV-1's `handleSaveVersion`.
- **Re-fetch readiness after save.**
- **Mark-as-Sent remains enabled** — the advisory never gates it.

## 6. Deferred — Slice C

- **Combined "Save version & Mark as Sent."**
- **Deferred** because it creates ordering/rollback behavior questions (e.g. if
  the status PATCH fails after the version write) and is a behavior change, not
  needed to close the readiness-visibility gap. Treat as a separate plan/PR.

## 7. Risks

- **Completeness logic drift** if reimplemented in the FE — mitigate by
  backend-only computation reusing the existing check.
- **Accept/advisory disagreement** — the extracted evaluator must be the single
  implementation behind both the throwing (Accept/conversion) and non-throwing
  (advisory) paths.
- **Performance from reading `snapshotJson`** — snapshots are large; short-circuit
  newest-first and return booleans only.
- **Stale saved version vs live quote** — a passing saved version can lag the live
  quote; the advisory reflects snapshots, not live. The Send-time Save keeps them
  aligned; note it in copy.
- **Warning fatigue** — keep it strictly non-blocking and quiet when a complete
  version exists.
- **Role exposure** — gate readiness to `admin/viewer/finance` (same as versions
  write).

## 8. Test plan

- **Backend — no versions** → `hasSavedVersion:false`, `hasCompleteVersion:false`.
- **Backend — version failing completeness** → `hasSavedVersion:true`,
  `hasCompleteVersion:false`.
- **Backend — version passing completeness** → `hasCompleteVersion:true`,
  `latestVersionComplete:true`, `acceptWillSucceed:true`.
- **No-write / no-throw assertions** on the readiness path.
- **FE — advisory renders for no saved version.**
- **FE — advisory renders for no complete version.**
- **FE — advisory does not disable Mark-as-Sent.**
- **FE — inline Save present.**
- **FE — readiness re-fetch after save.**
- **Regression** — proposal / send / save-version suites
  (`builder-v2-ready-send-clarification`, `builder-v2-proposal-send-email`,
  `builder-v2-save-version`) still pass.
- **Staging synthetic read-only validation** — project-ID-pinned + identity guard;
  reuse `Q-2026-0004`; confirm endpoint output; no writes.

## 9. GO / NO-GO

**GO**
- Slice A: backend read-only version-readiness endpoint.
- Slice B: frontend warning-only advisory.

**NO-GO**
- Auto-create a version on Send.
- Block Mark-as-Sent.
- Accept.
- Invoice creation.
- Booking conversion.
- Production / staff rollout / live bookings / supplier-send / no-Classic launch.

## 10. Standing state

- ERP V2 remains **build-mode**.
- **Classic remains the system of record.**
- Production item-create **OFF**.
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.

---

*Planning only. No code, no data, no flag/env, no production or staging behavior
change.*

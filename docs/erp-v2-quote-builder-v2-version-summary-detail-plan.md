# Quote Builder V2 — VV-3 Slice 2: Safe Version Summary Detail Plan

Planning document. No code, no behavior change. Plans a safe, redacted, PII-free
version **summary** detail for Quote Builder V2 — a new curated backend endpoint and
a read-only UI drawer — so users can inspect a saved version without exposing the raw
`snapshotJson`.

---

## 1. Current raw-snapshot risk summary

- `snapshotJson` is a **full `loadQuoteState` deep clone** (`JSON.parse(JSON.stringify(quote))`).
- It **includes client-facing fields** (title, status, travel dates, pax, currency,
  selling total / per-person, itinerary days, items, inclusions/exclusions text).
- It **includes internal cost/margin fields** (`totalCost`, `currentPricing`,
  `priceComputation`, per-item `baseCost`/`costBaseAmount`/`totalCost`/`overrideCost`/
  `finalCost`/`fxRate`/`markupPercent`, `singleSupplement`, `excursionPackageRate`).
- It **includes passenger/contact PII** (`passengers` — names/passport/DOB;
  `contact`/`contactId` — name/email/phone).
- It **includes internal notes / workflow diagnostics / booking / invoice / public
  token fields** (`note`, `termsNotesText`, `workflowDiagnostics`, `convertBlockers`,
  `transportSelection*`, `clientChangeRequestMessage`, `booking`, `invoice`,
  `publicToken`, `scenarios`, company internals).
- The **raw detail route `GET /quotes/:id/versions/:versionId` must not be used by
  V2** (it returns the whole row).

## 2. Recommended backend summary endpoint

- **`GET /quotes/:id/versions/:versionId/summary`**
- **Roles:** `admin` / `viewer` / `finance`.
- **Actor-scoped** via `findOne(id, actor)` (resolve the quote with the actor first).
- **Version scoped to the quote** (`findVersion(quoteId, versionId)` → 404 if the
  version belongs to another quote).
- **No writes.**
- **No `snapshotJson` returned.**
- **Whitelist extraction only** (opt-in fields; never spread the raw snapshot).
- **Completeness via the VV-2 evaluator** (`evaluateQuoteWorkflowCompleteness`).
- **Cost block only when `canActorViewCost(actor)` is true** (admin/super_admin/
  finance); omitted entirely otherwise.

## 3. Privacy / redaction rules

- **Never return `passengers`.**
- **Never return contact details.**
- **Never return company internals.**
- **Never return internal notes.**
- **Never return `workflowDiagnostics` / `convertBlockers` / raw JSON.**
- **Viewer receives the client-facing summary only.**
- **admin / super_admin / finance** may receive the cost block if included.
- **FE-only redaction is insufficient** — curation happens server-side before the
  response is built, so redacted values never reach the browser.

## 4. Safe summary fields

- `versionNumber`, `label`, `createdAt`.
- title / status at snapshot.
- travel dates, nights.
- pax counts.
- currency.
- client-facing selling total / per-person.
- item count.
- day count.
- inclusions / exclusions **presence booleans**.
- completeness `ok` / `reasons`.
- `acceptWillSucceed`.

## 5. Frontend drawer design

- **View trigger** on each saved-version row.
- **Fetch the summary proxy only** (`GET /api/quotes/[id]/versions/[versionId]/summary`).
- **Render the curated summary.**
- **Show the cost block only if present** in the payload (finance roles).
- **No raw JSON.**
- **No restore / rollback / set-accepted / send** actions.

## 6. Implementation slices

- **Slice 2A** — backend read-only summary endpoint (`getVersionSummary` +
  `GET /quotes/:id/versions/:versionId/summary`).
- **Slice 2B** — frontend proxy + drawer.
- **Raw endpoint deprecation / hardening** remains **separate future work**.

## 7. Test plan

- Backend summary derivation (correct client-facing fields).
- Cost present for finance-visible roles.
- Cost absent for viewer / restricted roles.
- No `snapshotJson`.
- No `passengers` / contact / notes.
- Role gate → 403.
- Quote / version scope → 404.
- No writes.
- Frontend drawer fetches the summary proxy.
- Frontend never uses the raw detail endpoint.
- Frontend renders no raw JSON.
- Regressions for saved-versions list, readiness, save-version.

## 8. Risks

- Whitelist drift (mitigated by strict opt-in extraction — never spread the snapshot).
- Cost-gating divergence (reuse `canActorViewCost`; don't duplicate the predicate).
- Viewer role nuance (in the read gate but not cost-visible → client-facing only).
- Stale snapshot vs live quote (summary reflects the saved point-in-time — label
  everything "at snapshot").
- Raw endpoint still exists but must **not** be consumed by V2.
- Inclusions / exclusions should be **presence booleans only** (no internal wording).

## 9. GO / NO-GO

**GO**

- Backend summary endpoint (Slice 2A).
- Frontend read-only drawer (Slice 2B).

**NO-GO**

- Returning `snapshotJson`.
- Returning passenger / contact PII.
- Cost for non-finance roles.
- Using the raw `versions/:versionId` endpoint in V2.
- Restore / rollback / set-accepted / send.
- Accept.
- Invoice creation.
- Booking conversion.
- Staff rollout / live bookings / supplier send / no-Classic launch.

## 10. Standing state

- ERP V2 remains **build-mode**.
- **Classic remains the system of record.**
- Production item-create **OFF**.
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.

---

*Planning only. No code, no data, no flag/env, no production or staging behavior
change.*

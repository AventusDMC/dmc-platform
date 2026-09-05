# ERP V2 — CP‑N2 Phase‑3 Priced‑Fixture Staging Closeout

**Status:** Closed (documentation-only closeout).
**Base / branch commit:** `main` at `a134bc3d0be30eef49bb640dc1b1f27bd5985219` (CP‑N4 closeout merge, PR #897).
**Scope of this document:** a corrected, factual record of the CP‑N2 Phase‑3 quote-local
priced-fixture staging run — the run that exercised the Viewer redaction sentinels with
**populated** data on a temporary, quote-local fixture. It supersedes the earlier
Phase‑3 report's cleanup narrative where that narrative was internally inconsistent. It
records only what was implemented and observed, introduces no code change, and asserts
nothing beyond the surfaces actually assessed. It contains no credentials, tokens,
capability-bearing URLs, raw response bodies, real PII, or business data.

---

## 1. Scope and guards

- **Staging only.** Targeting was the staging API (`dmc-platform-staging` project
  `26e31130` / service `dmc-platform` `acf269c3`) and the staging frontend
  `dmc-platform-admin-web-staging`; production (`cheerful-enthusiasm`) and all non-staging
  applications were excluded. Base commit for the run was `a134bc3d`, reported `SUCCESS`
  for both the staging API and `dmc-platform-admin-web-staging` (deployment/status metadata
  only).
- **Owner performed all authentication.** No credential, password, cookie, token, session
  value, or authorization header was read, typed, copied, retained, printed, or reported by
  the assistant. The temporary Viewer password was entered by the owner through a masked
  overlay and never appeared in any output.
- **Quote-local writes only.** No shared supplier / vehicle-rate / contract / catalog /
  company / pricing-rule write was made. The fixture was a temporary DRAFT quote and its
  own child rows.
- **No public-link / PDF / email / version / booking / invoice / supplier action** was
  performed during the run. No code, test, doc, deployment, CI, pilot, or rollout change
  was made during the live run.

## 2. Fixture (quote-local; all creates reported `201`)

A temporary DRAFT quote bound to the existing **Default Company** and an
**explicitly-synthetic** contact within it (a contact whose own fields carried a synthetic
marker). A fresh unique run marker was verified **absent** in quotes and users before any
create, and execution-time baselines were recorded as users **6**, Viewer role **1**,
pending invitations **0** (pending count taken from the invitations endpoint, not inferred
from user counts).

Created rows (quote-local):

- one DRAFT quote;
- one itinerary day (`QuoteItineraryDay`, the new model);
- one **one-off external-package item** via the classic item route (no `serviceId` → the
  one-off external-package branch), carrying a restricted synthetic buy-side cost, markup,
  supplier name, and internal note, plus client-facing package name / description. The
  item's `itineraryId` was the `QuoteItineraryDay` id, which the resolver matched to the
  new day model and linked through **one indirect `QuoteItineraryDayItem`** (no legacy
  `Itinerary` row);
- one synthetic passenger carrying restricted passport / date-of-birth / nationality values;
- one temporary Viewer user (create-with-password, password owner-entered and not returned
  to the assistant).

The baseline quote and all shared catalog data were untouched.

## 3. Populated-data positive controls (Admin)

The restricted synthetic data was confirmed genuinely present in the source before asserting
its absence downstream:

- **Admin `/finance-detail` (`200`):** the restricted net cost, markup percent, external
  supplier name, and internal note were **all present**; finance-detail passengers were
  **name-only**.
- **Admin raw `/passengers` (`200`, full-PII path):** the synthetic passport, date of
  birth, and nationality were **present** (recorded only as booleans, values not printed).

## 4. Demonstrated Viewer redaction results (populated fixture)

With the temporary Viewer role, against the same populated fixture:

- Viewer operational reads — `/operational`, `/operational/itinerary`,
  `/operational/passengers`, `/operational/rooming` — all returned `200` with **zero**
  restricted values (the `RESTRICTED-*` markers, the net cost, the date of birth) and
  **zero** restricted keys (external net cost / supplier name / internal notes / override
  cost / markup percent / total cost / base cost / pricing description) at any depth.
- Passengers were returned as exactly `{ id, firstName, lastName }`.
- The item `contract` field was the empty-sentinel `{}` / null.
- The client-facing `externalPackageName` **was** visible — expected and allowed.
- Raw `/passengers` returned **`403`**; the retired raw main quote route returned **`404`**.

No raw response body was printed or retained; assertions were recorded as value/key presence
booleans.

## 5. Populated UI coverage

- **Exercised with the populated priced fixture:** the **Classic** default workspace and
  **Builder V2**. Both rendered read-only for the Viewer — no create / edit / delete, no
  item / template / scenario / pricing mutation controls, no Save version, no
  Send / status / cancel / requote, no invoice, no booking conversion, no
  Share / Public-Link / Copy-link, no PDF / export, and no finance / cost / margin /
  supplier labels or sections. **`ShareQuoteButton` did not mount** for the Viewer, and the
  Viewer session produced **no automatic write / capability / export request** on load
  (only read traffic — version-readiness and versions GETs — was observed).
- **Not separately exercised with populated data:** **Preview / review**, **Internal
  View**, and the **versions UI** were **not** reported as separately exercised against the
  populated fixture. Their earlier **empty-fixture** evidence (CP‑N2 Phase 2, recorded in
  the CP‑N4 closeout) stands **separately** and is **not** extended to the populated case.
- **Operations read-axis: skipped** — no owner-held Operations credential was available.

## 6. Deferred coverage (not exercised this run)

- **Hotel-contract** provenance redaction;
- **Assigned-transport** redaction;
- **Populated rooming** redaction.

Each requires an existing linked hotel / contract / transport reference; none was attempted,
and no shared-catalog extension was made to enable them.

## 7. Reported mutation requests and recorded statuses

**Ten** mutation HTTP requests were reported for the run:

| # | Request | Recorded status |
|---|---|---|
| 1 | Create temporary Viewer user | `201` |
| 2 | Create DRAFT quote | `201` |
| 3 | Create itinerary day | `201` |
| 4 | Create one-off external-package item | `201` |
| 5 | Create synthetic passenger | `201` |
| 6 | Delete passenger | `200` |
| 7 | Delete item | `200` |
| 8 | Delete itinerary day | `404` |
| 9 | Delete quote | `200` |
| 10 | Delete temporary Viewer user | `200` |

Six rows were created (Quote, QuoteItineraryDay, QuoteItem, the indirect
QuoteItineraryDayItem link, QuotePassenger, User). Total-recalculation updated the temporary
quote in place; id / number sequences advanced (history, not a persisted extra row).

## 8. Cleanup evidence and its limits

**Valid, independent cleanup evidence (not in doubt):**

- **Quote absence proven by an authenticated `/finance-detail` → `404`**, with
  `/api/auth/me` `200` immediately prior (so genuinely not-found, not an auth failure). The
  retired raw route was **not** used to prove deletion.
- **Restored counts:** users **6**, Viewer role **1**, pending invitations **0** (from the
  invitations endpoint); the temporary Viewer was absent.
- **Final sign-out:** the session ended signed out, and a protected route redirected to
  `/login`.

**Explicitly unverified (corrections to the earlier report):**

- The **exact chronological order, timestamps, and any concurrency** of the five cleanup
  requests are **not resolvable from captured evidence** — request-level network timing was
  not retained. The deletes were issued by hand rather than batched, so concurrency is not
  expected, but this rests on how the session was driven, **not on captured metadata**, and
  is therefore marked **unverified**.
- The **cause of the itinerary day's `404`** is **unverified**. The earlier report both
  ordered the day delete before the quote delete **and** attributed the day's absence **to**
  the quote deletion — statements that cannot both describe the same sequential run. **That
  cascade explanation is withdrawn.** A `404` alone does **not** establish a successful
  cascade; it is equally consistent with the day already removed earlier in cleanup, a prior
  cascade, a route / id mismatch, or the quote having been deleted first, and these cannot
  be distinguished from the evidence retained.
- Accordingly, **complete cleanup verification is not claimed.** What is established is the
  quote's absence (authenticated `/finance-detail` `404`), the restored user / Viewer-role /
  invitation counts, and the final sign-out — each standing on its own, independent of the
  cleanup ordering and of the day `404`'s cause.

## 9. Residue (disclosed, not scrubbed)

The ten requests persist in the platform's Vercel / Railway access-log history and in the
session's browser network history; quote / user id and any numbering sequences advanced.
Deleting the rows does not erase this history. No infrastructure log was inspected, and no
claim is made that any historical record was scrubbed or altered.

## 10. Verdict and limits

**LIMITED PASS**, applying **only** to the coverage demonstrated with populated data — cost /
margin, external supplier provenance, internal notes, passenger PII, and itinerary
redaction, on the Classic default workspace and Builder V2. It does **not** establish full
CP‑N2 completion or pilot readiness: Preview / review, Internal View, and versions UI were
not exercised with populated data; Operations was skipped; and hotel-contract,
assigned-transport, and populated-rooming coverage remain deferred. Any Viewer pilot or
rollout requires separate authorization.

---

*This closeout records the assessed quote-surface Viewer behavior under a populated
quote-local fixture — not whole-platform security and not pilot readiness.*

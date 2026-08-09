# Quote Builder V2 — VV-2 Version-Readiness Advisory: Staging Validation Report

**Result: PASS** — the backend version-readiness endpoint, the deployed admin-web
proxy, the Save-version re-fetch, the role/auth guards, and the no-side-effects
guarantees were all verified end-to-end on staging.

---

## 1. Result

PASS. The V2 version-readiness advisory works end-to-end on staging: the backend
reports readiness against the same completeness rule Accept enforces, the deployed
proxy returns that data unchanged, saving a version re-fetches and updates the
state, and nothing mutates lifecycle or financials.

## 2. Context

- **PR #795** — backend read-only endpoint `GET /quotes/:id/version-readiness`.
- **PR #796** — frontend non-blocking Proposal-step advisory.
- **VV-2 is warning-only.**
- **Mark-as-Sent remains non-blocked** — the advisory never feeds the Send button's
  disabled state.

## 3. Staging targeting

- **Project-ID-pinned Railway targeting:**
  `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -s dmc-platform -e production`.
  No bare service-name targeting.
- **Hard-fail identity guard** ran in-container before any DB access and passed:
  - project = `dmc-platform-staging`
  - project id = `26e31130-a684-448a-bb96-f0da7a0a60c9`
  - DB fingerprint = `ab62050c502b` (staging match)
  - production project (`60d81051-…` / `cheerful-enthusiasm`) **not** targeted
- Production was probed **read-only** (single flag read; no DB access, no write).
  Secrets stayed in-container.

## 4. Deployed commit confirmations

- **Backend includes PR #795.** Staging API container
  `RAILWAY_GIT_COMMIT_SHA = 2a7c0adcf625` — the `origin/main` tip, which contains
  `bf8e7dda` (#795).
- **admin-web includes PR #796.** Vercel `admin-web-staging` `git-main` production
  deploy created 05:06:41Z, matching the #796 merge (`2a7c0adc`, 05:06:36Z).

## 5. Staging quote references

- **Q-2026-0004** — `b89bfcf7-99ec-4f77-8da6-e724e37dbad1`, DRAFT, one saved VV-1
  version (completeness-passing).
- **UAT-STAGING-QBV2-VERSION-READINESS — DO NOT SEND** —
  `edf1688f-c7c7-4456-8322-d00fe6ced1cf`, created and deleted this run.

## 6. Backend readiness results

- **Q-2026-0004:** `versionCount=1`, `hasSavedVersion=true`,
  `hasCompleteVersion=true`, `latestVersionComplete=true`, `acceptWillSucceed=true`,
  `reasons=[]`.
- **No-version synthetic:** `hasSavedVersion=false`, `hasCompleteVersion=false`,
  `acceptWillSucceed=false`, `reasons=["Accepted quotes require at least one saved
  quote version"]`.
- **Response shape:** exactly the 7 fields; **no `snapshotJson`, no
  cost/margin/financial fields**.

## 7. Frontend advisory / proxy

- The **deployed admin-web-staging proxy**
  (`GET /api/quotes/:id/version-readiness`, `dmc_session` cookie) returned **200**.
- **Proxy body matched the backend readiness body** exactly → the FE proxy →
  backend chain is verified end-to-end (the exact data the advisory renders from).
- **Q-2026-0004** (`acceptWillSucceed=true`) maps to the **quiet success / no
  warning** state.
- **No-version quote** (`hasSavedVersion=false`) maps to the **warning** state.
- Rendering logic (string selection, non-blocking, Mark-as-Sent unaffected) is
  pinned by the merged 7/7 source-grep test + tsc.

## 8. Save version now

- `POST /quotes/:id/versions` returned **201**.
- `versionNumber = 1`, snapshot present.
- Re-fetch flipped the no-version state to **saved-but-incomplete**
  (`hasSavedVersion` false→true; `reasons` → "…require a saved quote version with
  complete pricing and workflow details" — expected for an empty synthetic quote).
- **No Accept / invoice / booking / status side effects.**

## 9. Guard checks

- **Operations role** → **403** ("You do not have permission to access this admin
  area").
- **No auth** → **401** ("Authentication is required").
- **Readiness fetch error handling remains non-blocking** by code/tests (the
  deployed proxy returned 200, so no live error path was triggered).

## 10. Side-effect checks

- **Q-2026-0004 unchanged.**
- Status unchanged (DRAFT).
- Totals unchanged (200 / 160).
- `acceptedVersionId` null.
- No invoice.
- No booking.
- No email/send.

## 11. Cleanup

- **Synthetic quote deleted.**
- **Its version removed by cascade.**
- **Q-2026-0004 left untouched** (its VV-1 version intact).
- **No production cleanup.**

## 12. Confirmations

- No Accept.
- No invoice.
- No booking.
- No email/send.
- Production unchanged (read-only flag probe only; no prod DB access/writes; no prod
  flag/env changes).
- Production item-create remains **OFF** (`QUOTE_ITEM_CREATE` unset in
  `cheerful-enthusiasm`).
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.

## 13. GO / NO-GO

**GO**

- VV-2 validated on staging.
- Continue build-mode hardening.

**NO-GO**

- Accept flow.
- Invoice creation.
- Booking conversion.
- Staff rollout.
- Live bookings.
- Supplier send.
- Full no-Classic launch.

---

*Validation performed on staging only, against clearly-labeled synthetic quotes,
read-mostly with a single guarded synthetic quote + version (both deleted at the
end). Classic remains the system of record.*

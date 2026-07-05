# Passenger / Rooming MVP — PR-3d (FE Privacy Polish) Staging Validation Report

**Date:** 2026-07-05
**Environment:** Staging only (`dmc-platform-admin-web-staging.vercel.app` + staging API)
**Verdict:** ✅ PASS — restricted-role passenger PII affordances are correctly polished on
staging; full-PII roles unchanged. Production unchanged.
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: the Ops V2 Passengers & Rooming tab gates PII affordances on a server-computed
`canSeeFullPii` (admin / operations / super_admin). Restricted roles (agent_admin, agent,
viewer, finance) get passport readiness warnings/chips suppressed and a "Restricted"
placeholder for redacted manifest columns instead of a misleading "Missing"/"—". FE-only;
complements PR-3a (detail redaction) and PR-3b (export gating). References:
`docs/passenger-rooming-pr3-pii-privacy-plan.md`,
`docs/passenger-rooming-pr3a-staging-validation.md`,
`docs/passenger-rooming-pr3b-staging-validation.md`.

---

## 1. Merge commit
`a80070dd` — PR #638 (`feat(admin-web): restrict passenger PII affordances in Ops V2 for
restricted roles`), MERGED with all 5 Vercel checks green.

## 2. Staging admin-web deploy status
The PR-3d build is **live** on `dmc-platform-admin-web-staging.vercel.app`. Confirmed by
polling the Ops V2 passengers tab until agent_admin rendered the new `"Restricted"` string
(a marker unique to PR-3d). Validated against BK-2026-0002.

## 3. admin / operations result (full-PII)
Both roles — HTTP 200, no crash:
- **Readiness works normally** — the readiness strip shows the "…missing a passport" badge
  (readiness flag is ON on staging).
- **Edit tools work** — passenger + rooming editor renders (Add passenger, Add room,
  form/input/select); `NEXT_PUBLIC_OPS_V2_PAX_EDIT` is ON on staging.
- **No "Restricted" placeholder** — real manifest data is shown.
- Note: the per-row "No passport" chip lives in the read-only table, which the editor
  replaces when editing is ON, so the missing-passport signal surfaces via the readiness
  strip instead. The read-only-table chip path (full-PII → chip shows) is covered by unit
  tests; staging cannot exercise it without toggling the edit flag, which was not touched.

## 4. agent_admin restricted result
HTTP 200, no application error, no crash. In the passenger-manifest section:
- **No edit controls** — no Add passenger / Add room / Assign / Auto-assign / Set lead /
  form / input / select. (The only `<form>` on the page is global app-shell chrome,
  outside the pax section.)
- **No false "No passport" / "Passport expiring" chips.**
- **Passport readiness strip badge suppressed** ("missing a passport" absent for
  agent_admin).
- **6 "Restricted" placeholders** — all redacted PII columns (Nationality, Passport,
  Arrival, Departure, Dietary, Rooming notes).
- **Identity retained** — the passenger name renders.

## 5. No finance data in the passenger/rooming view
✅ Confirmed — the passenger-manifest section has zero finance tokens. The whole-page
`invoice`/`margin` matches are the global Finance nav sidebar
(`<strong>Finance</strong><span>Invoices, reconcilia…`), not the pax data.

## 6. Safety confirmation
- **Production not enabled / unchanged** — no Vercel env changes, no 4gu9 redeploy, no
  Railway prod changes, no flag edits. Production passenger/rooming edit flag
  `NEXT_PUBLIC_OPS_V2_PAX_EDIT` remains OFF; Booking Creation V2 production flags remain OFF.
- **Voucher-send allowlist unchanged** — remains `ziad@axisdmc.com` only; supplier email /
  voucher-send untouched.
- **Classic export-button ticket remains deferred and separate** — not started; the Classic
  booking page was not touched.
- Temporary validation scripts and the secret-bearing variables file were deleted from
  disk; no test files or scripts were left in the repo.
- Documentation only — no code, schema, flag, or environment change in this report.

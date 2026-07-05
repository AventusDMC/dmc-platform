# Passenger / Rooming MVP — PR-2b Staging Validation Report

**Date:** 2026-07-05
**Environment:** Staging only (`dmc-platform-admin-web-staging.vercel.app` + staging API)
**Verdict:** ✅ PR-2b (flag-gated V2 passenger editing) validated end-to-end on staging, after the
PR-2b backend manifest fix. Production unchanged.
**Scope of change:** Documentation only. No code, schema, flag, or environment change accompanies this report.

Feature: flag-gated passenger editing on the Operations V2 Passengers & Rooming tab — Add / Edit /
Delete / Set-lead — behind `NEXT_PUBLIC_OPS_V2_PAX_EDIT` (default OFF), admin/operations only, via new
V2 JSON proxies. References: `docs/passenger-rooming-pr2-manual-entry-plan.md`,
`docs/passenger-rooming-mvp-plan.md`.

---

## 1. Background — the fix that unblocked this
Initial PR-2b staging validation failed because the shared backend required passport + nationality +
expiry on both passenger create and update, while PR-2b deliberately sends no PII. The follow-up
`fix(api): allow passenger edits without passport fields` (PR #624, merge commit `73ef906d`) made
those fields optional on create and update (firstName/lastName still required; supplied passport still
normalizes and persists; expiry-before-issue still validated). A missing passport/expiry remains an
Ops readiness warning (PR-1), not a blocker.

## 2. Deploy status
- **Staging API:** auto-deployed commit `73ef906d` → SUCCESS (passport-optional behavior live).
- **Staging admin-web:** `NEXT_PUBLIC_OPS_V2_PAX_EDIT=true` set on staging only; rebuilt and aliased to
  the staging domain. Editor live.
- **Production:** unchanged — `NEXT_PUBLIC_OPS_V2_PAX_EDIT` absent on production admin-web (4gu9); the
  V2 editor is not accessible in production.

## 3. Validation on BK-2026-0002

| # | Check | Result |
| - | ----- | ------ |
| 1–2 | Passenger editor appears | Yes — "Passengers are editable in V2. Rooming is read-only." |
| 3 | Only non-PII fields render | firstName, lastName, title, nationality, arrivalFlight, departureFlight, dietaryNotes, roomingNotes |
| 4 | No passport / DOB / gender / entry / visa / emergency fields | None present |
| 5 | Add passenger **without** passport | 201 — created; passport / DOB / emergency stripped; `isLead` stripped from create |
| 6 | Edit allowed fields | 200 — updated without passport; PII stripped; lead unchanged |
| 7 | Set lead | 201 — the passenger became lead |
| 8 | Delete the lead while another exists | 400 — **"Set another passenger as lead before deleting the lead passenger."** |
| 9 | Set lead back to the original | 201 |
| 10 | Delete the test passenger (non-lead) | 200 |
| 11 | Readiness warnings update after refresh | Yes — returned to baseline ("1 passenger missing a passport") after cleanup |
| 12 | Rooming remains read-only | Yes — "Open rooming in Classic"; no rooming edit controls |
| 13 | No finance / cost / sell / margin data | None in the passengers/rooming view |
| 14 | Production unchanged | Yes — production editor flag absent |

**End state:** BK-2026-0002 restored to baseline — one passenger (QA Contact, Lead); no leftover test data.

## 4. Key results
- **Add / Edit / Set-lead / Delete** all succeed against the fixed staging API.
- **PII is stripped** by the V2 proxy/request path (passport, DOB, emergency contacts never persisted
  from V2), and `isLead` is excluded from create/update (lead changes only via the dedicated action).
- **Delete-lead guard** blocks with the exact expected message.
- **Readiness** updates on refresh and still reports missing passport.
- **Rooming** stays read-only (PR-2c scope).

## 5. Safety confirmation
- **Production not enabled** — no production flag changes; the V2 editor flag is absent on 4gu9.
- **Voucher-send allowlist unchanged** — remains `ziad@axisdmc.com` only; supplier email / voucher-send
  untouched.
- **No PII fields editable** in V2; **no finance/pricing** surfaced in the passengers/rooming view.
- Documentation only — no code, schema, flag, or environment change in this report.

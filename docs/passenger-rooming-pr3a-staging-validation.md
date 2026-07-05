# Passenger / Rooming MVP — PR-3a (Backend Detail Redaction) Staging Validation Report

**Date:** 2026-07-05
**Environment:** Staging only (staging API + `dmc-platform-admin-web-staging.vercel.app`)
**Verdict:** ✅ PASS — role-based passenger-PII redaction validated end-to-end on staging
against BK-2026-0002. Production unchanged.
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: booking-detail (`GET /api/bookings/:id`) now redacts sensitive passenger
manifest fields for restricted roles. Full-PII roles are `admin`, `operations`,
`super_admin`; restricted roles are `agent_admin`, `agent`, `viewer`, `finance` (and any
non-full-PII role). Always-on security hardening — not flag-gated. See
`docs/passenger-rooming-pr3-pii-privacy-plan.md`.

---

## 1. Merge commit
`d93e08de` — PR #632 (`feat(api): redact passenger PII from booking detail for restricted
roles`), MERGED with all 5 Vercel checks green.

## 2. Staging API deploy status
Railway staging service `dmc-platform` deployment **SUCCESS**, `commitHash = d93e08de…`
(the PR-3a merge). The running image carries the merged code.

## 3. Method
Read `GET /api/bookings/:id` for BK-2026-0002 as each role, differing only in the session
role. A temporary passenger seeded with **fake** PII (fake passport / issue / expiry /
DOB / emergency contact / visa / entry point / flights / dietary / rooming / notes) was
used so every sensitive field had a value to redact. No real client PII was used.

## 4. admin / operations detail result (full-PII)

| Check | admin | operations | super_admin |
| ----- | ----- | ---------- | ----------- |
| `passportNumberMasked` available (`*******4567`) | ✓ | ✓ | ✓ |
| raw `passportNumber` never returned (undefined) | ✓ | ✓ | ✓ |
| all manifest fields present (DOB, gender, nationality, emergency phone, visa, entry point, flights, dietary, notes) | ✓ | ✓ | ✓ |

## 5. agent_admin redaction result

Verified for `agent_admin` and also `agent`, `viewer`, `finance`:

- **15 / 15** sensitive fields nulled — `passportNumberMasked`, `passportIssueDate`,
  `passportExpiryDate`, `dateOfBirth`, `gender`, `entryPoint`, `visaStatus`,
  `emergencyContactName`, `emergencyContactPhone`, `dietaryNotes`, `roomingNotes`,
  `arrivalFlight`, `departureFlight`, `nationality`, `notes` — **zero leaks**.
- raw `passportNumber` = undefined.
- Minimal identity retained: `id`, `firstName`, `lastName`, `title`, `isLead`,
  `fullName`.

## 6. VM / UI safety result
Live-rendered the staging Ops V2 passengers page
(`/operations/v2/{bookingId}?tab=passengers`) as `agent_admin` and `admin`: both **HTTP
200**, no application error, manifest heading present, identity name renders. The redacted
payload maps through the V2 view model without crashing. Also covered by the added
`ops-pax-rooming-vm` unit test (fully-redacted passenger case).

## 7. PR-1 readiness
Unaffected: admin / operations receive the unchanged full payload, so readiness inputs are
identical to pre-PR-3a. The page rendered normally for admin.

## 8. Cleanup result
The temporary fake-PII passenger was deleted (HTTP 200). BK-2026-0002 restored to
baseline — **one passenger (QA Contact, lead), no leftover test data**. Temporary
validation scripts and the secret-bearing variables file were deleted from disk.

## 9. Safety confirmation
- **Production not enabled / unchanged** — no Vercel env changes, no 4gu9 redeploy, no
  Railway prod changes, no flag edits. Production passenger/rooming edit flag
  `NEXT_PUBLIC_OPS_V2_PAX_EDIT` remains OFF; Booking Creation V2 production flags remain
  OFF. (PR-3a redaction is always-on backend hardening — it only reduces PII exposure and
  enables no editing.)
- **Voucher-send allowlist unchanged** — remains `ziad@axisdmc.com` only; supplier email /
  voucher-send untouched.
- **No PII fields editable** in V2; **no finance/pricing** surfaced.
- Documentation only — no code, schema, flag, or environment change in this report.

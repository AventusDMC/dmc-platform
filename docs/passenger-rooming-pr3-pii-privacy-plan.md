# Passenger / Rooming MVP — PR-3 PII Role / Privacy Hardening Plan

**Date:** 2026-07-05
**Status:** Approved plan (documentation only). No code, schema, flag, or environment
change accompanies this document.
**Goal:** Inspect current passenger PII exposure and define exactly how to protect
sensitive passenger fields before enabling V2 passenger/rooming editing in production.

This plan precedes a series of small, **always-on** security-hardening PRs (PR-3a …
PR-3d). It changes no product behavior on its own.

## Decision (confirmed)

- **Full-PII roles:** `admin`, `operations`, `super_admin`.
- **Restricted roles:** `agent_admin`, `agent`, `viewer`, `finance` (and any other
  non-full-PII role).
- **`agent_admin` is treated as restricted / external-facing** for passenger PII. It
  may access Ops V2 where currently allowed, but must **not** receive sensitive
  passenger manifest fields (passport / DOB / emergency / visa / etc.).
- **Do not change global `roles.guard.ts` coalescing.** Avoid broad role-behaviour
  changes. Enforce PII protection with **explicit checks at the data-exposure points**.

## Security stance

- PR-3 is **always-on** security hardening — **not** flag-gated.
- `NEXT_PUBLIC_OPS_V2_PAX_EDIT` remains a **separate** flag and stays **OFF in
  production**.
- **No production enablement** of passenger/rooming editing until PR-3 is complete and
  staging-validated.

---

## 1. Files inspected

| Area | File | What it governs |
| --- | --- | --- |
| Backend detail mapper | `apps/api/src/bookings/bookings.service.ts` (`mapPassengerForList`; applied in the booking-detail method) | Passenger shape returned by `/api/bookings/:id` |
| Passport masking | `bookings.service.ts` (`maskPassportNumber`) | Last-4 masking |
| Export | `bookings.service.ts` (`exportPassengerManifestExcel`, column builders) | Manifest / movement / operational Excel |
| Export gate | `apps/api/src/bookings/bookings.controller.ts` (`GET :id/passengers/export`, `@Roles('admin','operations')`) | Who may export |
| Role model | `apps/api/src/auth/auth.types.ts` (`ROLE_NAMES`), `apps/api/src/auth/roles.guard.ts` (`roleAllows`) | Backend role coalescing |
| FE role helpers | `apps/admin-web/app/lib/auth-session.ts` (`hasRequiredRole`, `canAccessOperations`, `canAccessFinance`) | FE gating |
| V2 route access | `apps/admin-web/app/operations/ops-access.ts` (`isOpsV2Authorized`) | Who reaches V2 ops |
| V2 page gate | `apps/admin-web/app/operations/v2/[bookingId]/page.tsx` (`canEditPassengers`) | Edit gating |
| V2 VM | `apps/admin-web/app/operations/v2/ops-pax-rooming-vm.ts` | Fields rendered in V2 |
| V2 editor | `components/ops/v2/passenger-editor.tsx`, `components/ops/v2/rooming-editor.tsx` | Editable fields |
| Existing PII tests | `apps/api/src/bookings/bookings-operations-core.test.ts` (proposal-v3 passport redaction) | Proposal redaction coverage |

## 2. Current PII exposure found

**Most important finding:** `mapPassengerForList` does
`{ ...passenger, passportNumberMasked: mask(...), passportNumber: undefined }`. It masks
**only** the passport number. **Every other PII field is returned RAW** in the
`/api/bookings/:id` payload:

- **Raw in the wire response:** `dateOfBirth`, `gender`, `entryPoint`, `visaStatus`,
  `passportIssueDate`, `passportExpiryDate`, `emergencyContactName`,
  `emergencyContactPhone`, `dietaryNotes`, `roomingNotes`, `arrivalFlight`,
  `departureFlight`, `nationality`.
- **Masked:** `passportNumber` → `****1234`.

This payload feeds **both** Classic and V2 (`loadBookingDetail`). The V2 **view model
renders only a subset** (masked passport, expiry date, nationality, flights, dietary /
rooming notes — it never reads DOB / gender / emergency / visa / entryPoint), so the
*visible* V2 surface is limited — **but the raw fields still travel over the wire** and
are visible in the browser network tab or to any direct API caller with detail access.

**Export endpoint** (`GET :id/passengers/export`) returns Excel with **fully raw**
passport number, DOB, issue / expiry dates, gender, entry point, visa status, emergency
contact + phone, dietary. No masking, no per-field redaction; the service does **not**
re-check role — it trusts the `@Roles` guard.

## 3. Which roles should see FULL PII

`admin`, `operations`, `super_admin` — internal DMC operations staff who build
manifests and deal with suppliers / government. This matches the existing V2 edit gate
`['admin','operations','super_admin']`.

## 4. Which roles should see MASKED / LIMITED PII

No masked-middle tier for the MVP — it adds branching for little value. `agent_admin`
goes into the **no-PII** bucket (§5) rather than a partial tier.

## 5. Which roles should see NO PII

`viewer`, `agent`, `finance`, and (confirmed) `agent_admin`. `viewer` / `agent` already
receive 403 on these endpoints (no `admin`). `finance` is excluded from
`@Roles('admin','operations')` and from `canAccessOperations`. `agent_admin` is the live
gap (see §6).

## 6. `agent_admin` classification → RESTRICTED (confirmed)

Two coalescing rules quietly promote `agent_admin` to admin-level PII access today:

- Backend `roles.guard.ts` `roleAllows`: `agent_admin && requiredRoles.includes('admin')`
  → **true**. So `agent_admin` passes `@Roles('admin','operations')` and can call the
  **export** endpoint (raw passport / DOB / emergency) and the **booking-detail**
  endpoint (raw non-passport PII).
- FE `hasRequiredRole` has the identical rule; `isOpsV2Authorized` deliberately includes
  `agent_admin` (to mirror nav visibility), so `agent_admin` can **view** the V2 pax
  tab. It cannot *edit* (edit gate excludes it), but it can *see* the payload.

Since `canAccessOperations` / `canAccessFinance` both **exclude** `agent_admin`, the
intent is an agency / partner-facing admin, **not** a DMC ops insider. **Decision:
treat `agent_admin` as restricted** for traveler PII. `agent_admin` keeps its current
Ops V2 access but no longer receives sensitive manifest fields.

## 7. API / backend changes needed → YES (core of PR-3)

Do **not** modify `roles.guard.ts` global coalescing (it affects every
`@Roles('admin')` endpoint — too broad, high blast radius). Instead add an **explicit,
additive PII check** at the exposure points:

1. **Detail redaction (PR-3a):** thread the actor role into `mapPassengerForList` (the
   detail method already has `actor` for company scoping) and redact the sensitive
   fields to `null` / omit them unless the role is in
   `PII_FULL_ROLES = ['admin','operations','super_admin']`. Keep passport masked for
   full-PII roles as today.
2. **Export gating (PR-3b):** add an explicit full-PII assertion inside
   `exportPassengerManifestExcel` (or a dedicated guard/decorator on the route) so
   `agent_admin` is refused even though it satisfies `@Roles('admin')`.
3. Introduce one shared constant `PII_FULL_ROLES` used by both, so there is a single
   source of truth.

Note: redaction at the detail mapper also affects **Classic** (same endpoint). For
`admin` / `operations` (full-PII) Classic is unchanged; only a restricted role viewing
Classic would see redaction — the desired behaviour.

## 8. FE VM / UI changes needed → MINIMAL (defense-in-depth)

- The V2 VM already omits DOB / gender / emergency / visa / entryPoint, so with backend
  redaction the FE needs little.
- Optional (PR-3d): compute `canSeeFullPii` server-side and (a) hide the export
  affordance for restricted roles, (b) optionally drop passport-expiry / nationality
  columns for restricted roles.
- Editor unchanged (already non-PII only). No new editable PII.

## 9. Export gating changes → YES (PR-3b)

Explicit full-PII enforcement in the export path (handler-level check or dedicated
guard), returning 403 for `agent_admin`. Apply the same check to any sibling
manifest / movement / operational export route.

## 10. Audit / log safety requirements (PR-3c)

- Verify passenger create / update audit metadata does **not** persist raw
  `passportNumber` / `dateOfBirth` / emergency values in before/after diffs; redact in
  the audit-metadata builder if it does. (PR-2b edits only non-PII fields, so immediate
  risk is low, but the guard should exist before prod enablement.)
- Ensure no PII is written to application logs in the passenger / export paths.

## 11. Tests to add / update

- **Backend detail:** `mapPassengerForList` redacts sensitive fields for a restricted
  role; retains them for `admin` / `operations` / `super_admin`; passport stays masked
  for full-PII roles.
- **Export:** 403 for `agent_admin`; 200 for `admin` / `operations` / `super_admin`;
  raw passport present only in the authorized Excel.
- **Role constant:** `PII_FULL_ROLES` excludes `agent_admin`, `viewer`, `agent`,
  `finance`.
- **Audit:** passenger audit metadata contains no raw passport / DOB.
- **FE:** page hides export / PII columns when `!canSeeFullPii`; existing render tests
  still pass; V2 VM handles null / redacted fields safely.
- Reuse the existing proposal-redaction tests as the pattern; extend to booking detail.

## 12. Risks / blockers

1. **Classic impact** — detail redaction is shared with Classic. Correct for restricted
   roles, but confirm no internal workflow depends on `agent_admin` seeing PII in
   Classic.
2. **Payload shape change** — restricted roles get `null` / omitted fields; ensure no FE
   code assumes those keys are present (V2 VM is safe; spot-check Classic passenger tab).
3. **Always-on stance** — the redaction / export gating is a security fix and ships
   always-on; the prod-editing flag stays independent and OFF.
4. **Guard temptation** — resist "fixing" via `roles.guard.ts`; a global change risks
   unrelated `@Roles('admin')` endpoints.

## 13. Recommended slice breakdown

- **PR-3a — Backend detail redaction:** `PII_FULL_ROLES` + role-threaded
  `mapPassengerForList` redaction + tests. *(Highest value: closes the wire-payload leak
  at the source.)*
- **PR-3b — Export gating:** explicit full-PII enforcement on manifest export (exclude
  `agent_admin`) + tests.
- **PR-3c — Audit PII-safety:** redact raw passport / DOB from passenger audit metadata
  + tests.
- **PR-3d — FE polish (optional):** `canSeeFullPii`, hide export button / residual PII
  columns for restricted roles.

Sequence 3a → 3b → 3c → 3d, each a flag-free security hardening, staging-validated
before considering production editing enablement.

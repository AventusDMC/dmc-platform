# Passenger / Rooming MVP — PR-3c Audit Metadata PII Safety Plan

**Date:** 2026-07-05
**Status:** Approved plan (documentation only). No code, schema, flag, or environment
change accompanies this document.
**Goal:** Inspect passenger create / update / delete / set-lead and rooming audit
behaviour to confirm no raw passenger PII is stored in audit metadata, and lock the safe
behaviour in with regression tests.

Headline finding: **audit metadata is already PII-safe; PR-3c is a test-only regression
lock-in — no backend behaviour change is needed.** See
`docs/passenger-rooming-pr3-pii-privacy-plan.md`.

---

## Files inspected

| Area | File | What it governs |
| --- | --- | --- |
| Passenger audit (create/update/delete/set-lead) | `apps/api/src/bookings/bookings.service.ts` (~3742, 3889, 3951, 4001) | What is written to the audit row |
| Rooming audit (create/update/delete/auto-assign/assign/unassign) | same (~4064, 4161, 4235, 4289, 4389, 4471) | Same |
| Audit value formatters | same — `formatPassengerAuditValue` (9388), `formatRoomingEntryAuditValue` (9398) | The only serializers feeding audit `oldValue` / `newValue` |
| Booking audit sink | same — `createAuditLog` + `BookingAuditLog` model (`apps/api/prisma/schema.prisma`) | Columns actually persisted |
| Global audit sink | `apps/api/src/audit/audit.service.ts` (`log`, `auditLog` model) | Has a `metadata` JSON field |
| Ops V2 Activity display | `apps/admin-web/app/operations/v2/ops-activity-vm.ts` | How audit is rendered in V2 |
| Existing audit tests | `apps/api/src/audit/audit-trail-integrity.test.ts` (376, 463) | Current coverage |

## Current audit behaviour found

1. **All passenger + rooming mutations write to `BookingAuditLog` via `createAuditLog`**,
   and that model has **no `metadata` JSON column**. Its only content-bearing columns are
   `oldValue`, `newValue`, `note` (all `String?`), plus `action` / `actor`.
2. **The only serializers are name / room-only:**
   - `formatPassengerAuditValue(p)` returns `"{title} {firstName} {lastName}"` +
     `" (lead)"` — nothing else. It reads only `title` / `firstName` / `lastName` /
     `isLead`, even though the passed object carries all PII.
   - `formatRoomingEntryAuditValue(r)` returns `"{roomType|Room N} | {occupancy}"`.
3. **Per-action `oldValue` / `newValue`:** create/update/delete/set-lead → name string;
   rooming CRUD → room label; assign/unassign → `"{name} assigned to {room}"`;
   auto-assign → a count message (`"Auto-allocated N passengers into M rooms."`). **No
   audit call passes a `note` or any raw field.**
4. **The global `AuditService.log` (which does have `metadata`) is not used by any
   passenger/rooming mutation** — it is used for `booking.updated`, `payment.confirmed`,
   `document.generated`, etc.
5. **Display layer is also guarded:** `ops-activity-vm.ts` documents "Never dumps raw JSON
   oldValue/newValue" and redacts values that look financial / sensitive.
6. **Existing test:** `audit-trail-integrity.test.ts:376` already asserts create-passenger
   audit contains the name and **not** the passport (`P9988776`); another test asserts
   `document.generated` metadata carries no passport / finance.

## PII leak risk found

**None currently.** By construction, none of the 15 PII fields (`passportNumber`,
`passportIssueDate`, `passportExpiryDate`, `dateOfBirth`, `gender`, `entryPoint`,
`visaStatus`, `emergencyContactName`, `emergencyContactPhone`, `dietaryNotes`,
`roomingNotes`, `arrivalFlight`, `departureFlight`, `nationality`, `notes`) reach an audit
row. The audit stores identity (name) + room labels + counts only.

The **latent** risk is regression-only: because `formatPassengerAuditValue` receives the
*full* passenger object (all PII), a future change that (a) spreads the object into
`newValue`, (b) adds a `note` / `metadata` with the raw entity, or (c) switches these
mutations to `AuditService.log` with `metadata: passenger`, would silently leak. Current
coverage catches only *passport-on-create* — it does not cover
update/delete/set-lead/rooming/assign/auto-assign, nor the other 14 fields.

## Proposed redaction strategy

No redaction needed — the data is already safe. PR-3c is a **regression-hardening +
verification** task: lock in the current safe behaviour with explicit, comprehensive tests
so any future leak fails CI. Optionally add a thin defensive guard / documenting comment.

## Proposed files to change

- **Primary (tests only):** `apps/api/src/audit/audit-trail-integrity.test.ts` (or a new
  focused `passenger-rooming-audit-pii.test.ts`) — extend coverage across all mutation
  types and all 15 fields.
- **Optional defensive (small, backend):** a shared `assertNoPassengerPii(rowString)` test
  helper, or a one-line documenting comment near `formatPassengerAuditValue` recording the
  "name-only, never spread the passenger" contract. Recommendation: keep it **test-only**;
  skip the runtime guard unless belt-and-suspenders is wanted.

## Tests to add / update

Seed each mutation with a passenger / room carrying **all 15 fake PII fields**, capture the
`bookingAuditLog.create` rows, and assert:

- `createPassenger` — name present; none of the 15 field values present (extends the
  existing test).
- `updatePassenger` — old + new names present; no PII values.
- `deletePassenger` — old name present; no PII.
- `setLeadPassenger` — names present; no PII.
- `createRoomingEntry` / `updateRoomingEntry` / `deleteRoomingEntry` — room label +
  occupancy only; no PII.
- `assignPassengerToRoom` (create + moved) / `unassignPassengerFromRoom` —
  `"{name} assigned to {room}"`; no PII.
- `autoAssignRooming` — count message only; no PII.
- One consolidated assertion: `JSON.stringify(allAuditRows)` matches **none** of the 15
  fake PII sentinel values.

## Whether a backend change is needed

**No behavioural backend change is required.** The current implementation is already
PII-safe. PR-3c is best delivered as **tests only** (plus an optional documenting comment).
No redaction will be added that is not needed. If a real leak were found during
implementation, it would be fixed and reported — but none is expected based on this
inspection.

## Risks / blockers

1. **Test harness reuse** — the `createBookingsService` mock in
   `audit-trail-integrity.test.ts` already supports `bookingPassenger` + `bookingAuditLog`;
   rooming tests will need `bookingRoomingEntry` / `bookingRoomingAssignment` mocks added
   to the transaction stub (the rooming methods have more DB touchpoints, e.g. capacity
   lookups, to stub). Low effort.
2. **False confidence if scoped too narrowly** — the value of PR-3c is breadth; testing
   only create (as today) leaves the regression gap. The plan covers every mutation + all
   15 fields.
3. The unrelated `bookings-operations-core` readiness baseline failure is separate and out
   of scope.
4. No schema / flag / production / finance / voucher impact.

## Recommended slice breakdown

PR-3c is small; one PR is fine. If splitting is preferred:

- **PR-3c-1 — Passenger audit PII tests** (create/update/delete/set-lead, all 15 fields).
- **PR-3c-2 — Rooming audit PII tests** (CRUD + assign/unassign/auto-assign) — needs the
  extra rooming mocks.

Recommendation: **single test-only PR** covering both, since they share the sentinel-value
assertion helper.

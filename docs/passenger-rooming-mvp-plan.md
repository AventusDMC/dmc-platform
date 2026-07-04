# Passenger / Rooming MVP — Plan

**Date:** 2026-07-04
**Status:** Plan only. No code, schema, flag, or environment change. Defines the minimum passenger +
rooming functionality required before a V2-first live launch.
**References:** `docs/booking-creation-v2-slice-1-plan.md`,
`docs/booking-creation-v2-production-acceptance.md`.

**Grounding (already in the codebase):** the data model is essentially complete. `BookingPassenger`
already has firstName, lastName, title, gender, dateOfBirth, nationality, passportNumber,
passportIssueDate, passportExpiryDate, arrival/departure flight, entryPoint, visaStatus, emergency
contact name/phone, dietaryNotes, roomingNotes, isLead, notes. `BookingRoomingEntry` has roomType,
occupancy (enum), notes, sortOrder, with a `BookingRoomingAssignment` join linking passengers to
rooms. CRUD endpoints exist (passengers create/edit/delete/set-lead/export; rooming
create/auto-assign/edit/delete/assignments). The MVP is therefore mostly **workflow, validation,
gating, and display** — not new schema.

---

## 1. Current conversion foundation behavior
- Conversion seeds a foundation: **one lead passenger** from the quote's contact snapshot, and
  **rooming entries derived from `roomCount`**, linked to that lead.
- Pax counts (`adults`/`children`) carry from the accepted-version snapshot; the booking knows *how
  many* travelers, but only the **lead** exists as a named passenger — the rest are unnamed headcount.
- Richer fields (passport, DOB, flights, dietary) exist on the model but are empty until edited.
- Pax counts remain **Classic-owned** (V2 does not change adults/children); passenger/rooming **edit**
  already shipped in V2.

## 2. Minimum passenger fields
- **firstName, lastName** (required).
- **title / gender** (voucher + manifest courtesy).
- **nationality** (manifest / immigration).
- **passportNumber, passportExpiryDate** (border + supplier manifests).
- **isLead** (exactly one per booking).
- Capture-if-available (non-blocking): DOB, passportIssueDate, flights, entryPoint, visa, emergency
  contact, dietary.

## 3. Minimum rooming fields
- **roomType** (DBL/TWN/SGL/TPL) and **occupancy** (enum).
- **Assignments** (which passengers occupy which room).
- **notes** (bedding/adjoining) optional.
- Room entries should total to the booking's `roomCount`.

## 4. Lead passenger rules
- Exactly **one** lead per booking; conversion seeds it from the contact.
- Lead is the default voucher/comms name and the manifest primary.
- `set-lead` must **atomically demote** the previous lead (no zero-lead / two-lead states).
- Deleting the lead is blocked or forces reassignment.

## 5. Room count vs pax count warnings
- **Soft, non-blocking warnings** (never hard errors) at launch:
  - Sum of room occupancies != total pax (adults + children).
  - Rooms created != booking `roomCount`.
  - Unassigned passengers or empty rooms.
- Counts are Classic-owned and snapshotted, so V2 **reconciles and warns** — it does not mutate counts.

## 6. Passport expiry / missing passport warnings
- Capture passportNumber + passportExpiryDate.
- **Expiry warning:** flag if a passport expires within **6 months of travel end** — advisory badge,
  not a blocker.
- **Missing-passport advisory** per passenger (needed for supplier/immigration manifests).
- Passport is never required to *create* a booking; it is an operational-readiness item.

## 7. Manual entry requirements
- Add / edit / delete passenger rows in Operations V2 (endpoints exist).
- Inline set-lead.
- Create / edit rooms, assign / unassign passengers, `auto-assign` helper.
- Low-friction, keyboard-friendly manifest entry for an ops user.

## 8. Role / PII privacy requirements
- Passenger PII (passport, DOB, emergency contact) is **sensitive** — gate read/write to
  **admin/operations**; exclude viewer/finance from PII fields (mirror the finance-VM redaction
  pattern already used in Operations V2).
- No PII in logs, audit metadata, URLs, or client-facing proposal/voucher previews beyond what is
  operationally necessary.
- Passenger export gated + audited.

## 9. Operations V2 display requirements
- Pax/Rooming tab: passenger list (lead badge, name, nationality, passport + expiry status), rooming
  grid (rooms, occupancy, assigned passengers), and a **readiness strip** (manifest complete? rooming
  complete? passport warnings?).
- Surface the section-5 reconciliation warnings and section-6 passport advisories as badges.
- Read-only for non-privileged roles; edit affordances for admin/operations.

## 10. Voucher impact
- Vouchers reference the **lead** (and, for hotels, the rooming breakdown). Minimum for a correct
  voucher: lead name + room types/occupancy.
- Full per-passenger passport lists are **not** required for the voucher MVP (supplier-manifest
  concern, handled separately).
- No change to voucher-send gating / allowlist (out of scope).

## 11. Pricing-inert guarantee
- Passenger/rooming edits are **pricing-inert** — they must not re-price or alter any finance total
  (counts are snapshot-owned). This is the critical invariant, protected by explicit regression tests.
- Booking status / finance summary unaffected by manifest edits.

## 12. Must-have before launch
- Conversion seeds lead + rooming foundation (done).
- Manual passenger CRUD + set-lead in Operations V2 (done — verify UX).
- Rooming CRUD + assignments + auto-assign (done — verify UX).
- Minimum fields (section 2) capturable; passport + expiry warning (section 6).
- Room-vs-pax reconciliation **warnings** (section 5).
- Role / PII gating (section 8).
- Pricing-inert guarantee (section 11).

## 13. Post-launch items
- CSV/XLSX passenger **import** (mirrors the existing export).
- Bulk edit; per-passenger flight/visa detail; dietary aggregation.
- Advanced rooming (bedding matrices, adjoining, child-age hints).
- Full per-passenger passport enforcement on supplier manifests.
- Passenger self-service / portal capture.

## 14. Recommended build slices (PR-1 to PR-4)
- **PR-1 — Readiness + validation:** room-vs-pax reconciliation warnings + passport-expiry advisory +
  Operations V2 readiness strip (read-only signals; no schema).
- **PR-2 — Manual-entry UX hardening:** complete add/edit/delete + set-lead + rooming assign flows;
  enforce single-lead + delete-lead guard.
- **PR-3 — PII role gating:** restrict passport/DOB/emergency fields to admin/operations; redact
  elsewhere; gate export.
- **PR-4 (post-launch) — Import:** CSV/XLSX passenger import with preview + validation.
- Each slice flag-gated, additive, no Classic change, pricing-inert.

## 15. Acceptance criteria and test plan

**Acceptance criteria**
- Converting a quote yields a lead passenger + rooming entries matching `roomCount`.
- Ops user can add/edit/delete passengers and set lead; exactly one lead always.
- Ops user can create rooms + assign passengers; auto-assign works.
- Passport-expiry advisory fires within 6 months of travel end; missing-passport advisory shows.
- Room-vs-pax mismatch shows a **warning**, never blocks.
- Non-privileged roles cannot see/edit PII.
- No manifest edit changes any finance total or triggers re-pricing.
- No email sent; allowlist untouched.

**Test plan**
- **Unit:** reconciliation-warning logic, passport-expiry rule, single-lead invariant, occupancy math
  (pure functions).
- **Integration (mocked Prisma):** conversion foundation (lead + rooming), CRUD endpoints, set-lead
  atomicity, role gating returns 403 for viewer/finance on PII.
- **Pricing-inert regression:** edit passengers/rooming, then assert finance summary + totals
  unchanged.
- **Staging E2E:** on a converted staging booking, add passengers, assign rooms, trigger a
  passport-expiry warning, confirm read-only for a viewer role, confirm no re-price.

## Risks
- **PII leakage** (highest priority) — mitigate with strict role gating + redaction.
- **Pricing drift** — a manifest edit accidentally recalculates; mitigate with pricing-inert tests.
- **Lead-state corruption** — zero/multiple leads; mitigate with atomic set-lead + delete guard.
- **Count desync** — Classic-owned counts diverge from the manifest; keep warnings advisory, not
  blocking, to avoid stranding bookings.
- **Scope creep** — import/portal pulled into MVP; keep them post-launch.
- **Manifest completeness expectations** — set expectations that MVP captures-if-available; full
  supplier-manifest passport enforcement is a fast-follow.

---

**Bottom line:** the schema and CRUD already exist; the MVP is **validation + readiness signals + PII
gating + UX hardening + a pricing-inert guarantee** — a small, flag-gated set of additive slices
(PR-1..PR-3 for launch, import PR-4 after). No Classic change, and no schema change required for the
must-haves.

# Booking Creation V2 — Production Pilot Preflight Plan

**Date:** 2026-07-04
**Status:** Plan only — nothing enabled, no code, no production change. Both production flags
remain OFF. Voucher-send allowlist unchanged (`ziad@axisdmc.com` only).
**References:** `docs/booking-creation-v2-pilot-plan.md`,
`docs/booking-creation-v2-launch-control.md`,
`docs/booking-creation-v2-staging-acceptance.md`.

Feature under test: Quote Builder V2 → **Create Booking** → Operations V2, behind
`QUOTE_BOOKING_CREATE` (backend) / `NEXT_PUBLIC_QUOTE_BOOKING_CREATE` (frontend),
both default OFF / fail-closed. This plan covers a **single-booking, single-operator**
production pilot only — not a production-wide enablement.

---

## 1. Production environment targets

- **Backend (API):** the production Railway API service (production runtime environment), where
  `QUOTE_BOOKING_CREATE` would be set as a runtime env var. This flag is the kill switch.
- **Frontend (admin-web):** the production admin-web Vercel project (production alias / main domain),
  where `NEXT_PUBLIC_QUOTE_BOOKING_CREATE` would be set. Build-time — requires a fresh production
  build/redeploy to take effect.
- **Database:** the production DB. No schema or migration change is involved in either direction.
- **Distinct from staging:** staging stays enabled and untouched; this pilot is a separate,
  production-scoped, single-booking exercise.

## 2. Exact flags required (NOT enabled by this plan)

Both must be ON for the end-to-end path (fail-closed otherwise). **Neither is set now.**

- **Backend:** `QUOTE_BOOKING_CREATE=true` on the production API, then restart/redeploy
  (runtime flag — the kill switch).
- **Frontend:** `NEXT_PUBLIC_QUOTE_BOOKING_CREATE=true` on production admin-web, then trigger a
  fresh production build (inlined at build time — an env change alone does nothing until rebuilt).
- **Enable order (when authorized):** backend first (route live, no UI), then frontend (card appears).
- **Everything else unchanged** — especially all voucher/send flags and the send allowlist.

## 3. Candidate quote requirements

- Status **ACCEPTED or CONFIRMED** with a populated **`acceptedVersionId`** (conversion precondition).
- **Latest revision** (no newer revision exists).
- **Not already converted** (no existing primary booking: `quoteId` + `amendedFromId` null).
- **Fully priced** (item cost/sell present) so the finance snapshot is meaningful.
- Ideally a **small mix of service types** (hotel/transport/activity/guide/meal) to exercise mapping;
  **USD** for the first pilot (non-USD only after a non-USD staging pass — the label logic is fixed
  but has only been staging/unit-validated).
- Few items / few pax to keep the pilot legible.

## 4. How the production quote will be picked — two options

- **Option A (recommended, lowest client risk): an approved production dummy quote.** Use the existing
  user-approved production test quote **Q-2026-0081**. It must first be confirmed to satisfy §3
  (ACCEPTED/CONFIRMED + `acceptedVersionId` + latest + unconverted + priced); if it is in DRAFT/SENT it
  must be Accepted first (a separate, explicitly-approved prepare step), or a fresh approved dummy
  created. This avoids converting a real client's quote during a first pilot.
- **Option B: one real ACCEPTED/CONFIRMED client quote**, selected deliberately with the operator,
  meeting §3 exactly.
- **Selection method (read-only):** a GET-only probe against the production DB (the same safe method
  used earlier — no writes) enumerating candidates via
  `status IN (ACCEPTED, CONFIRMED) AND acceptedVersionId IS NOT NULL`, with `newer_revisions = 0` and
  `existing_bookings(quoteId + amendedFromId null) = 0`, then filtered to priced + small + USD.
  - The known production external-package quotes are real client CONFIRMED quotes — **not** first-pilot
    candidates unless external-package conversion is specifically chosen with sign-off.
- **Decision gate:** the specific quote (id + ref) is approved before anything is enabled.

## 5. Production quote preflight checklist (per candidate, before enabling)

- [ ] Status ACCEPTED/CONFIRMED and `acceptedVersionId` set.
- [ ] Latest revision (no newer revision).
- [ ] No existing primary booking (unconverted).
- [ ] Every item priced (cost/sell present); pricing snapshot totals sane.
- [ ] Currency confirmed (USD for first pilot).
- [ ] Pax/rooming/contact present enough for a legible booking (lead-passenger foundation).
- [ ] Quote reviewed with the single operator; the exact quote is signed off.

## 6. Supplier-data readiness checklist (per candidate)

Unresolved/incompatible suppliers do **not** block conversion but create "Needs Assignment" rows.

- [ ] Each priced item's supplier **resolves to a catalog Supplier record** (else id dropped at
      conversion; name retained, row unassigned).
- [ ] Each supplier's **`type` matches its operational bucket** for later assignment (compatibility
      guard = regex on `type + name`: HOTEL↔hotel, TRANSPORT↔transport, GUIDE↔guide, ACTIVITY↔activity,
      DINING↔restaurant/meal/service). Mismatches are expected-and-correct; just flag them.
- [ ] Each item's category maps to the intended bucket (meal→DINING, external→EXTERNAL_PACKAGE, guide
      timing preserved).
- [ ] Each pilot supplier has a valid operational email on file (needed later for voucher, **not** for
      conversion).
- [ ] Note (do not block on): production transport/guide/dining supplier-type coverage, so
      post-conversion assignment can be exercised if desired.

## 7. Expected test flow (production, single operator, when authorized)

1. **QB V2** — open the approved quote as an admin/operations user; confirm the **Create booking** card
   appears (flag ON + role + status).
2. **Create Booking** (single click) — expect success: booking reference + "Open in Operations V2".
   Record the reference.
3. **Duplicate guard** — re-click / reload; expect "Booking already exists", idempotent
   (**no** second booking).
4. **Operations V2** — verify header, service rows (correct type buckets + days), Finance tab
   (quoted/cost/margin + correct currency label), snapshot preserved.
5. **Supplier assignment** (optional) — assign one operational supplier to one compatible row; confirm
   it persists + audits.
6. **Stop before voucher send** — voucher preview/PDF only if separately decided; no broad send,
   allowlist untouched.

## 8. Rollback plan

- **Instant kill (primary):** set backend `QUOTE_BOOKING_CREATE=false` (or remove it) and restart the
  production API → conversion disabled immediately; any visible card fails closed (`feature_disabled`).
  No rebuild, no migration.
- **Full UI rollback:** set `NEXT_PUBLIC_QUOTE_BOOKING_CREATE=false` on production admin-web and
  redeploy to hide the card.
- **Data:** no schema change either way. A booking already created is left as-is (roll forward).
  Removing a pilot booking (dummy-quote path) is a separate, deliberately-reviewed step — never part of
  a flag rollback.

## 9. Evidence to capture

- Screenshots: Create Booking card; success state (reference + CTA); duplicate "already exists" state;
  Operations V2 service rows; Finance tab (currency + totals); (if done) supplier assignment.
- The booking reference (+ internal id for follow-up).
- Audit entries for `booking.created` + `quote.booking.created` (sanitized — ids only, no PII/email).
- Network evidence: create-booking request returns success; no supplier-email call fired by conversion.
- A short pass/fail note against §10.

## 10. Go / no-go criteria

**GO if all true:** booking created with correct reference + working source-quote link; snapshot
preserved (totals + currency correct); service rows mapped correctly per type/day; visible in
Operations V2; duplicate re-click returns the existing booking (no second); audit events written +
sanitized; no 500s; no supplier emails sent by conversion.

**NO-GO / halt if any:** conversion 500s or malformed/mis-mapped rows; finance currency/totals wrong;
duplicate protection fails; any unexpected outbound email; the voucher-send allowlist found widened.

## 11. Safety confirmation (current state)

- **Staging flags ON:** `QUOTE_BOOKING_CREATE=true` (staging API),
  `NEXT_PUBLIC_QUOTE_BOOKING_CREATE=true` (staging admin-web).
- **Production flags OFF** — neither flag enabled; no production change made.
- **Voucher-send allowlist unchanged** — `ziad@axisdmc.com` only; no voucher flags enabled; supplier
  email / voucher-send behavior untouched.
- No production booking created or converted; no code, no schema, no flag/env change.

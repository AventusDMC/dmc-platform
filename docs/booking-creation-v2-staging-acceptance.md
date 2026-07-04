# Booking Creation V2 — Staging Acceptance Report

**Date:** 2026-07-04
**Environment:** Staging only (staging admin-web + staging API + staging DB)
**Verdict:** ✅ Core Booking Creation V2 path accepted on staging
**Scope of change:** Documentation only. No code, schema, flag, or environment change accompanies this report.

Feature under test: Quote Builder V2 → **Create Booking** → Operations V2, behind
`QUOTE_BOOKING_CREATE` (backend) / `NEXT_PUBLIC_QUOTE_BOOKING_CREATE` (frontend),
both default OFF / fail-closed. Enabled on **staging only** for this acceptance run.

References: `docs/booking-creation-v2-slice-1-plan.md`,
`docs/booking-creation-v2-launch-control.md`,
`docs/booking-creation-v2-pilot-plan.md`.

---

## 1. Staging quote candidate — Q-2026-0001

"QA Quote Builder V2", built in staging as an Admin user. Convertibility preconditions all met:

- Status **ACCEPTED** with **`acceptedVersionId` populated** (Version 1).
- Latest revision, **not previously converted**.
- Fully priced; currency **USD**; 2 adults / 1 room; total **$552**.
- Contact attached (lead-passenger foundation).
- 5 priced services spanning hotel, transfer, guide, activity, and meal (mixed types, to exercise mapping).

## 2. Created booking — BK-2026-0002

Conversion produced booking reference **BK-2026-0002**, linked to its source quote and accepted version.

## 3. Core conversion path

A single click on the Quote Builder V2 "Create booking" card produced the success state with a
booking reference and an "Open in Operations V2" call-to-action. No 500s, no unhandled errors, and
**no email was sent by conversion** (Create Booking creates database rows only). The booking is
visible in Operations V2.

## 4. Service rows mapped correctly

Five service rows were created in day order, each in the correct operational bucket:

| Service row        | Operation type   | Day    |
| ------------------ | ---------------- | ------ |
| QA Hotel Service   | **HOTEL**        | Day 1  |
| QA Transfer Service| **TRANSPORT**    | —      |
| QA Guide Service   | **GUIDE**        | —      |
| QA Meal Service    | **DINING**       | —      |
| QA Activity Service| **ACTIVITY**     | Day 1  |

The DINING bucket (meal → DINING) and the preserved GUIDE / ACTIVITY classification confirm the
service-mapping hardening is active end-to-end.

## 5. Finance / currency result

| Metric         | Value        |
| -------------- | ------------ |
| Quoted total   | **USD 552.00** |
| Realized cost  | **USD 500.00** |
| Margin         | **USD 52.00** |
| Margin percent | **9.42%**    |
| Currency label | **USD** (correct) |

The correct USD label validates the currency-label hardening
(snapshot → finance summary → frontend view-model), read-only and snapshot-sourced.

## 6. Duplicate / idempotent guard

Returning to the builder and re-triggering Create Booking (and a page reload) returned
**"Booking already exists"** with an idempotent success response and **no second booking** created.

## 7. Supplier-assignment retest

The operational supplier-assignment flow was retested on BK-2026-0002.

- Assigned an **existing compatible Hotel-typed supplier** (TEST Hotel Supplier A) to the
  **QA Hotel Service** (HOTEL) row.
- The assignment **saved and persisted after a full reload**.
- "Needs attention" counters updated correctly (Suppliers unassigned decreased; Confirmations pending increased).
- An earlier rejection on the hotel row was the **compatibility guard working correctly** against a
  supplier whose catalog type did not match the operational bucket — this was **catalog-data behavior,
  not a Booking Creation V2 defect**.

## 8. Audit evidence (sanitized)

The supplier assignment wrote a booking audit entry:

```json
{
  "action": "booking_service_supplier_assigned",
  "oldValue": "UNASSIGNED: unassigned",
  "newValue": "ASSIGNED: TEST Hotel Supplier A",
  "createdAt": "2026-07-04T08:34:54Z",
  "actor": "<internal admin user id — sanitized, no PII/email>"
}
```

Conversion additionally writes `booking.created` and `quote.booking.created` audit markers with
sanitized metadata (identifiers only — no PII, no email).

## 9. Remaining non-blocking staging data gaps

These are staging-data / separate-scope items. **None blocks the Booking Creation V2 core path.**

1. Staging catalog lacks **transport / guide / dining** supplier types, so those rows cannot yet be
   assigned to matching operational suppliers until per-type supplier records are created.
2. Service rows show **"Missing operational date or time"** — a separate operational-detail
   completeness item, unrelated to supplier assignment.
3. **Voucher Preview / PDF / Send** are gated by **separate Operations V2 flags** and were not enabled.

## 10. Production-pilot readiness recommendation

The core conversion path (quote → booking → Operations V2, with correct mapping, finance/currency,
idempotency, supplier assignment, and sanitized audit) is **ready for a controlled, single-booking
production pilot**, subject to:

- **Data preconditions first:** one real ACCEPTED/CONFIRMED quote — latest revision, not yet converted,
  fully priced, with suppliers that resolve to catalog records of the correct type. USD is validated;
  a non-USD production pilot only after a non-USD staging pass.
- **Enable order:** backend flag on (redeploy), then frontend flag on (rebuild); single operator, one booking.
- **Out of scope for the pilot:** voucher send, supplier email, and the send allowlist (all unchanged);
  voucher preview/PDF only if separately decided.
- **Kill switch:** backend flag OFF + restart (instant), then frontend flag OFF + redeploy.
- **Not production-wide.** No production enablement without explicit sign-off.

## 11. Safety confirmation

- **Staging flags ON:** `QUOTE_BOOKING_CREATE=true` (staging API),
  `NEXT_PUBLIC_QUOTE_BOOKING_CREATE=true` (staging admin-web).
- **Production flags OFF** — production not enabled; no production change made.
- **Voucher-send allowlist unchanged** — limited to `ziad@axisdmc.com` only; no voucher flags enabled;
  supplier email / voucher-send behavior untouched.
- Created booking **BK-2026-0002 retained** (not deleted).

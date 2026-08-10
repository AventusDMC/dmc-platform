# ERP V2 — Ops-DG-2: Operations Grid Payload Redaction Plan

Planning document. No code, no behavior change. Plans a safe backend redaction /
allowlist strategy for the Ops V2 operations-grid payload so contact/PII-like fields
(notably `driverPhone`) are not shipped to the V2 frontend — **without touching the
Classic-shared endpoint**.

---

## 1. Current payload inventory

`GET /bookings/:id/operations-grid` currently returns a **broad per-service row**
(`bookings.service.ts:1074-1116`).

- **Safe V2-used fields:** `id, order, dayNumber, dayTitle, serviceType, description,
  supplierId, supplierName, assignedSupplierId, assignedSupplierName, assignmentStatus,
  status, operationalDate, operationalTime, voucherStatus, supplierConfirmationStatus,
  pickupLocation, dropoffLocation, nights, mealPlan`.
- **Fields unused by V2:** `assignmentNotes, assignedAt, assignedBy, voucherGeneratedAt,
  supplierConfirmationCode, confirmationReference, confirmationNotes,
  confirmationRequestedAt, confirmationReceivedAt, confirmedBy, assignedVehicleId,
  assignedGuideId, vehicleId, vehicleName, vehiclePlateNumber, driverId, driverName,
  driverPhone, specialRequests`.

## 2. Shared endpoint risk

- The operations-grid **endpoint and admin-web proxy** (`/api/bookings/[id]/operations-grid`)
  are **shared with Classic**.
- The Classic operations page (`app/bookings/[id]/operations/page.tsx:134`, declares
  `driverPhone` at :43) consumes driver/vehicle/notes fields for its dispatch /
  `assign-transport` UI.
- **Therefore, do not strip fields from the shared Classic endpoint.**
- **The Classic response must remain unchanged.**

## 3. V2 consumed field map

The V2 board currently reads **only**:

- `id`
- `order`
- `serviceType`
- `description`
- `dayNumber`
- `dayTitle`
- `status`
- `operationalDate`
- `operationalTime`
- `supplierId`
- `supplierName`
- `assignedSupplierId`
- `assignedSupplierName`
- `assignmentStatus`
- `supplierConfirmationStatus`
- `voucherStatus`
- `mealPlan`
- `nights`
- `pickupLocation`
- `dropoffLocation`

## 4. Sensitive / unused V2 field risk

- `driverPhone` is a **phone/contact** field.
- `driverName` is a **person name**.
- `vehiclePlateNumber` is operational but mildly sensitive.
- `assignmentNotes`, `confirmationNotes`, `specialRequests` may contain **PII or
  internal notes**.
- `assignedBy` and `confirmedBy` are **internal user ids**.
- **No cost/margin/payment fields** were found.
- **No supplier email/phone** was found.
- **No passenger/guest PII** was found in the grid row.
- Passenger data is **separate** from the grid payload (a distinct manifest endpoint).

## 5. Recommended design

- Create a **V2-scoped allowlist-projected operations-grid variant**.
- **Never spread raw service rows.**
- **Keep the Classic/shared endpoint byte-for-byte unchanged.**
- Add either:
  - a `view=v2` backend option, or
  - a dedicated V2 operations-grid route.
- Add a **V2-only admin-web proxy**: `/api/bookings/[id]/v2/operations-grid`.
- Point the V2 board at the V2-safe proxy.
- **No frontend display expansion** in this slice.
- **No behavior changes.**

## 6. Exact V2 fields to keep

`id, order, serviceType, description, dayNumber, dayTitle, status, operationalDate,
operationalTime, supplierId, supplierName, assignedSupplierId, assignedSupplierName,
assignmentStatus, supplierConfirmationStatus, voucherStatus, mealPlan, nights,
pickupLocation, dropoffLocation`.

## 7. Exact fields to remove/redact from the V2 payload

`driverPhone, driverName, driverId, vehicleId, vehicleName, vehiclePlateNumber,
assignedVehicleId, assignedGuideId, assignmentNotes, assignedAt, assignedBy,
confirmationNotes, confirmationReference, supplierConfirmationCode,
confirmationRequestedAt, confirmationReceivedAt, confirmedBy, voucherGeneratedAt,
specialRequests`.

## 8. Compatibility risks

- Classic breakage if the shared endpoint is changed.
- Under-scoping the V2 allowlist and breaking existing V2 controls.
- Backend test drift.
- Read-only invariant must remain green.
- The V2 board should remain display-only and not add new actions.

## 9. Affected files for future implementation

**Backend:**

- `apps/api/src/bookings/bookings.service.ts`
- `apps/api/src/bookings/bookings.controller.ts`
- backend operations-grid V2 projection test

**Frontend:**

- `apps/admin-web/app/api/bookings/[id]/v2/operations-grid/route.ts`
- `app/operations/v2/[bookingId]/page.tsx`
- source-grep / render tests

## 10. Test plan

- Backend V2 projection returns **only** allowlisted fields.
- Backend V2 projection excludes `driverPhone`, `driverName`, vehicle fields, notes,
  `assignedBy`, `confirmedBy`.
- Backend Classic path remains **unchanged**.
- V2 board still renders all rows.
- V2 board labels/details from Ops-DG-1 still work.
- V2 controls still have their required fields.
- Source-grep confirms the V2 page uses the V2 proxy.
- `ops-readonly-invariant` remains green.
- `ops-display-polish` remains green.
- Ops board/render regression remains green.
- `bookings` operations backend regression remains green.
- tsc/build baseline unchanged.
- Staging read-only check confirms `driverPhone` absent from the V2 payload.

## 11. GO / NO-GO

**GO**

- V2-scoped allowlist-projected operations-grid variant.
- V2-only admin-web proxy.
- Point the V2 board to the V2-safe proxy.
- Keep the Classic endpoint unchanged.

**NO-GO**

- Stripping fields from the shared Classic operations-grid endpoint.
- Removing driver/vehicle/contact fields from the Classic path.
- Frontend display expansion in this slice.
- New actions/forms/fetch mutations beyond switching the V2 proxy.
- Voucher/packet/supplier-send changes.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Full no-Classic launch.

## 12. Exact next implementation slice

**Ops-DG-2 implementation:**

- Backend: add explicit allowlist projection for V2 operations-grid rows.
- Backend: expose a V2-scoped variant.
- Backend: test the V2 shape **and** that the Classic shape is unchanged.
- Frontend: add the V2-only proxy.
- Frontend: point the V2 board to the V2 proxy.
- Frontend: no VM/display expansion.
- Tests: source-grep, render, invariant, backend regression.
- Then staging read-only validation and doc reports.

---

*Planning only. No code, no data, no flag/env, no production or staging behavior
change. Classic remains the system of record.*

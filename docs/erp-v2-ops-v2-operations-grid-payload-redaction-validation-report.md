# ERP V2 — Ops-DG-2: V2-Scoped Redacted Operations Grid Payload — Staging Validation Report

**Status: PASS** · Read-only staging validation · No code, schema, flag, env, or data changes.

## 1. Result

- Ops-DG-2 staging validation **passed**.
- The V2 operations-grid payload is **redacted and allowlist-projected** (exactly 20 fields per row).
- The Ops V2 board **consumes the V2-safe payload** via a V2-only proxy.
- The Classic/shared operations-grid endpoint **remains unchanged** (full shape, driver/vehicle/notes retained).
- **No side effects** — every validation call was GET only; the booking is byte-for-byte unchanged.

## 2. Context

- Shipped by **PR #820** (`feat: add redacted Ops V2 operations-grid payload`).
- Backend V2 route: `GET /bookings/:id/v2/operations-grid`
- Admin-web V2 proxy: `GET /api/bookings/:id/v2/operations-grid`
- Classic/shared endpoint (unchanged): `GET /bookings/:id/operations-grid`
- The Classic endpoint must keep the driver/vehicle/notes fields that Classic dispatch consumes.
- Validation was **read-only** — no writes to staging or production.

## 3. Staging deployed commit

- Merge commit: `6e4925af1829492d90979ff50329fae64fa0fd4a` (on `origin/main`).
- **Staging API** (Railway) deployed; compiled `dist` contains:
  - `v2/operations-grid` (in `bookings.controller.js`)
  - `projectOperationsGridRowV2` (in `bookings.service.js`)
  - `getOperationalServiceGridV2` (in `bookings.service.js`)
- **Staging admin-web** (Vercel `dmc-platform-admin-web-staging`) deployed; the Production deploy created at the #820 merge time is **aliased to `dmc-platform-admin-web-staging.vercel.app` (git-main)**.

## 4. Booking used

- `BK-2026-0002`
- id: `635fb212-1a57-443c-a4a2-dee2c8eeb924`
- status: `draft`
- 5 services
- 2 voucher packets
- 0 vouchers
- Existing safe staging booking; **no data created**.

## 5. V2 backend route result

- `GET /bookings/:id/v2/operations-grid` → **200**.
- Envelope keys: `booking`, `passengerManifest`, `rows`.
- **5 rows** present.
- `booking` keys: `id`, `bookingRef`, `status`, `title`.
- `passengerManifest` keys: `status`, `expected`, `received`, `missingRecords`, `incompleteRecords`, `namesPending`, `voucherReady`.

## 6. V2 admin-web proxy result

- `GET /api/bookings/:id/v2/operations-grid` → **200**.
- Content-Type: `application/json`.
- Same envelope (`booking`, `passengerManifest`, `rows`).
- Same **5 redacted rows** (identical allowlist, zero forbidden fields).
- Ops V2 page `loadOperationsGrid` uses the **V2 proxy**.
- Ops V2 page **no longer uses** the Classic/shared proxy for the board grid.

## 7. V2 payload allowlist result

Row-key **union across all 5 rows** was **exactly the 20 allowlisted fields**:

```
assignedSupplierId
assignedSupplierName
assignmentStatus
dayNumber
dayTitle
description
dropoffLocation
id
mealPlan
nights
operationalDate
operationalTime
order
pickupLocation
serviceType
status
supplierConfirmationStatus
supplierId
supplierName
voucherStatus
```

## 8. V2 redaction result

**None** of the following appeared anywhere in the V2 payload:

```
driverPhone, driverName, driverId,
vehicleId, vehicleName, vehiclePlateNumber,
assignedVehicleId, assignedGuideId,
assignmentNotes, assignedAt, assignedBy,
confirmationNotes, confirmationReference, supplierConfirmationCode,
confirmationRequestedAt, confirmationReceivedAt, confirmedBy,
voucherGeneratedAt, specialRequests,
cost, margin, price, payable, supplierPayment, supplierDiscount,
supplier email/phone, passenger/guest PII, passport,
tokens, references, ratePolicies
```

By construction (allowlist copy, never a raw-row spread), no cost/margin/PII/contact/token field can appear.

## 9. Classic/shared endpoint compatibility

- `GET /bookings/:id/operations-grid` → **200**.
- **5 rows**.
- Full **39-field** shape retained.
- Classic-needed fields still present where available:
  - `driverPhone`, `driverName`, `vehicleName`, `vehiclePlateNumber`, `assignmentNotes`, `specialRequests`
  - `driverId`, `vehicleId`, `assignedVehicleId`, `assignedGuideId`
  - `assignedAt` / `assignedBy`
  - confirmation internals (`confirmationNotes`, `confirmationReference`, `confirmationRequestedAt`, `confirmationReceivedAt`, `confirmedBy`)
  - `supplierConfirmationCode`, `voucherGeneratedAt`
- Classic shape was **not redacted or changed**.

## 10. Ops V2 board behavior

- The V2 payload contains **every field the board VM consumes**.
- Five-phase board remains compatible.
- Service rows render.
- Ops-DG-1 curated labels remain compatible.
- Safe secondary detail lines remain compatible.
- Supplier display remains compatible.
- Confirmation / Voucher / Status badges remain compatible.
- Assignment / confirmation / voucher / packet controls unchanged.

## 11. Read-only behavior audit

- No new forms.
- No new inputs/selects.
- No new buttons/actions.
- No POST/PATCH/PUT/DELETE.
- No send/generate paths.
- PR #820 only swapped the board data source (Classic proxy → V2 proxy).
- `ops-readonly-invariant` remains green.

## 12. Side-effect check

- `BK-2026-0002` unchanged.
- status `draft` unchanged.
- services count `5` unchanged.
- voucher packets count `2` unchanged.
- vouchers count `0` unchanged.
- supplier assignments unchanged (2 assigned).
- confirmations unchanged (0 confirmed).
- voucher statuses unchanged (all `NOT_GENERATED`).
- All validation operations were **GET only** — no writes.
- No email/send, no Accept, no invoice, no booking conversion, no voucher/packet send or generate.

## 13. Test / CI confirmation

- Backend V2 grid tests **6/6**.
- Admin-web V2 proxy tests **3/3**.
- Ops regression **69/69**.
- `ops-readonly-invariant` green.
- `tsc` baseline unchanged: **api 16**, **admin-web 9** (no new errors in changed files).
- Vercel checks green.
- `bookings-operations-core` **95/96** — the one failure is a **pre-existing** baseline manifest-readiness assertion, identical with #820 changes stashed, unrelated to and not caused by #820.

## 14. Confirmations

- No data edits.
- No cleanup needed.
- No Accept.
- No invoice.
- No booking.
- No email/send.
- Production unchanged.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.
- Next build slice not started.

## 15. GO / NO-GO

**GO**
- Ops-DG-2 validated on staging.
- Close Ops-DG-2 after this doc merges.

**NO-GO**
- Changing the Classic/shared operations-grid endpoint.
- Removing driver/vehicle/notes fields from the Classic path.
- Exposing `driverPhone`/contact fields in the V2 payload.
- Cost/margin/price/payable/supplier-payment exposure.
- New actions/forms/fetch mutations beyond the V2-safe proxy source.
- Voucher-send / supplier-send behavior changes.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Full no-Classic launch.

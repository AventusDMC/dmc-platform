# Booking Creation V2 — Phase 1 / Slice 1: Implementation Plan

**Date:** 2026-07-03
**Status:** Plan approved. Slice 1A in progress (backend-only V2-scoped conversion route, flag OFF).
**Strategy context:** V2-first live launch. Classic stays a technical fallback/reference only.

---

## Executive summary

The single most important finding: **a complete, robust quote→booking conversion already exists in the backend** — `QuotesService.convertToBooking()` (`apps/api/src/quotes/quotes.service.ts:2345`) — and it already does snapshotting, service mapping, booking-ref generation, duplicate protection, passenger/rooming foundation, and a `booking.created` audit. It is exposed as Classic `POST /quotes/:id/convert-to-booking` with a Classic-only `ConvertToBookingButton.tsx`.

Therefore **Booking Creation V2 is not a from-scratch build.** It is a thin, V2-scoped, flag-gated wrapper + a V2 trigger UI + a clean handoff into Operations V2 — following the *exact* pattern already used for Quote Builder V2 Phase B (Slice 2 add-Activity: new V2 route → service that gates on a flag fail-closed, asserts access, **delegates to the existing Classic service (never forks)**, writes a sanitized audit). This dramatically de-risks Slice 1.

---

## 1. Relevant files found

**Backend — conversion core (reuse, do not fork)**
- `apps/api/src/quotes/quotes.service.ts`
  - `convertToBooking()` :2345 — orchestration, gating, duplicate checks, audit
  - `buildBookingSnapshotFromAcceptedVersion()` :11087 — 6 booking snapshot JSONs
  - `buildBookingServicesFromAcceptedVersion()` :11214 — service mapping loop
  - `buildBookingDayPlanFromAcceptedVersion()` :11526 — booking days
  - `validateBookingOperationalServiceRows()` :11488 — order + archived-route guards
  - `generateNextBookingRef()` :12721 — `BK-{year}-{seq}` codes
  - `resolveAcceptedQuoteVersion()` / public accept flow :1100 — sets `acceptedVersionId`
- `apps/api/src/quotes/quotes.controller.ts` :818 — Classic `POST /:id/convert-to-booking`, `@Roles('admin','viewer','finance')`

**Backend — V2 pattern to mirror (the template)**
- `apps/api/src/quotes/quote-experiences-v2.controller.ts` — V2-scoped controller `@Controller('quotes/:quoteId/v2/experiences')`
- `apps/api/src/quotes/quote-experiences-v2.service.ts` — `assertEnabled()` fail-closed, `assertQuoteAccess()`, delegate, `writeAudit()`
- `apps/api/src/quotes/quote-item-create.flags.ts` — env-flag helper pattern

**Backend — operations/supplier/voucher/audit/roles**
- `apps/api/src/bookings/bookings.service.ts` — operations-grid DTO :576, `assignOperationalSupplier` :753, voucher send :11744
- `apps/api/src/bookings/voucher-send-preview.ts` / `voucher-send.core.ts` / `ops-voucher-send-flags.ts`
- `apps/api/src/audit/audit.service.ts` — generic `log()`
- `apps/api/src/auth/{auth.types.ts,roles.guard.ts,auth.decorators.ts}` — roles + guards

**Frontend**
- `apps/admin-web/app/quotes/[id]/builder-v2/builder-v2-client.tsx` + `components/quote/v2/{quote-builder-shell.tsx, v2-readiness-panel.tsx, quote-summary-sidebar.tsx}`
- `apps/admin-web/app/quotes/[id]/ConvertToBookingButton.tsx` — Classic trigger (reference only)
- `apps/admin-web/app/api/quotes/[id]/convert-to-booking/route.ts` — existing proxy (reference)
- `apps/admin-web/app/operations/v2/{layout.tsx, ops-flag.ts}` + `/operations/v2/[bookingId]` — **handoff destination**

**Tests**
- `apps/api/src/quotes/quotes-booking-conversion.test.ts` — conversion test (node:test, mocked Prisma)
- `apps/api/src/quotes/quote-experiences-v2.service.test.ts` — V2 flag ON/OFF test template
- `apps/admin-web/app/operations/v2/ops-readonly-invariant.test.ts` + `ops-supplier-assign.test.ts`
- `apps/admin-web/app/quotes/[id]/page.test.tsx` — ⚠️ source-grep style

---

## 2. Existing models & routes involved

**Models (all already exist — no schema change in Slice 1):**
- `Booking` — requires `quoteId` + `acceptedVersionId` (both NOT NULL); `bookingRef`, `status` (`BookingStatus`: draft/confirmed/in_progress/completed/cancelled), 6 snapshot JSONs incl. `pricingSnapshotJson`, `amendedFromId` (duplicate-protection key).
- `BookingService` — `sourceQuoteItemId` + `sourceMetadata` Json link back to `QuoteItem`; full operational lifecycle for Ops V2/supplier/voucher.
- `QuoteVersion` — immutable `snapshotJson`; conversion reads the **accepted** version.
- `Quote` — `status` (`QuoteStatus`), `acceptedVersionId`, `bookings[]` back-relation.

**Routes:** Classic `POST /quotes/:id/convert-to-booking`; New `POST /quotes/:quoteId/v2/booking`.

---

## 3. Recommended Booking Creation V2 route/API shape

```
POST /quotes/:quoteId/v2/booking          (NEW, V2-scoped)
  @Roles('admin','operations')            // super_admin overrides; agent_admin≈admin
  Body: {} (empty; conversion is deterministic from accepted version)
  Flag gate (fail-closed): QUOTE_BOOKING_CREATE  → const QUOTE_BOOKING_CREATE_FLAG = 'quote.bookingCreate'
Response 200:
  { bookingId, bookingRef, quoteId,
    opsV2Url: `/operations/v2/${bookingId}`,
    alreadyExisted: boolean }
Errors (typed codes): feature_disabled | quote_not_found | quote_not_convertible
  | missing_accepted_version | booking_exists | conversion_failed
```

New files:
- `apps/api/src/quotes/quote-booking-v2.controller.ts`
- `apps/api/src/quotes/quote-booking-v2.service.ts`
- `apps/api/src/quotes/quote-booking-create.flags.ts`
- Register in `apps/api/src/quotes/quotes.module.ts`
- FE proxy (later slice / if required): `apps/admin-web/app/api/quotes/[id]/v2/booking/route.ts`

**Why a new route, not reusing Classic's:** keeps Classic untouched (fallback safety), lets V2 have its own flag/role/telemetry, matches the established V2 convention. Heavy lifting still delegates into `convertToBooking()`.

---

## 4. Quote-to-booking conversion flow

Delegate — do not reimplement. The V2 service:
1. `assertEnabled()` — fail-closed on `QUOTE_BOOKING_CREATE`.
2. `assertQuoteAccess()` — `requireActorCompanyId`, quote exists, latest-revision, brand-company isolation.
3. **Convertibility pre-check** (clean error before txn): status ∈ {ACCEPTED, CONFIRMED} and `acceptedVersionId` present; else `quote_not_convertible` / `missing_accepted_version`.
4. Duplicate pre-check → `booking_exists` with existing `{bookingId,bookingRef}` and `alreadyExisted:true`.
5. Call `this.quotes.convertToBooking(quoteId, actor)`.
6. Shape V2 response `{ bookingId, bookingRef, quoteId, opsV2Url, alreadyExisted:false }`.
7. Best-effort V2-context audit `quote.booking.created` (`source:'quote_builder_v2'`); underlying `booking.created` still fires from the core.

**Precondition chain:** V2 quote reaches convertibility via Mark-as-Sent (→SENT) then public-proposal Accept (→ACCEPTED, sets `acceptedVersionId`). DRAFT/SENT is **not** convertible — UI must disable the trigger with a reason.

---

## 5. Quote snapshot storage strategy

No new storage. Immutable commercial snapshot = `QuoteVersion.snapshotJson` (accepted version), fanned into the Booking's six columns by `buildBookingSnapshotFromAcceptedVersion()`. Per-service provenance via `BookingService.sourceQuoteItemId` + `sourceMetadata`. Slice 1B = verification + assertions.

---

## 6. Booking status lifecycle recommendation

Keep the enum; **create bookings in `draft`** (core default). Ops V2 owns promotion draft→confirmed. Slice 1 stops at `draft`.

---

## 7. Service mapping rules (already implemented — Slice 1C = validate + pin)

`serviceType` = `item.service.category` (fallback `'other'`); `operationType` = `inferBookingOperationServiceType()`.

| Quote item | → BookingService | Notes |
|---|---|---|
| Hotel (`item.hotel`) | supplier via `hotel.supplierId` | nights/mealPlan on service |
| Transport (`appliedVehicleRate`/`touringRoutePricing`) | supplier from vehicle/route; `vehicleId` set | archived AQ_*/Aqaba-RT rejected |
| Activity (`activityId`/variant) | startTime, pickup, meetingPoint, participant/adult/child counts, reconfirmation | gated by `isActivityService` |
| Guide | via category/operationType | ops fills guide fields later |
| Meals/extras/tickets/external | serviceType from category; TICKET/SERVICE/EXTERNAL_PACKAGE | supplier via `resolveOperationalSupplier` |

Common per row: `operationStatus=PENDING`, `supplierConfirmationStatus=NOT_SENT`, `voucherStatus=NOT_GENERATED`, `status=ready` iff supplier+price resolved else `pending`, `serviceOrder` preserved, `bookingDayId` resolved, `sourceMetadata` populated.

---

## 8. Operations V2 handoff behavior

Return `opsV2Url = /operations/v2/${bookingId}`. New booking appears automatically in `/operations/v2` + `/bookings` (no new read endpoint). V2 UI success → "Open in Operations V2" deep-link; Classic fallback if OPS V2 flag off. Supplier assign + voucher readiness work out-of-the-box (`UNASSIGNED`/`NOT_GENERATED` rows). No change to supplier send / allowlist.

---

## 9. Finance read-only snapshot fields

No new fields. Booking has `pricingSnapshotJson` + `clientInvoiceStatus`/`supplierPaymentStatus`; each service has cost/sell/payable. Ops V2 Finance tab reads read-only. Slice 1E = assert consistency. No accounting.

---

## 10. Duplicate conversion protection

Already enforced in-txn (`quotes.service.ts:2380–2418`) on `quoteId`/`acceptedVersionId` with `amendedFromId=null`. Slice 1F: add a typed `booking_exists` pre-check returning existing ref + `alreadyExisted:true`; keep in-txn check as race-safe backstop. Optional DB partial-unique index needs a migration → out of Slice-1 no-schema scope unless approved.

---

## 11. Role gating

`RolesGuard`/`roleAllows`: `super_admin` overrides; `agent_admin`≈`admin`. **Decision: V2 route `@Roles('admin','operations')`** (drop legacy `viewer`/`finance`).

---

## 12. Audit events

Core emits `booking.created`. Add best-effort V2 marker `quote.booking.created`, metadata `{ quoteId, bookingId, bookingRef, source:'quote_builder_v2' }`. Sanitized only; never blocks.

---

## 13. Error handling

Typed `BadRequestException({ code, message })`: `feature_disabled` · `quote_not_found` · `quote_not_convertible` · `missing_accepted_version` · `booking_exists` · `conversion_failed` (wrap core `toBookingConversionException`).

---

## 14. Test plan

Backend (`node:test`, mocked Prisma): flag OFF blocks; flag ON + ACCEPTED delegates; DRAFT/SENT blocked; missing acceptedVersion blocked; duplicate → `booking_exists`/`alreadyExisted`; cross-company + non-latest rejected; audit best-effort; controller role metadata `admin,operations`. FE (later): proxy + readiness gate + flag. Respect source-grep tests; check baselines (~12 admin-web + ~19 api/bookings already red on main).

---

## 15. Proposed implementation slices

- **1A — Conversion foundation:** new controller/service/flag + module wiring, delegate to `convertToBooking`, typed errors, tests. No schema, no UI.
- **1B — Quote snapshot:** verification + assertions on the 6 booking JSONs + provenance.
- **1C — Service mapping:** per-type mapping + archived-route + order tests.
- **1D — Operations V2 handoff:** V2 UI trigger (readiness-gated) + deep-link.
- **1E — Finance read-only snapshot:** assert finance snapshot consistency.
- **1F — Role/audit/error hardening:** finalize roles, idempotent `booking_exists`, audit marker, optional DB index discussion.

---

## Confirmed decisions (2026-07-03)

- **Role gating:** `admin + operations`. Preserve `super_admin` override / `agent_admin`≈admin. No `viewer`, no `finance`.
- **Passenger/rooming:** minimal foundation only (same as existing `convertToBooking`); full Passenger/Rooming MVP later.

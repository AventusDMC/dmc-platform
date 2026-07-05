# Supplier Voucher Packet V2 — Plan

**Date:** 2026-07-05
**Status:** Approved plan (documentation only). No code, schema, migration, flag, or
environment change accompanies this document.
**Goal:** Let Operations V2 produce **one supplier-facing packet** that groups multiple
related services for the **same supplier**, while each service keeps its own
tracking/audit. Additive, flag-gated. Supplier send stays OFF; the voucher-send allowlist
remains `ziad@axisdmc.com` only. Classic remains fallback/reference only.

## Grounding facts (current model)

- **`Voucher.bookingServiceId` is `@unique`** → strictly **1 voucher : 1 service** today.
  This is the central constraint a packet must work around.
- Every voucher action is **per-operation**
  (`POST/GET :id/operations/:operationId/voucher/generate|pdf|send-preview|send`), keyed
  by `bookingServiceId`.
- **Supplier** has a single optional `email`; send readiness = the assigned operational
  supplier's email.
- **Audit** = `BookingAuditLog` with only two entity types: `booking`, `booking_service`.

---

## 1. Current single-service voucher behavior

All **per-service** (`operationId` = `bookingServiceId`):

- **Generate** — `POST :id/operations/:operationId/voucher/generate` →
  `generateOperationalVoucher`: snapshots the service, upserts a `Voucher` row
  (`status=GENERATED`, `generatedAt/By`), sets `BookingService.voucherStatus=GENERATED`,
  audits `service_voucher_created`.
- **Preview** — read-only render for one operation.
- **PDF / Download** — `GET :id/operations/:operationId/voucher/pdf` → pure per-op render,
  no mutation.
- **Send-preview** — `GET .../voucher/send-preview` → pure `buildVoucherSendPreview`
  (recipient = assigned supplier email, subject `Operational voucher — {ref} —
  {supplier}`, attachment `voucher-{operationId}.pdf`, readiness/blockers). Finance-free.
- **Send** — `POST .../voucher/send` → `sendOperationalVoucherEmail` (voucher-send.core):
  gated by backend `OPS_V2_VOUCHER_SEND_ENABLED` + recipient allowlist
  (`ziad@axisdmc.com`) + Resend transport; sets `sentAt`/status; audits.
- A separate booking-wide **client** voucher (`:id/voucher/pdf`, `:id/portal-voucher/pdf`)
  is client-facing and is **not** part of supplier packets.

## 2. Booking service and supplier assignment inputs

`BookingService` carries everything grouping needs: `assignedSupplierId` (the operational
supplier to group by; `assignedSupplier` relation; legacy `supplierId`/`supplierName`),
`serviceType`/`operationType`, `serviceDate`/`operationalDate`, `bookingDayId`,
`nights`+`mealPlan` (hotel stay block), `assignmentStatus`, `supplierConfirmationStatus`,
`voucherStatus`, `voucherGeneratedAt`, `updatedAt`. Assignment lifecycle:
`assignmentStatus` (UNASSIGNED→ASSIGNED→REQUESTED→CONFIRMED/REJECTED). Packet grouping keys
off **`assignedSupplierId`**.

## 3. Packet grouping rules

Packet identity = **(bookingId, assignedSupplierId, groupingKey)**. Grouping is a **pure,
deterministic** function of the services (unit-testable in isolation).

- **Transport:** one packet per supplier across multiple days/services — group all
  transport services with the same `assignedSupplierId`. (Option to split per day for
  dispatch; default = one packet.)
- **Hotel:** one packet **per hotel/stay block** — same supplier + contiguous
  `serviceDate…serviceDate+nights` + day sequence = one stay block = one packet.
- **Activity / Guide / Meal / Ticket / External (default):** group by **supplier +
  service-day** (day-anchored); allow merge into a single per-supplier packet as an option.
  External packages often span days → group by supplier + package reference.
- **Universal:** never group across different `assignedSupplierId`; never group a service
  with no assigned supplier.

## 4. Packet lifecycle

`DRAFT` (grouped, not generated) → `GENERATED` (snapshot taken) → `PREVIEWED`
(non-mutating view) → `DOWNLOADED` (PDF pulled) → `SENT` (emailed) → **`STALE`** (a member
service changed after generation → needs regenerate). **Stale detection:** store a packet
`contentHash` (or `generatedAt` + max member `updatedAt`) at generation; mark stale when
any included service's `updatedAt` > packet `generatedAt`, or membership changes (service
added/removed/supplier reassigned). Regenerate re-snapshots and clears stale.

## 5. Packet PDF behavior

One PDF concatenating a section per included service under a single supplier header
(supplier name, booking ref, packet id, day/date range). Reuse the existing per-service
render as the section renderer; add a packet cover/aggregation. Pure render, no mutation
(mirrors the current per-op PDF).

## 6. Service-level inclusion tracking

A join row per member: `VoucherPacketItem { packetId, bookingServiceId, includedAt,
snapshotJson }`. Each included service keeps its own `voucherStatus` and gets an audit
entry when included/sent via a packet. A service is covered by **either** a packet **or** a
standalone single-service voucher — a guard prevents double-coverage.

## 7. Packet-level audit

Packet events: `voucher_packet_created / generated / regenerated / previewed / downloaded /
sent`. Options: (a) **add enum value `booking_voucher_packet`** to
`BookingAuditEntityType` (clean, small migration) with `entityId = packetId`; or (b) audit
under `booking` with the packet id in `newValue`/`note` (no enum change). Recommend (a).
Per-service audit entries on include/send **preserve service-level audit** (the stated
requirement). Values stay name/label-only (reuse the PR-3c-safe formatters).

## 8. Send safety / allowlist remains unchanged

Reuse `buildVoucherSendPreview` per member and **aggregate**: a packet is send-ready only
if (policy) all included members are ready, the supplier has exactly one valid email, and
that email is on the allowlist. Backend send stays behind `OPS_V2_VOUCHER_SEND_ENABLED` +
allowlist (`ziad@axisdmc.com`) + Resend. **This plan does not enable send and does not
widen the allowlist.** One packet = one email with one combined PDF (fewer emails than N
single vouchers — a key benefit).

## 9. Data model recommendation

- **No-schema approach is insufficient:** faking grouping at render/UI time cannot persist
  packet status, packet audit, stale detection, or atomic packet-sent.
- **Additive schema (recommended):**
  - `VoucherPacket { id, bookingId, supplierId, groupingType, groupingKey, status,
    contentHash, generatedAt/By, sentAt, snapshotJson, notes, createdAt, updatedAt }`
  - `VoucherPacketItem { id, packetId, bookingServiceId, includedAt, snapshotJson }`
    (unique `(packetId, bookingServiceId)`; index `bookingServiceId`)
  - Optional: add `booking_voucher_packet` to `BookingAuditEntityType`.
  - **Do not** touch the existing `Voucher` 1:1 constraint — packets are a **new layer
    alongside** it.
- **Verdict:** schema change is **required** but purely **additive** (new tables + optional
  enum value); no change to existing `Voucher`/`BookingService` columns.

## 10. API route shape (new, additive)

Under `/api/bookings/:id/voucher-packets`:

- `GET /` (list packets + computed groupable-but-ungenerated groups), `POST /` (create
  packet from a grouping), `GET /:packetId`
- `POST /:packetId/generate`, `POST /:packetId/regenerate`
- `GET /:packetId/pdf` (download), `GET /:packetId/send-preview`
- `POST /:packetId/send` (behind the send flag; **stays off**)
- Admin-web JSON proxies mirror the existing V2 proxy pattern. Existing per-service voucher
  routes are **untouched**. Roles: `@Roles('admin','operations')` (super_admin via
  coalescing); `agent_admin` excluded (consistent with PR-3 restricted treatment).

## 11. Operations V2 UI placement

A **"Supplier packets"** panel on the Operations workspace (near the service board or on
the Documents tab): groups services by supplier, shows each computed packet with
status/badge and Generate / Preview / Download / (Send-disabled) actions — the packet-level
analog of today's per-row voucher controls. Flag-gated by a new
`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET`. Per-service rows keep their existing controls for
one-off/non-packet cases.

## 12. Backward compatibility with single-service vouchers

Fully additive: existing single-service voucher generate/preview/pdf/send behavior and
endpoints are unchanged; the client/portal voucher is unchanged. A service is covered by a
packet **xor** a standalone voucher (guarded). With the packet flag OFF, nothing changes.
Classic voucher flow remains the reference/fallback.

## 13. Rollback / fallback plan

- Flag OFF → packet UI + endpoints hidden; per-service vouchers and Classic unaffected.
- Schema is additive (new tables) → rollback = stop using; no destructive migration, no
  data loss. An added audit enum value is harmless when unused.
- Fallback for any packet failure: the per-service voucher path and Classic remain
  available.

## 14. Build slices (S1–S8)

- **S1** — additive schema migration (`VoucherPacket`, `VoucherPacketItem`, optional audit
  enum); no behavior. *(Staging shares the Railway DB — run `prisma migrate status`
  first.)*
- **S2** — pure **grouping engine** (compute packets from services) + **read-only** packet
  view (list groups by supplier). No generate.
- **S3** — packet **generate** (snapshot + inclusion tracking + packet & per-service
  audit). No PDF/send.
- **S4** — packet **PDF** render (concatenated sections).
- **S5** — packet **preview + download** (read-only), flag-gated UI.
- **S6** — **stale detection + regenerate**; packet **send-preview** (read-only readiness).
- **S7** — packet **send** wired **behind** `OPS_V2_VOUCHER_SEND_ENABLED` (**not enabled**;
  allowlist untouched).
- **S8** — Ops V2 UI placement polish + tests.

## 15. Must-have vs post-launch

- **Must-have:** additive schema; grouping engine (transport + hotel rules); generate +
  snapshot; packet PDF; preview/download; per-service inclusion tracking; packet +
  per-service audit; stale detection + regenerate; backward compatibility; rollback; flag
  gating; roles admin/operations.
- **Post-launch:** actual packet **send** enablement (stays gated); activity/guide/meal/
  ticket/external advanced grouping heuristics; multi-email suppliers; cross-booking
  packets; rich field-level stale-diff; packet templates/branding.

## 16. Risks

1. **1:1 `Voucher` constraint** — must not repurpose it; packet is a separate layer
   (mitigated by additive design).
2. **Double-coverage** — a service in both a packet and a standalone voucher → guard +
   clear precedence.
3. **Stale correctness** — `updatedAt`-based detection can over/under-fire; a `contentHash`
   is more precise; membership changes must also flag stale.
4. **Send safety** — must stay gated (`OPS_V2_VOUCHER_SEND_ENABLED` + allowlist); a
   half-enabled state is a live-email risk. Keep send in its own late slice, OFF.
5. **Supplier email edge cases** — no email / multiple emails → packet not send-ready;
   surface clearly.
6. **Snapshot drift** — render the PDF from the generation-time snapshot; stale is the
   signal to regenerate.
7. **Grouping ambiguity** — same supplier, mixed service types/days → deterministic default
   + operator override; document the rule.
8. **Status reconciliation** — three status axes (`Voucher.status`,
   `BookingService.voucherStatus`, packet status) must not contradict; packet status is
   authoritative for packet-covered services.
9. **Audit volume / PII** — packet + per-service entries; keep values name/label-only.
10. **PDF size** — large packets (many transport legs) → pagination/perf.
11. **Staging shared DB** — migration coordination (single Railway DB).

---

**Bottom line:** a **packet is a new additive layer** (`VoucherPacket` +
`VoucherPacketItem`) grouping same-supplier services, with its own lifecycle/PDF/audit while
each service keeps individual tracking. It requires a small **additive** schema change (no
change to existing `Voucher`), ships in flag-gated slices S1–S8, keeps single-service
vouchers and Classic as fallback, and **leaves supplier send OFF and the allowlist
untouched**.

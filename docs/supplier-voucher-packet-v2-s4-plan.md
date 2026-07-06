# Supplier Voucher Packet V2 — S4 (Packet PDF Render) Plan

**Date:** 2026-07-06
**Status:** Approved plan (documentation only). No code, schema, migration, flag, or
environment change accompanies this document.
**Goal:** render a PDF for an **already-generated** `VoucherPacket`. **Render / download
only** — no send, send-preview, email, regenerate, stale detection, status change, or
packet mutation. Classic remains fallback/reference only; supplier send stays disabled;
allowlist unchanged.

## Decisions folded in
1. **Lean-snapshot render now** — render from the existing S3 packet snapshot; do **not**
   enrich S3 snapshots yet (richer operational detail can be a later slice).
2. **Flag-gate the PDF read** — reuse the backend flag `OPS_V2_VOUCHER_PACKET_ENABLED`
   (default OFF / fail-closed); the PDF endpoint returns `feature_disabled` / 403 when OFF,
   keeping production inert.
3. **S4 is PDF render/download only** — no send / send-preview / email / allowlist change /
   regenerate / stale detection / status change / DOWNLOADED tracking / audit mutation /
   packet mutation.

---

## 1. What S4 does
Renders a supplier-facing PDF for an already-generated `VoucherPacket`, streamed as a
download. It reads the packet + its items and renders from their stored snapshots. It
mutates nothing.

## 2. Source of truth
`VoucherPacket.snapshotJson` and `VoucherPacketItem.snapshotJson` (captured at S3 generation
time) — **not** live service data. This keeps the supplier PDF consistent with what was
generated and sets up later stale detection. Both snapshots are PII-free and finance-free by
construction.

## 3. PDF structure
- **Cover / header:**
  - title "Supplier Voucher Packet"
  - **supplier name**
  - **booking reference**
  - **grouping type / key**
  - **generated date**
  - **service count**
  - **date range**
- **Body:** **one section per included service** (from the snapshot `services[]` / item
  snapshots) — service type, day/date, and label. No cost / sell / margin; no passenger PII.
- Implemented as a new pure builder `renderVoucherPacketPdf(packetSnapshot)` (PDFKit),
  reusing the styling conventions of the single-service renderer **without modifying it**.

## 4. Route
`GET /bookings/:id/voucher-packets/:packetId/pdf` → controller `downloadVoucherPacketPdf`
(`@Res` streaming, `Content-Type: application/pdf`, slug filename e.g.
`packet-<packetId>-voucher.pdf`) → service `generateVoucherPacketPdf(id, packetId, actor)`.
Mirrors the existing per-operation voucher PDF route
(`GET :id/operations/:operationId/voucher/pdf`). An admin-web read-only proxy/link mirrors
the existing per-operation PDF proxy.

## 5. Read-only / no mutation
The PDF route is **fully read-only**: load the packet by `(id, packetId)` (company-scoped),
render from the snapshot, return the buffer. **No packet mutation, no status change (stays
`GENERATED`), no `sentAt`, no audit change, no email** — the same posture as
`generateOperationalVoucherPdf`.

## 6. Backend flag (fail-closed)
Reuse `OPS_V2_VOUCHER_PACKET_ENABLED` (strict `=== "true"`, default OFF). The PDF endpoint
checks it and returns `feature_disabled` / 403 when OFF. It is a read either way (no write),
but flag-gating keeps the whole packet surface inert in production until explicitly enabled.
No new flag is introduced.

## 7. Frontend flag
`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` (default OFF) remains the UI gate; any download
affordance renders only when that flag is on and the role is admin/operations. The backend
flag independently authorizes the read.

## 8. Role gating
`@Roles('admin','operations')` (super_admin via coalescing; `agent_admin` / `agent` /
`viewer` / `finance` excluded) — mirrors the single-service voucher PDF.

## 9. Stale / changed packet behavior in S4
**None.** S4 renders from the snapshot only. No `contentHash` comparison, no warning banner,
no status change to `STALE`. (At most an optional read-only "Generated at {date}" line in the
PDF — no comparison, no mutation.) Real stale detection is a later slice.

## 10. Single-service voucher renderer unchanged
The existing `renderVoucherPdf` / `generateOperationalVoucherPdf` and the strict
`/vouchers/:id/pdf` path are **untouched**. The packet PDF is a separate, additive renderer.

## 11. Tests
- **Pure builder** (`renderVoucherPacketPdf`): given a packet snapshot → returns a `Buffer`
  starting with `%PDF`; contains supplier name, booking ref, grouping type, and each service
  label; **PII/finance-free** (no cost/sell/margin/passport/DOB).
- **Service** (`generateVoucherPacketPdf`, Prisma-mock): loads packet → renders from
  snapshot → `Buffer`; **404** when the packet is missing; **feature_disabled / 403** when
  the flag is OFF; asserts **no `update`/`create`/audit** calls (pure — no mutation).
- **Controller/route:** `@Roles` metadata; `Content-Type: application/pdf`; filename slug.

## 12. Guardrails
- No schema/migration; no files under `apps/api/prisma/migrations/`.
- No send / send-preview / email / allowlist change.
- No regenerate; no stale detection; no status change; no DOWNLOADED tracking; no audit
  mutation; no packet mutation.
- Single-service voucher renderer untouched; Classic untouched.
- Production stays fail-closed (`OPS_V2_VOUCHER_PACKET_ENABLED` unset/OFF in production).

---

**Bottom line:** S4 is a **read-only** `GET /bookings/:id/voucher-packets/:packetId/pdf` that
renders a supplier-facing multi-service PDF from the S3 **snapshot** — pure, no mutation, no
send, gated by `OPS_V2_VOUCHER_PACKET_ENABLED` (fail-closed) with
`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` as the UI gate. Single-service vouchers and Classic remain
untouched.

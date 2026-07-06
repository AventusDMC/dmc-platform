# Supplier Voucher Packet V2 — S4 (Packet PDF) Staging Validation Report

**Date:** 2026-07-06
**Environment:** Staging only (staging API)
**Verdict:** ✅ PASS — the read-only packet PDF renders correctly on staging (flag ON) with
no PII/finance and no mutation. Production remains fail-closed (flag unset).
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: Supplier Voucher Packet V2 Slice S4 — a read-only
`GET /api/bookings/:id/voucher-packets/:packetId/pdf` that renders a supplier-facing PDF
from the packet's snapshot. Backend flag `OPS_V2_VOUCHER_PACKET_ENABLED` (strict `=== "true"`,
default OFF). References: `docs/supplier-voucher-packet-v2-s4-plan.md`,
`docs/supplier-voucher-packet-v2-s3-staging-validation.md`.

---

## 1. Merge commit
`11fad69c` — PR #651 (`feat(api): add read-only supplier voucher packet PDF render`),
MERGED with all checks green. Backend-only, no migration.

## 2. Staging API deploy status
Railway staging service `dmc-platform` redeployed `11fad69c` — **SUCCESS**; the packet PDF
endpoint is live.

## 3. Flag status
- **Staging backend:** `OPS_V2_VOUCHER_PACKET_ENABLED = true` (unchanged from S3).
- **Production backend:** `OPS_V2_VOUCHER_PACKET_ENABLED` **absent/unset** → the packet PDF
  endpoint is **fail-closed** (403) in production.

## 4. PDF HTTP / content result
`GET /bookings/{BK-2026-0002}/voucher-packets/f32d6acf-17aa-490b-94b7-c4f4bac426a0/pdf`
(admin):

- **HTTP 200** ✅
- **Content-Type: application/pdf** ✅
- **Content-Disposition:** `attachment; filename="packet-f32d6acf-...-voucher.pdf"` ✅
- Body **starts with `%PDF`** ✅ (2603 bytes)
- **Content present** (verified by hex-decoding the PDF's `TJ` text — PDFKit encodes
  Helvetica/WinAnsi text as hex strings): **Supplier Voucher Packet**, **TEST Hotel Supplier
  A**, **BK-2026-0002**, **HOTEL**, **QA Hotel Service** — all ✅. Decoded text:
  `Supplier Voucher Packet · Supplier: TEST Hotel Supplier A · Booking reference:
  BK-2026-0002 · Grouping: HOTEL (…) · Generated: 2026-07-06 · Services: 1 · Dates:
  2026-07-22 · 1. QA Hotel Service …`

## 5. PDF content safety result
✅ **No PII / finance** in the decoded text — none of `cost`, `sell`, `margin`, `passport`,
`dob`, `dateOfBirth`, `emergency`, `unitCost`, `totalSell`, `JOD`, `USD`.

## 6. Packet mutation / status confirmation
✅ **No mutation.** The endpoint is read-only by construction (`voucherPacket.findFirst` +
pure render; no `update`/`create`/`delete`/`$transaction`/audit in the code path — the S4
service tests' mutation traps never fire). No `sentAt` / `downloadedAt`, no status change,
no audit write. Packet `f32d6acf-…` remains **`GENERATED`**. (No packet-read endpoint exists
to re-read status live; non-mutation is guaranteed by the code + tests.)

## 7. Safety confirmation
- **No send / send-preview / email behavior** exists in S4 — PDF render/download only.
- **Production unchanged** — no prod env/flag/deploy change; the prod PDF endpoint is
  fail-closed (flag unset). Prod reads were read-only (pulled files deleted; no secrets
  printed); the Railway CLI link was restored to staging.
- **Voucher-send allowlist unchanged** — `ziad@axisdmc.com` only; supplier send disabled.
- **Staging test packet left in place** (`f32d6acf-…`, `GENERATED`) and unmodified.
- Documentation only — no code, schema, flag, or environment change in this report.

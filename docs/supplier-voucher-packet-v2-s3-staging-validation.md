# Supplier Voucher Packet V2 — S3 (Generate) Staging Validation Report

**Date:** 2026-07-06
**Environment:** Staging only (staging API)
**Verdict:** ✅ PASS — backend-flag-gated packet **generate** validated on staging; one
packet created, duplicate guard enforced. Production generation remains fail-closed
(flag unset). No PDF/preview/download/send-preview/send/delete exists.
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: Supplier Voucher Packet V2 Slice S3 — a fail-closed
`POST /api/bookings/:id/voucher-packets` that re-runs the S2 grouping engine and creates
one `VoucherPacket` + N `VoucherPacketItem` rows with snapshots + packet/per-service audit.
Backend flag `OPS_V2_VOUCHER_PACKET_ENABLED` (strict `=== "true"`, default OFF).
References: `docs/supplier-voucher-packet-v2-s3-plan.md`,
`docs/supplier-voucher-packet-v2-s2-staging-validation.md`.

---

## 1. Merge commit
`bad344ce` — PR #648 (`feat(api): add fail-closed supplier voucher packet generation`),
MERGED with all checks green. Backend-only, no migration.

## 2. Staging API deploy status
Railway staging service `dmc-platform` redeployed `bad344ce` — **SUCCESS**; the S3 generate
endpoint + the enabled flag are live.

## 3. Flag status
- **Staging backend:** `OPS_V2_VOUCHER_PACKET_ENABLED = true` (set on staging only; confirmed
  by read-back; left ON for continued QA).
- **Production backend:** `OPS_V2_VOUCHER_PACKET_ENABLED` **absent/unset** → generation is
  **fail-closed** in production. (`OPS_V2_VOUCHER_SEND_ENABLED = false`; allowlist
  `ziad@axisdmc.com` — both confirmed read-only.)

## 4. Generate validation (BK-2026-0002)
- **groupingKey used:** `HOTEL:a9374ca3-f0a3-487a-94f1-3752eede4c39:2026-07-22`
  (supplier "TEST Hotel Supplier A"), taken from the live S2 groups endpoint.
- **POST `/voucher-packets` → 201 Created:**
  - **packetId:** `f32d6acf-17aa-490b-94b7-c4f4bac426a0`
  - **status:** `GENERATED`
  - **supplierId:** `a9374ca3-…` (correct); **groupingKey / type:** match the group
  - **contentHash:** present (`d86a5672e040…`)
  - **generatedAt / generatedBy:** set (admin user id)
- **item count:** **1** — snapshot `serviceCount = 1` ("QA Hotel Service"); only the
  assigned HOTEL service (4 unassigned services excluded). The write is atomic — the
  duplicate-POST 409 (below) proves the packet persisted, so the whole transaction (packet
  + item + audits) committed.

## 5. Snapshot / audit
- **snapshotJson is PII-free and finance-free** (serviceCount + service label only; no
  cost/sell/margin/passport/DOB).
- **Audit** (`voucher_packet_generated` + `voucher_packet_service_included`) written in the
  same atomic transaction (evidenced by the committed packet) and covered by the S3 service
  tests. S3 exposes no read endpoint for items/audit — verified via atomic-commit + tests.

## 6. Duplicate guard
Second `POST` with the same `groupingKey` → **409** "A voucher packet already exists for
this group." No second packet created. (Double-coverage / standalone-voucher guards are
service-test-covered; no extra live staging artifacts were created.)

## 7. Safety confirmation
- **No PDF / preview / download / send-preview / send / delete** actions exist (S3 =
  generate only).
- **Voucher-send allowlist unchanged** — `ziad@axisdmc.com` only; supplier sending disabled
  (prod send kill-switch stays `false`).
- **Production unchanged** — no prod env/flag/deploy change; prod packet flag remains unset
  (fail-closed); prod reads were read-only.
- **Staging test packet left in place** (`f32d6acf-…`, GENERATED) and documented; there is
  no delete/discard endpoint in S3.
- Read-only inspections used pulled variable files that were deleted immediately; no secrets
  were printed; the Railway CLI link was restored to staging after the prod read.
- Documentation only — no code, schema, flag, or environment change in this report.

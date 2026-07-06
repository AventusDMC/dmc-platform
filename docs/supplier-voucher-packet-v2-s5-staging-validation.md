# Supplier Voucher Packet V2 — S5 (Download UI) Staging Validation Report

**Date:** 2026-07-06
**Environment:** Staging only (staging API + `dmc-platform-admin-web-staging.vercel.app`)
**Verdict:** ✅ PASS — the read-only "Download PDF" affordance works end-to-end on staging;
production remains fail-closed.
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: Supplier Voucher Packet V2 Slice S5 — read-only enrichment of the groups endpoint
with `existingPacketId` + `packetStatus` (backend-flag-gated), an admin-web binary PDF proxy,
and a "Download PDF" link on the Ops V2 Supplier Packets panel for generated packets.
References: `docs/supplier-voucher-packet-v2-s5-plan.md`,
`docs/supplier-voucher-packet-v2-s4-staging-validation.md`.

---

## 1. Merge commit
`54d568d7` — PR #654 (`feat: add read-only supplier voucher packet PDF download in Ops V2`),
MERGED with all checks green.

## 2. Staging deploy status
- **Staging API** (Railway `dmc-platform`): redeployed `54d568d7` — **SUCCESS** (groups
  enrichment live).
- **Staging admin-web** (Vercel): auto-deployed the merge; the panel renders the "Download
  PDF" affordance and the new PDF proxy route is live.

## 3. Flag status
- Staging backend `OPS_V2_VOUCHER_PACKET_ENABLED = true`.
- Staging frontend `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET = true`.

## 4. Panel result (BK-2026-0002, operations tab)
- **Supplier Packets panel shows the HOTEL group** ("TEST Hotel Supplier A", 1 service,
  day 1).
- **Groups enrichment (API):** the HOTEL group carries `existingPacketId = f32d6acf-…`
  (matches the target packet) and `packetStatus = GENERATED`.
- Precise `<section aria-label="Supplier packets">` inspection: **no `<button>`, no `<form>`,
  no Generate / Send / send-preview / Preview** — only the Download PDF link; **no PII/finance**.
- Live there is only the one (generated) HOTEL group — the 4 unassigned services are not
  grouped, so there is no ungenerated group to show live; the "no download for ungenerated
  groups" behaviour is render-test-verified (14/14).

## 5. Download link result
"Download PDF" link present, pointing at the proxy
`/api/bookings/{BK-2026-0002}/voucher-packets/f32d6acf-…/pdf`. (One logical link; the
count-2 seen in the raw page is the HTML + RSC-flight serialization artifact.)

## 6. PDF result (via the admin-web proxy)
- **HTTP 200**; **Content-Type: application/pdf**; **Content-Disposition preserved**
  (`attachment; filename="packet-f32d6acf-…-voucher.pdf"`); body **starts with `%PDF`**
  (2603 bytes).
- **Content present** (hex-decoded): Supplier Voucher Packet, TEST Hotel Supplier A,
  BK-2026-0002, HOTEL, QA Hotel Service.
- **PII/finance absent** — no cost / sell / margin / passport / dateOfBirth / JOD / USD.

## 7. Packet mutation / status confirmation
✅ **No mutation.** The enrichment is a read-only `voucherPacket.findMany`; the proxy is a
binary passthrough of the S4 read-only PDF render. The groups endpoint reports the packet
still **`GENERATED`**; no `sentAt` / `downloadedAt`, no status change, no audit, no
create/delete. (Read-only by construction + the S5 service tests' mutation traps.)

## 8. Safety confirmation
- **Production unchanged / fail-closed** — prod `OPS_V2_VOUCHER_PACKET_ENABLED` is
  **absent/unset** (read-only check) → the enrichment exposes no packet ids and the PDF
  endpoint/proxy 403 in production; prod frontend flag off → panel hidden. No prod
  env/flag/deploy change; prod reads were read-only; the Railway CLI link was restored to
  staging.
- **Voucher-send allowlist unchanged** — `ziad@axisdmc.com` only; supplier send disabled.
- **No inline preview**, no send / send-preview / email, no Classic change.
- Read-only inspections used pulled variable files that were deleted immediately; no secrets
  were printed.
- Documentation only — no code, schema, flag, or environment change in this report.

# Supplier Voucher Packet V2 — S7 (Send-Preview / Readiness) Staging Validation Report

**Date:** 2026-07-06
**Environment:** Staging only (staging API + `dmc-platform-admin-web-staging.vercel.app`)
**Verdict:** ✅ PASS — the read-only packet send-preview / readiness works end-to-end on
staging (API live and complete); production remains fail-closed.
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: Supplier Voucher Packet V2 Slice S7 — a read-only packet send-preview / readiness
view. `GET /bookings/:id/voucher-packets/:packetId/send-preview` (backend-gated by
`OPS_V2_VOUCHER_PACKET_ENABLED`, fail-closed) backed by a pure builder that aggregates
readiness across the packet's services, with the recipient server-resolved from the packet's
assigned supplier only. References: `docs/supplier-voucher-packet-v2-s7-plan.md`,
`docs/supplier-voucher-packet-v2-s6-staging-validation.md`.

---

## 1. Merge commit
`81561629ba100bddefe6752293ea03129e472579` — PR #660
(`feat: add supplier voucher packet send readiness preview`), MERGED with all checks green.

## 2. Staging deploy status
- **Staging API** (Railway): the S7 merge deployed **SUCCESS**; the `send-preview` route is
  live.
- **Staging admin-web** (Vercel): redeployed after the staging-only UI flag was enabled —
  build **SUCCESS**, aliased to the staging admin-web URL.

## 3. Flag status
- Staging backend `OPS_V2_VOUCHER_PACKET_ENABLED = true`.
- Staging frontend `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET = true`.
- Staging-only `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET_SEND_PREVIEW = true` was enabled and the
  staging admin-web redeployed. This flag was **not** set in production.

## 4. Production flag confirmation (fail-closed)
- Production frontend has **neither** `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` nor
  `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET_SEND_PREVIEW`.
- Production backend `OPS_V2_VOUCHER_PACKET_ENABLED` is **absent/unset**, and the supplier
  send flag is **disabled**.
- No production flag/env/deploy change was made in this validation.

## 5. Validation target
- Booking **BK-2026-0002**.
- Packet **f32d6acf-17aa-490b-94b7-c4f4bac426a0** (HOTEL group, supplier "TEST Hotel Supplier
  A", 1 service — "QA Hotel Service").

## 6. API send-preview result
`GET …/voucher-packets/{packetId}/send-preview` → **HTTP 200**. The response included every
expected field:
- `readiness`, `readinessReason`, `blockingReasons: []`
- `supplierName: "TEST Hotel Supplier A"`
- `recipientEmail` (a single valid resolved recipient)
- `serviceCount: 1`, `memberLabels: ["QA Hotel Service"]`
- `bookingRef: "BK-2026-0002"`
- `note: "Preview only. No email is sent."`

## 7. Readiness / blocker result
**READY** — honest and unforced. The packet is `GENERATED` and not stale, and the assigned
supplier has a single valid email that happens to be the allowlisted address, with the staging
send flag enabled → all gates clear. **No supplier email, send flag, or allowlist was changed
to force READY.** The packet was confirmed **not stale** (`isStale = false`).

The full blocker set the endpoint reports (any of which would make a packet *Not ready*):
`NO_PACKET`, `PACKET_STALE`, `NO_PDF`, `NO_SUPPLIER`, `MISSING_EMAIL`, `MULTIPLE_EMAILS`,
`INVALID_EMAIL`, `SEND_DISABLED`, `RECIPIENT_NOT_ALLOWLISTED`. Each is exercised by the
automated test suite.

## 8. Recipient-resolution result
The recipient was resolved **only** from the packet's assigned supplier
(`packet.supplierId → Supplier.email`). **No client-supplied recipient is possible** — the
route is a `GET` with no request body; an attempt to pass a client recipient failed with
"GET method cannot have body", structurally confirming the recipient is 100% server-resolved.

## 9. UI readiness section result (with caveat)
- The staging frontend flag was enabled and the staging admin-web redeployed, so the read-only
  "Send readiness — preview only" section will render for operators.
- The section's content — "Send readiness — preview only", "Preview only. No email is sent.",
  the "Would send to…" recipient line, the readiness pill, and the blocker chips — **and the
  absence of any Send / send-preview / transmit control** are covered by the automated render
  test suite (26/26 passing).
- **Caveat (stated clearly):** a live browser / HTTP render of the staging admin-web from the
  validation machine was **blocked by an environmental network reset** to the admin-web host
  (the request layer was reset), while the staging API and deploy tooling worked normally.
  **The live browser UI was therefore not directly observed in this validation.** UI behavior
  is asserted via the automated render tests plus the confirmed staging flag + successful
  redeploy — not via a direct live-page observation.

## 10. Read-only / no-send / no-mutation confirmation
After running the preview multiple times, the packet row was **identical**:
- status remained **`GENERATED`**; `contentHash`, `generatedAt`, and `generatedBy` were
  **unchanged** by the preview; `sentAt` remained **null**; item count unchanged.
- The booking audit count was **unchanged** (no new audit entry); there were **no**
  send / preview / email audit actions.
- **No** packet rows or items were created, updated, or deleted; **no** email was sent; **no**
  supplier-send endpoint exists or was called; **no** status / `sentAt` / `downloadedAt`
  mutation occurred.

## 11. Allowlist / supplier-send confirmation
- The voucher-send allowlist remains **`ziad@axisdmc.com`** only, on both staging and
  production — unchanged.
- Supplier sending remains **disabled** (S7 introduces no send path; the production send flag
  is off).

## 12. Safety confirmations
- **Production unchanged / fail-closed** — no production flag/env/deploy change; the backend
  route fail-closes when `OPS_V2_VOUCHER_PACKET_ENABLED` is unset (production), and the UI
  section is gated by `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET_SEND_PREVIEW`, which is absent in
  production.
- **No actual send / email / transport** occurred; **no send endpoint** exists in S7.
- **No Classic change.**
- Read-only inspections used credentials pulled into temporary files that were deleted
  immediately; no secrets, hosts, URLs, or connection details are recorded here.
- Documentation only — no code, schema, flag, or environment change in this report.

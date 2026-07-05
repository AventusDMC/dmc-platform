# Supplier Voucher Packet V2 — S2 Staging Validation Report

**Date:** 2026-07-06
**Environment:** Staging only (staging API + `dmc-platform-admin-web-staging.vercel.app`)
**Verdict:** ✅ PASS — read-only grouping engine + endpoint + flag-gated panel validated on
staging. Production frontend packet flag remains OFF. A production **backend** send
kill-switch was turned OFF for defense-in-depth (documented below).
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: Supplier Voucher Packet V2 Slice S2 — a pure grouping engine, a read-only
`GET /api/bookings/:id/voucher-packets/groups` endpoint, and a flag-gated
(`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET`, default OFF) read-only "Supplier packets" panel.
Reads only; no packet rows created. References:
`docs/supplier-voucher-packet-v2-plan.md`, `docs/supplier-voucher-packet-v2-s2-plan.md`.

---

## 1. Merge commit
`37bf1576` — PR #645 (`feat(api): add read-only supplier voucher packet grouping`),
MERGED with all checks green. Code-only, no migration.

## 2. Staging deploy status
- **Staging API** (Railway `dmc-platform`) deployed `37bf1576` — the new
  `GET /voucher-packets/groups` endpoint is live.
- **Staging admin-web** — `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET=true` set on the staging
  Vercel project (staging only); `vercel redeploy` rebuilt and aliased
  `dmc-platform-admin-web-staging.vercel.app` with the flag baked in.

## 3. Endpoint validation (read-only API, BK-2026-0002)
`GET /bookings/{BK-2026-0002}/voucher-packets/groups` (admin), cross-checked against the
operations grid:
- Grid has 5 services: HOTEL (**ASSIGNED** → "TEST Hotel Supplier A"),
  ACTIVITY / TRANSPORT / GUIDE / MEAL (all **UNASSIGNED**).
- Endpoint returned **exactly 1 group**: `[HOTEL]` supplier "TEST Hotel Supplier A",
  count 1, label "QA Hotel Service".
- ✅ Only the assigned service grouped; ✅ unassigned excluded; ✅ expected HOTEL group
  present; ✅ PII-free and finance-free; ✅ HTTP 200, read-only.

## 4. Panel validation (staging UI, flag ON)
BK-2026-0002 operations tab (admin): HTTP 200, no error.
- ✅ **Supplier packets panel appears** ("Preview · read-only").
- ✅ Shows the **HOTEL group for "TEST Hotel Supplier A"** with label "QA Hotel Service".
- ✅ **No Generate / Preview / Download / Send buttons** (no mutating controls in the
  panel).
- ✅ No PII / finance in the panel.

## 5. DB no-write / no packet rows
✅ The endpoint is read-only (`findOne` + pure engine); **no `VoucherPacket` /
`VoucherPacketItem` row is created**. S1's tables remain empty.

## 6. Production flag read-only findings (as of validation)
Frontend prod admin-web (`dmc-platform-admin-web-4gu9`) — **all effectively OFF**: the ops
V2 / voucher / pax flags are either declared-but-empty or absent, which the code
(`=== 'true'`) reads as OFF. `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` is absent → OFF.

Backend prod API (Railway `cheerful-enthusiasm`): `QUOTE_BOOKING_CREATE = false`;
`OPS_V2_VOUCHER_SEND_ENABLED` was **true** at validation time (contained by the OFF
frontend send flag + the `ziad@axisdmc.com` allowlist, so no send was possible via the UI).

## 7. Production backend send kill-switch — defense-in-depth fix
Because we are not live and are not testing supplier send in production, the production
backend flag was set:

- `OPS_V2_VOUCHER_SEND_ENABLED`: **true → false** (production API, Railway
  `cheerful-enthusiasm` → service `dmc-platform`).
- The production API was redeployed/restarted (deploy **SUCCESS**, same commit
  `37bf1576`, new env). The redeploy's `prisma migrate deploy` had **no pending
  migrations** (no schema change).
- Frontend send flag remains OFF; **no feature enabled**; **allowlist unchanged**
  (`ziad@axisdmc.com`); **no email sent**.

(This change was applied directly to the production environment as an authorized safety
hardening; it is **not** part of this documentation PR.)

## 8. Safety confirmation
- **Staging only** for the packet feature; production frontend packet flag remains OFF
  (absent).
- **Voucher-send allowlist unchanged** — `ziad@axisdmc.com` only; supplier sending remains
  disabled (and the backend kill-switch is now OFF too).
- **No packet rows created; no DB writes; no schema/migration.**
- Read-only production inspections used pulled env files that were deleted immediately; no
  secrets were printed. The Vercel/Railway CLI links were restored to their prior state
  after the work.
- Documentation only — no code, schema, flag, or environment change in this report.

# ERP V2 — Production Booking Creation V2 Smoke Report

**Date:** 2026-07-17
**Status:** Production smoke. Booking Creation V2 enabled on the prod API and canonical staff-prod
`-4gu9`; smoke passed. Flags left enabled for controlled internal beta only; no further rollout.
No code, schema, additional flag/env, or additional production/staging change accompanies this report.

## 1. Environment
- **Production.**
- **Canonical staff-prod `-4gu9`.**
- **Internal test quote: `Q-2026-0082`.**
- Quote label: **"UAT-PROD-BOOKING-CREATE — DO NOT SEND"**.
- Internal Axis company only (the DMC's own company); safe synthetic `.invalid` contact.

## 2. Flags enabled
- **`QUOTE_BOOKING_CREATE=true`** on the **prod API** (backend, fail-closed gate).
- **`NEXT_PUBLIC_QUOTE_BOOKING_CREATE=true`** on **`-4gu9`** (frontend, build-time gate).
- **Railway API redeploy — SUCCESS.**
- **`-4gu9` rebuilt** and the deployment is **Ready** (the build-time `NEXT_PUBLIC` flag is baked in).
- **Flags left enabled for controlled internal beta only.**

## 3. Flags NOT changed
- **Passenger / Rooming flags unchanged.**
- **Voucher-send remains disabled.**
- **Packet remains OFF.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

## 4. Smoke result
- **PASS.**
- **`Q-2026-0082` converted through the V2 booking creation route.**
- **`BK-2026-0007` created.**
- Booking status **draft**.
- Quote remains **ACCEPTED**.
- Quote **links to the booking**.
- **Exactly one booking created.**
- Totals / currency **preserved at 10 / 10 JOD**.

## 5. Duplicate guard
- **PASS.**
- Second conversion returned **`alreadyExisted:true`**.
- **Same booking reference returned** (`BK-2026-0007`).
- **No second booking created** (booking count stayed 1).

## 6. Safety confirmations
- No email sent.
- No supplier assignment.
- No voucher created.
- No packet created.
- No invoice cleanup.
- No supplier-send.
- No voucher-send.
- No allowlist change.
- Broader rollout not started.

## 7. Rollback
- **Rollback not needed.**
- If needed later:
  - Set `QUOTE_BOOKING_CREATE=false`.
  - Remove / turn OFF `NEXT_PUBLIC_QUOTE_BOOKING_CREATE` on `-4gu9`.
  - Rebuild / redeploy.
  - **Do not delete `BK-2026-0007`** unless separately approved.

## 8. Net conclusion
- Booking Creation V2 is now **production-smoke validated**.
- It is **live for controlled internal beta only**.
- **`BK-2026-0007`** is the production test booking.
- Supplier / voucher / packet actions remain **separate future approvals**.
- **Supplier send remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, additional flag/environment, or data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only the human-readable quote / booking references, quote label, flag
  names, role names, totals, and results.

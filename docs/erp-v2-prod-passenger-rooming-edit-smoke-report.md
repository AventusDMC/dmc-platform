# ERP V2 — Production Passenger / Rooming Edit Smoke Report

**Date:** 2026-07-17
**Status:** Production smoke. Passenger / Rooming edit enabled on canonical staff-prod `-4gu9`; smoke
passed. No further rollout.

## 1. Environment
- **Canonical staff-prod `-4gu9`.**
- **Production smoke only.**
- **Internal test booking: `BK-2026-0006`.**
- Quote label: **"ZZZ TEST — BOOKING V2 PILOT — DO NOT SEND"**.
- Client is an **internal company** — Axis Destinations Management (the DMC's own company).

## 2. Flags enabled
- `NEXT_PUBLIC_OPS_V2_PAX_EDIT=true`.
- `NEXT_PUBLIC_OPS_V2_PAX_READINESS=true`.
- **`-4gu9` rebuilt** and the deployment is **Ready** (the build-time `NEXT_PUBLIC` flags are baked in).

## 3. Flags NOT changed
- No backend flags changed.
- Booking-create remains **false / OFF**.
- Packet remains **OFF**.
- Voucher-send remains **disabled**.
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.

## 4. Smoke result
- **PASS.**
- One safe **non-PII** passenger edit.
- Edited field (label only): **`dietaryNotes`**.
- Edit **persisted**.
- `updatedAt` advanced.
- Audit / activity recorded.
- **PII / passport data untouched.**
- Booking status remained **draft**.
- Totals / currency unchanged at **190.5 / 190.5 USD**.

## 5. Role-gate result
- **admin** edit — **PASS**.
- **agent** edit — **blocked (403)**.
- **viewer** edit — **blocked (403)**.
- **agent** PII export — **blocked (403)**.
- **viewer** PII export — **blocked (403)**.
- **agent_admin** PII export — **blocked (403)**.

## 6. Transparency note
- The **first** edit attempt returned a **500** due to a synthetic `companyId` in the test token.
- Re-running with a **real prod admin actor in the matching tenant** returned **200** and persisted.
- Classified as a **test-harness artifact, not a production defect**.

## 7. Rollback
- Rollback **not needed**.
- Flags remain **enabled**.
- The benign smoke note remains on the internal **DO-NOT-SEND** booking.
- Cleanup later if desired.

## 8. Safety confirmations
- No email sent.
- No supplier-send.
- No voucher-send.
- No allowlist change.
- Supplier sending remains disabled.
- No broader rollout.
- No supplier / voucher / packet actions.
- Production was touched **only** by the approved two frontend flags, the rebuild, and one safe smoke
  edit.

## 9. Net conclusion
- Passenger / Rooming edit is **enabled in production on `-4gu9`**.
- **Smoke passed.**
- **Pricing-inert behavior confirmed.**
- **PII gating confirmed.**
- **Broader rollout remains paused** pending documentation and the next approval.

### Safety confirmations
- Documentation only — no code, schema, additional flag/environment, or data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher / packet IDs are recorded
  here — only the human-readable booking reference, quote label, flag names, role names, totals, and
  results.

# ERP V2 — UAT Single-Service Voucher Generate / Preview / Download Check

**Date:** 2026-07-16
**Status:** Staging execution via the normal V2 Operations voucher app/API path. No code, schema, flag,
or production change accompanies this report.

Confirms single-service voucher generate → preview → download on the booking created from `Q-2026-0003`.

## 1. Environment
- **Staging only.**
- **Booking `BK-2026-0003`** only.
- Single service assigned to **QA Staging Supplier**.

## 2. Preflight
- Booking was **synthetic**.
- Status **draft**.
- **1** booking service.
- Supplier assigned.
- Confirmation status **CONFIRMED**.
- **Vouchers = 0** before generation.
- **Packets = 0**.
- Production flags unchanged.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.

## 3. Results
- Single-service voucher generation — **PASS**.
- Voucher status **GENERATED**.
- Voucher type **SERVICE**.
- Voucher count = **1**.
- Preview renders — **PASS**.
- PDF / download renders — **PASS**.
- PDF is **valid**.
- PDF is **finance-safe**, with no margin / profit / cost leak.
- **No supplier email sent.**
- **No packet created.**
- Booking status stayed **draft**.
- Totals / currency stayed **100 / 80 USD**.
- Duplicate guard / regenerate — **PASS**: the second generate did **not** create a duplicate (voucher
  count stayed 1).

## 4. Negative checks
- finance generate / preview / pdf — **blocked (403)**.
- agent generate / preview / pdf — **blocked (403)**.
- viewer generate / preview / pdf — **blocked (403)**.
- **Voucher-send endpoint not called.**

## 5. Roll-up
- **Blockers: 0.**
- **Majors: 0.**
- **Minors: 0.**
- **Single-Service Voucher UAT PASS.**

## 6. Confirmations
- No production mutation.
- No email sent.
- No flags changed.
- No packet created.
- No passenger / rooming edit.
- Invoice not cleaned up.
- No supplier assignment / confirmation change.
- No booking conversion.
- No quote edits.
- No pricing apply.
- No packet UAT started.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 7. Net conclusion
- Single-service voucher generate / preview / download **works correctly on staging**.
- **Role gating is correct.**
- The voucher PDF is **operational and finance-safe**.
- The next safe step after this doc is merged is **Supplier Voucher Packet V2 staging UAT, with no
  send**.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher IDs are recorded here —
  only the human-readable booking reference, the supplier label, statuses, results, and counts.

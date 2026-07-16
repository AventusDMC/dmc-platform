# ERP V2 — UAT Supplier Assignment / Confirmation Check

**Date:** 2026-07-16
**Status:** Staging execution via the normal V2 Operations supplier assignment / confirmation app/API
path. No code, schema, flag, or production change accompanies this report.

Confirms supplier assignment + confirmation-status recording on the booking created from `Q-2026-0003`.

## 1. Environment
- **Staging only.**
- **Booking `BK-2026-0003`** only.

## 2. Preflight
- Booking was **synthetic**.
- Status **draft**.
- **1** booking service.
- Service type **"other"**.
- **No supplier assigned** before the test.
- Confirmation status was **NOT_SENT**.
- **0 vouchers**.
- **0 packets**.
- Production flags unchanged.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.

## 3. Supplier used
- **QA Staging Supplier**.
- Existing staging **test supplier**.
- **No supplier record created or edited.**
- **No supplier email edited.**

## 4. Results
- Supplier assignment — **PASS**.
- Supplier persisted as **QA Staging Supplier**.
- Service status became **confirmed**.
- Supplier confirmation status — **PASS**.
- Confirmation status **CONFIRMED**.
- **Synthetic confirmation reference** used.
- `confirmedAt` set.
- Booking status stayed **draft**.
- Totals / currency stayed **100 / 80 USD**.
- **No email sent.**
- **No voucher / packet created.**

## 5. Negative checks
- finance assign / confirm — **blocked (403)**.
- agent assign / confirm — **blocked (403)**.
- viewer assign / confirm — **blocked (403)**.
- **No supplier-send action exposed or triggered.**

## 6. Minor observation
- `BookingService` has **two supplier fields**: the operational **`supplierId` / `supplierName`** and a
  separate **`assignedSupplierId`**.
- The V2 assignment populates **`supplierId` / `supplierName`** but **not** `assignedSupplierId`.
- Read surfaces keyed on `assignedSupplierId` may still show **unassigned**.
- **Product / engineering confirmation recommended** that the intended read field is `supplierId`.
- **Not a blocker** for this UAT result.

## 7. Roll-up
- **Blockers: 0.**
- **Majors: 0.**
- **Minors: 1.**
- **Supplier Assignment / Confirmation UAT PASS.**

## 8. Confirmations
- No production mutation.
- No email sent.
- No flags changed.
- No passenger / rooming edit.
- Invoice not cleaned up.
- No supplier record created / edited.
- No supplier email edited.
- No allowlist widening.
- No booking conversion.
- No quote edits.
- No pricing apply.
- No voucher / packet created.
- No voucher UAT started.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 9. Net conclusion
- Supplier assignment and confirmation-status recording **work correctly on staging** via the V2 paths.
- **Role gating is correct.**
- The next safe UAT step after this doc is merged is **single-service voucher generate / preview /
  download, with no send**.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice IDs are recorded here — only the
  human-readable booking reference, the supplier label, field names, results, and counts.

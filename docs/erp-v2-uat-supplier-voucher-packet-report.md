# ERP V2 — UAT Supplier Voucher Packet V2 Staging Check

**Date:** 2026-07-16
**Status:** Staging execution via the normal Supplier Voucher Packet V2 app/API path. No code, schema,
flag, or production change accompanies this report. **Result: BLOCKED (1 Major).**

## 1. Environment
- **Staging only.**
- **Booking `BK-2026-0003`** only.
- Supplier Voucher Packet V2 UAT.
- **No send.**

## 2. Preflight
- Booking was **synthetic**.
- Status **draft**.
- **1** booking service.
- **QA Staging Supplier** assigned through the **V2 supplier assignment path**.
- Confirmation status **CONFIRMED**.
- **1** single-service voucher exists.
- **Packets = 0** before the test.
- Staging packet flag **ON**.
- Production packet flag **OFF**.
- Production voucher-send **disabled**.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.

## 3. Results
- Packet grouping returned **0 groups**.
- Generate packet — **BLOCKED**.
- Generate returned **"a groupingKey is required"** because no group existed.
- Packet PDF — **BLOCKED** (no packet existed).
- Send-preview / readiness — **BLOCKED** (no packet existed).
- Regenerate / duplicate guard — **BLOCKED** (no packet existed).
- Packet count stayed **0**.
- Booking status stayed **draft**.
- Totals / currency stayed **100 / 80 USD**.

## 4. Root cause
- The packet grouping checks **`assignedSupplierId`**.
- The V2 supplier assignment writes **`supplierId` / `supplierName`**.
- **`assignedSupplierId` remains null.**
- Therefore a V2-assigned service is treated as **unassigned** by the packet grouping.
- A **direct DB workaround was not used** because it would mask the defect.

## 5. Negative / safety checks
- finance packet actions — **blocked (403)**.
- agent packet actions — **blocked (403)**.
- viewer packet actions — **blocked (403)**.
- packet-send **not called**.
- voucher-send **not called**.
- **No supplier email sent.**

## 6. Roll-up
- **Blockers: 0.**
- **Majors: 1.**
- **Minors: 0.**
- **Major:** Supplier Voucher Packet V2 cannot generate for a V2-assigned service until supplier-field
  alignment is fixed.

## 7. Recommended engineering follow-up
- Align the supplier fields between the V2 supplier assignment and the packet grouping.
- Either:
  - **(a)** have `assign-supplier` set `assignedSupplierId` consistently, or
  - **(b)** update the packet grouping to use `supplierId` / `supplierName` where appropriate.
- Decide with an **engineering fix plan before code**.
- Then re-run the packet UAT.

## 8. Confirmations
- No production mutation.
- No email sent.
- No flags changed.
- No packet created.
- No packet-send.
- No voucher-send.
- No passenger / rooming edit.
- Invoice not cleaned up.
- No supplier assignment / confirmation change.
- No booking conversion.
- No quote edits.
- No pricing apply.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 9. Net conclusion
- Packet V2 is currently **BLOCKED** for `BK-2026-0003`.
- **Role gating and no-send guarantees are correct.**
- The next step after this doc merges is an **engineering field-alignment fix plan**, not a DB
  workaround.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher / packet IDs are recorded
  here — only the human-readable booking reference, the supplier label, field names, results, and counts.

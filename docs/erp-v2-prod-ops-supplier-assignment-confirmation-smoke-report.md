# ERP V2 — Production Smoke: Ops V2 Supplier Assignment / Confirmation

**Date:** 2026-07-17
**Status:** Production smoke. Ops V2 supplier assignment + manual confirmation validated on the internal
test booking; assignment/confirmation left in place; no send. No code, schema, flag/env, or additional
production/staging change accompanies this report.

## 1. Environment
- **Production.**
- **Booking `BK-2026-0007`.**
- **Synthetic supplier: `ZZZ TEST SUPPLIER — DO NOT SEND`.**
- **Production smoke only.**

## 2. Preflight (all PASS)
- Booking was **draft**.
- **Internal test booking** from **`Q-2026-0082`**.
- **Exactly one service.**
- **No supplier assigned before smoke.**
- **`ZZZ TEST SUPPLIER — DO NOT SEND` exists.**
- Supplier has a **`.invalid` email**.
- Supplier assignment / confirmation controls **ON** in `-4gu9`.
- **Supplier sending disabled.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- Pre-state totals **10 / 10 JOD**.
- **Vouchers = 0.**
- **Packets = 0.**

## 3. Results
- **Assignment PASS** (HTTP 200).
- **`assignedSupplierId` set.**
- **`assignmentStatus = ASSIGNED`.**
- **Confirmation PASS** (HTTP 200).
- **`supplierConfirmationStatus = CONFIRMED`.**
- **Confirmation reference `UAT-PROD-CONFIRM-001`.**
- **Synthetic remarks recorded** ("synthetic internal smoke only, no send").
- **Booking status stayed draft.**
- **Totals / currency stayed 10 / 10 JOD.**
- **Voucher / packet count stayed 0 / 0.**
- **Viewer PATCH blocked with 403** (row state unchanged).
- **Smoke PASS.**
- **Rollback not needed.**

## 4. Field-alignment note (not a defect)
- The production **per-row assign path writes `assignedSupplierId` and `assignmentStatus`**.
- The **legacy `supplierId` / `supplierName` remain null by design** for this flow.
- **Downstream operational consumers read `assignedSupplierId` / the `assignedSupplier` relation**
  (grid display, voucher eligibility, packet grouping) — so the row is correctly assigned, voucher-eligible,
  and packet-groupable, and the name resolves at read time.
- This behavior is **documented in the service code** and is **not a defect for this smoke**.

## 5. Safety confirmations
- No email sent.
- No flags changed.
- No supplier-send.
- No voucher-send.
- No packet-send.
- No voucher generated.
- No packet created.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 6. Post-smoke state
- Assignment and confirmation **left in place** on the internal test booking.
- **Track for later cleanup.**
- **Rollout not broadened.**

## 7. Net conclusion
- Ops V2 supplier assignment / confirmation is **production-smoke validated**.
- The **safe synthetic supplier path worked**.
- **Role gating worked** (viewer 403; admin / operations only).
- **No send paths touched.**
- The next production enablement planning step can be **voucher generate / download** — still **no send**.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only the human-readable booking reference, supplier label, confirmation
  reference, flag / role names, field names, totals, and results.

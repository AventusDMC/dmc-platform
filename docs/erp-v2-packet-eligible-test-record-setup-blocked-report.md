# ERP V2 — Packet-Eligible Test Record Setup — BLOCKED Report

**Date:** 2026-07-17
**Status:** Production setup execution **BLOCKED** by the supplier-compatibility guard. No supplier
assigned/confirmed, no data changed, no flags changed, no email. No code, schema, flag/env, or
production/staging change accompanies this report.

## 1. Environment
- **Production.**
- **`BK-2026-0006`.**
- **Selected Activity service.**
- **Supplier attempted: `ZZZ TEST SUPPLIER — DO NOT SEND`.**

## 2. Preflight (all PASS)
- Booking was **internal / test**.
- Status **draft**.
- Activity service **voucher-free**.
- **No packet.**
- Service was **UNASSIGNED**.
- **Packet flags OFF.**
- **Voucher-send disabled.**
- **Allowlist remains `ziad@axisdmc.com` only.**

## 3. Result
- **Assignment returned HTTP 400.**
- **Confirmation returned HTTP 400** because the assignment did not happen (confirmation requires an
  assigned supplier).
- **Setup BLOCKED.**
- **Booking status unchanged** (draft).
- **Totals / currency unchanged.**
- **Voucher count 0.**
- **Packet count 0.**
- **No data changed** (both 400s were rejected before any write).

## 4. Root cause
- The **supplier compatibility guard rejected the supplier**.
- **Activity rows require an `ACTIVITY` / `EXCURSION` / `EXPERIENCE` / `TOUR` / `ATTRACTION`-compatible
  supplier type / name.**
- **ZZZ supplier is type `other`** and its name contains "SUPPLIER".
- **ZZZ is compatible with `other` / `SERVICE` rows, not Activity or Guiding rows** (which is why it worked
  on the earlier `other`-type service smoke).
- The **Guiding service would also need a guide-compatible supplier** (`GUIDE` / `GUIDING`).

## 5. Safety confirmations
- No email sent.
- No flags changed.
- Packet flags remain OFF.
- No voucher created.
- No packet created.
- No data changed.
- No supplier assignment.
- No supplier confirmation.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 6. Recommended follow-up
- **Create a compatible synthetic activity supplier** as a **separate approved setup**.
- Recommended label: **`ZZZ TEST ACTIVITY SUPPLIER — DO NOT SEND`**.
- Type: **`activity`**.
- Email: **non-deliverable `.invalid` email**.
- Then **retry assigning the `BK-2026-0006` Activity service**.
- **Still no voucher, no packet, no send.**

## 7. Net conclusion
- The setup was **safely blocked by the compatibility guard**.
- **No production data changed.**
- The next step is a **compatible synthetic supplier setup plan / execution — not a workaround**.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only the human-readable booking reference, service type / label, the
  supplier label, flag / role names, and the results.

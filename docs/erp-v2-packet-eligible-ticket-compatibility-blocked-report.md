# ERP V2 — Packet-Eligible Setup (TICKET Compatibility) — BLOCKED Report

**Date:** 2026-07-17
**Status:** Production setup retry **BLOCKED** by the supplier-compatibility guard (operationType = TICKET).
No supplier assigned/confirmed, no data changed, no flags changed, no email. This report also **corrects the
earlier root-cause diagnosis**. No code, schema, flag/env, or production/staging change accompanies this
report.

## 1. Environment
- **Production.**
- **`BK-2026-0006`.**
- **Selected service: Activity — "Dead Sea Resort Day Pass - Estimate Entrance Fee".**
- **Attempted supplier: `ZZZ TEST ACTIVITY SUPPLIER — DO NOT SEND`.**

## 2. Result
- **Assignment returned HTTP 400.**
- **Confirmation returned HTTP 400** because the assignment did not happen.
- **Setup BLOCKED.**
- **Booking status unchanged** (draft).
- **Totals / currency unchanged at 190.5 / 190.5 USD.**
- **Voucher count 0.**
- **Packet count 0.**
- **No data changed** (both 400s were rejected before any write).

## 3. Corrected root cause
- The **compatibility guard uses `operationType`, not just the service label / `serviceType`**
  (`operationType` overrides `serviceType`).
- The **selected row's `operationType` is `TICKET`**.
- The **`TICKET` rule requires a supplier `type` / `name` containing
  `TICKET` / `ATTRACTION` / `SERVICE` / `MUSEUM` / `SITE`**.
- The **`activity` supplier does not satisfy the `TICKET` rule** (`"ACTIVITY … ACTIVITY SUPPLIER …"`
  matches none of the required keywords).
- The **original `other` supplier also did not satisfy the `TICKET` rule** (its earlier failure was the
  same TICKET incompatibility, not an ACTIVITY-rule failure).
- The **earlier ACTIVITY-rule diagnosis was incorrect and is corrected here** — the effective driver is
  `operationType=TICKET`, so the `activity`-type supplier does not unblock this row.

## 4. Safety confirmations
- No email sent.
- No flags changed.
- Packet flags remain OFF.
- No voucher created.
- No packet created.
- No supplier assignment.
- No supplier confirmation.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 5. Cleanup tracking
- **`ZZZ TEST SUPPLIER — DO NOT SEND` remains unused for this row.**
- **`ZZZ TEST ACTIVITY SUPPLIER — DO NOT SEND` remains unused for this row.**
- **Both should be tracked for later cleanup / review.**

## 6. Recommended follow-up
- **Create a compatible synthetic ticket-named supplier** as a **separate approved setup**.
- Recommended label: **`ZZZ TEST TICKET SUPPLIER — DO NOT SEND`** (name contains `TICKET`).
- Use a **non-deliverable `.invalid` email**.
- Then **retry the assignment / confirmation**.
- **No voucher, no packet, no send.**

## 7. Net conclusion
- The setup was **safely blocked by the compatibility guard**.
- **No production data changed.**
- The next step is a **compatible `TICKET` supplier setup — not a workaround**.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only the human-readable booking reference, service type / label, the
  supplier labels, flag / role names, the compatibility rule names, and the results.

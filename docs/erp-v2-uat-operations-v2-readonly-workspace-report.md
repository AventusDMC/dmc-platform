# ERP V2 — UAT Operations V2 Read-Only Workspace Check

**Date:** 2026-07-16
**Status:** Read-only staging UAT (GET only). No code, schema, flag, production, or data change
accompanies this report.

Confirms the Operations V2 workspace renders correctly for the booking created from `Q-2026-0003`.

## 1. Environment
- **Staging only.**
- **Booking `BK-2026-0003`** only.
- **Read-only GET checks only.**

## 2. Booking state
- Status **draft**.
- Linked to quote **Q-2026-0003**.
- **1** booking service.
- Service type **"other"**.
- **No supplier assigned**.
- **1 passenger**.
- **0 vouchers**.
- **0 packets**.
- Finance source / totals **100 sell / 80 cost USD**.

## 3. Results
| Check | Result |
|---|---|
| Ops V2 workspace renders | **PASS** |
| Booking header renders | **PASS** |
| Service list renders | **PASS** |
| No supplier assigned | **PASS** |
| Passenger / rooming tab renders read-only | **PASS** |
| Finance summary renders | **PASS** |
| Totals / currency preserved (100 / 80 USD) | **PASS** |
| Activity / audit tab renders | **PASS** |
| No mutation buttons used / GET-only | **PASS** |

## 4. Role gating
| Role | Result |
|---|---|
| super_admin | **PASS** — access |
| admin | **PASS** — access |
| operations | **PASS** — access |
| agent_admin | **PASS** — access |
| finance | **PASS** — blocked from the Ops workspace; uses Classic `/finance` |
| agent | **PASS** — blocked |
| viewer | **PASS** — blocked |

## 5. Minor observations
1. The activity quote item maps to a booking service of type **"other"** — product confirmation
   recommended.
2. The source quote linkage exists in data, but **`Q-2026-0003` is not surfaced as the quote number in
   the workspace SSR** — product confirmation recommended.

## 6. Roll-up
- **Blockers: 0.**
- **Majors: 0.**
- **Minors: 2.**
- **Operations V2 read-only workspace UAT PASS.**

## 7. Confirmations
- No production mutation.
- No email sent.
- No flags changed.
- No supplier assignment.
- No voucher / packet created.
- No passenger / rooming edit.
- Invoice not cleaned up.
- No booking edits.
- No write Operations UAT started.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 8. Net conclusion
- The Operations V2 read-only workspace **renders correctly** for `BK-2026-0003`.
- **Role gating is correct.**
- **Totals preserved** at 100 / 80 USD.
- Ready for a **separately approved write UAT step** later.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice IDs are recorded here — only the
  human-readable quote and booking references, results, and counts.

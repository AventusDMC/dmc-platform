# ERP V2 — UAT Passenger / Rooming Read + Edit Check

**Date:** 2026-07-16
**Status:** Staging execution via the normal V2 Passenger / Rooming app/API path. No code, schema, flag,
or production change accompanies this report.

Confirms passenger read + a safe edit on the booking created from `Q-2026-0003`.

## 1. Environment
- **Staging only.**
- **Booking `BK-2026-0003`** only.

## 2. Preflight
- Booking was **synthetic**.
- Status **draft**.
- Linked quote **Q-2026-0003**.
- Totals **100 sell / 80 cost USD**.
- **1 synthetic passenger**.
- **No editable rooming structure** — activity-only booking.
- Production flags unchanged.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.

## 3. Results
- Passenger / Rooming tab renders — **PASS**.
- Existing passenger visible for authorized roles — **PASS**.
- **admin / operations / super_admin** see full allowed passenger detail.
- **finance / agent / viewer** blocked from the workspace as expected.
- **agent_admin** sees a redacted view as expected.
- Empty rooming state renders — **PASS**.
- Safe non-PII passenger edit — **PASS**.
  - Edited field (label only): **`dietaryNotes`**.
  - Edit persisted.
  - `updatedAt` advanced.
  - Audit actor recorded.
  - PII untouched.
  - Totals / currency unchanged.
  - Booking status unchanged.

## 4. Negative checks
- agent passenger edit — **blocked (403)**.
- viewer passenger edit — **blocked (403)**.
- agent PII export — **blocked (403)**.
- viewer PII export — **blocked (403)**.
- agent_admin PII export — **blocked (403)**.

## 5. Rooming
- Rooming edit — **NOT APPLICABLE**.
- Reason: `BK-2026-0003` is activity-only and has **no hotel / room structure**.
- Future rooming edit UAT requires a hotel / room booking setup.

## 6. Roll-up
- **Blockers: 0.**
- **Majors: 0.**
- **Minors: 0.**
- **Not applicable: 1** (rooming edit).

## 7. Confirmations
- No production mutation.
- No email sent.
- No flags changed.
- No supplier assignment.
- No voucher / packet created.
- Invoice not cleaned up.
- No supplier confirmation.
- No booking conversion.
- No quote edits.
- No pricing apply.
- No extra passengers created.
- No supplier / voucher UAT started.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 8. Net conclusion
- Passenger read and a **safe passenger edit** work correctly on staging.
- **Role and PII-export gating are correct.**
- Rooming edit needs a **separate hotel / room booking setup**.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, internal UUIDs / raw user / supplier / invoice IDs, or passport / DOB / private
  passenger values are recorded here — only the human-readable quote and booking references, the edited
  field label, results, and counts.

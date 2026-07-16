# ERP V2 — UAT Booking Creation V2 Controlled Staging Test

**Date:** 2026-07-16
**Status:** Staging execution via the normal V2 booking-creation route. No code, schema, flag, or
production change accompanies this report.

Converts accepted quote `Q-2026-0003` into one booking through Booking Creation V2.

## 1. Environment
- **Staging only.**
- **Accepted quote `Q-2026-0003`** ("UAT-P2 Quote - Phase 2 Test") only.

## 2. Preflight
- Quote was **ACCEPTED**.
- Accepted version existed.
- Totals **100 sell / 80 cost USD**.
- Booking count was **0** before conversion.
- Staging **`QUOTE_BOOKING_CREATE=true`**.
- Production **`QUOTE_BOOKING_CREATE=false/OFF`**.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.

## 3. Results
- **V2 quote-to-booking conversion — PASS.**
- Booking **BK-2026-0003** created.
- Booking status **draft**.
- **Exactly one booking created.**
- Quote remains **ACCEPTED**.
- Quote **links to the booking**.
- **One booking service created.**
- **No supplier assigned.**
- Finance totals / currency **preserved at 100 / 80 USD**.
- **Duplicate guard — PASS:** the second conversion returned `alreadyExisted:true` with the same
  booking reference; **no second booking created**.

## 4. Minor observation
- The activity quote item mapped to a booking service of type **"other"**.
- This appears to come from the shared `convertToBooking` engine (the same engine Classic uses).
- It is **not a V2-specific blocker**.
- **Product confirmation recommended** that this service-type mapping is intended.

## 5. Roll-up
- **Blockers: 0.**
- **Majors: 0.**
- **Minors: 1.**
- **Booking Creation V2 staging test PASS.**

## 6. Confirmations
- No production mutation.
- No email sent.
- No flags changed.
- No supplier assignment.
- No voucher / packet created.
- No passenger / rooming edit.
- Invoice not cleaned up.
- No new quote / contact / day / item.
- No quote edits.
- No pricing apply.
- No proposal action.
- No broader Phase 3 started.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 7. Net conclusion
- Booking Creation V2 works **end-to-end on staging** for `Q-2026-0003`.
- **BK-2026-0003** is now the staging test booking for later Operations V2 / Passenger-Rooming / voucher
  UAT.
- Production booking-create remains **OFF**.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, public token values, or internal UUIDs / raw user / supplier / invoice IDs are
  recorded here — only the human-readable quote and booking references, results, and counts.

# ERP V2 — Packet-Eligible Test Record Setup Plan for BK-2026-0006

**Date:** 2026-07-17
**Status:** Planning only. **No supplier assigned/confirmed, no data edits, no flags changed, no
production/staging touched, no email.** No code, schema, or environment change accompanies this plan.

## 1. Purpose
- Prepare **one** packet-eligible internal test service.
- Use it later for the **Packet V2 no-send smoke**.
- **Do not create a packet in setup.**

## 2. Read-only findings
- **`BK-2026-0006` is an internal test booking.**
- Booking status **draft**.
- It has **two services**.
- **Both services are currently UNASSIGNED.**
- **Both are voucher-free.**
- **No packet exists** for the selected service.

## 3. Candidate services
- **Guiding service** — eligible but **dateless**.
- **Activity service** — "Dead Sea Resort Day Pass / Estimate Entrance Fee".
- **Activity is the recommended lower-risk candidate because it has a service / operational date** (packet
  generate + PDF and voucher-required-field checks rely on a date; the Guiding service has none).

## 4. Required final setup state
- Selected **Activity service assigned to `ZZZ TEST SUPPLIER — DO NOT SEND`**.
- **`assignmentStatus=ASSIGNED`.**
- **Confirmation status `CONFIRMED`.**
- **Synthetic confirmation reference: `UAT-PROD-PACKET-CONFIRM-001`.**
- **No standalone voucher.**
- **No packet.**
- **Booking status / totals / currency unchanged.**
- **No email.**

## 5. Explicitly out of scope
- packet generation.
- voucher generation.
- packet-send.
- voucher-send.
- supplier email.
- quote edits.
- booking conversion.
- passenger / rooming edits.
- finance writes.
- catalog / supplier / rate edits.

## 6. Setup execution strategy (later)
- Use the **already-validated Ops V2 assignment / confirmation paths**.
- **Assign the `ZZZ` supplier** to the selected Activity service.
- **Record `CONFIRMED`** with the synthetic reference.
- **Do not generate a voucher.**
- **Do not create a packet.**
- **Do not enable packet flags.**

## 7. Verification after later setup
- Selected service **is assigned**.
- **`assignmentStatus=ASSIGNED`.**
- **Confirmation status `CONFIRMED`.**
- **Voucher count for the selected service remains 0.**
- **Packet count for the selected group remains 0.**
- **Booking status / totals / currency unchanged.**
- **No email sent.**
- **Voucher-send allowlist unchanged.**

## 8. Rollback / cleanup
- **Leave the setup in place** until the Packet V2 smoke is documented.
- Later cleanup may **unassign / reset confirmation** if approved.
- **No automatic cleanup.**

## 9. GO / NO-GO
- **GO** only if the selected service remains voucher-free and packet-free.
- **GO** only if the `ZZZ` supplier remains safe.
- **GO** only if no email path is used.
- **NO-GO** if the selected service already has a voucher / packet or risks real supplier / client data.

## 10. Recommended execution order
1. Save this plan as a doc PR.
2. **Approve setup execution separately.**
3. Assign + confirm the selected Activity service.
4. Document the setup.
5. Then approve **packet flag enablement + smoke** separately.

## 11. Safety boundaries
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- **Supplier sending remains disabled.**
- No supplier emails.
- No voucher-send.
- No packet-send.

## 12. Net conclusion
- **The `BK-2026-0006` Activity service is the clean, lower-risk packet test candidate.**
- Making it packet-eligible requires **only assign + confirm** with the `ZZZ` supplier.
- Setup remains a **separate approved step**.
- **No production action was taken by this plan.**

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No supplier assigned / confirmed.
- No voucher generated.
- No packet created.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only the human-readable booking reference, service type / label, the
  supplier label, flag / role names, and the plan.

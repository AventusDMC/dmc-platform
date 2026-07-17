# ERP V2 — Production Internal Test Quote Setup Plan (for Booking Creation V2)

**Date:** 2026-07-17
**Status:** Planning only. **No quote created, no acceptance, no flags changed, no production touched.**
No code, schema, environment, or data change accompanies this plan.

## 1. Purpose
- Prepare **exactly one accepted-but-unconverted internal prod test quote**.
- Use it later for the Booking Creation V2 smoke.
- **Do not convert it during setup.**

## 2. Required final quote state
- Clearly labeled **internal test quote**.
- Status **ACCEPTED**.
- **acceptedVersion exists.**
- **At least one priced item.**
- Totals / currency known.
- **Booking count = 0.**
- No supplier assignment.
- No voucher / packet.
- No email sent.

## 3. Naming / labeling
- Title: **`UAT-PROD-BOOKING-CREATE — DO NOT SEND`**.
- **Internal Axis company only** (the DMC's own company).
- **Safe synthetic `.invalid` contact** (non-deliverable).
- **No real client data.**

## 4. Suggested setup flow
1. Create quote shell under the **internal company**.
2. Add **one safe priced item** through the **standard item-create path**.
3. Save a quote version.
4. Mark as **SENT** only if required by the accept gate (status-only; no email).
5. Enable / open the proposal link only as a tester, if required (token only; no email).
6. **Accept** the quote (no email).
7. Confirm **no booking created**.
8. Confirm **accepted + unconverted**.

## 5. Safety constraints
- No real client communication.
- No email.
- No supplier communication.
- No supplier-send.
- No voucher-send.
- No packet-send.
- **Booking-create flags remain OFF during setup.**
- **No conversion during setup.**

## 6. Expected side effects
- **Accept may auto-generate a client invoice** (as observed on staging).
- **Track the quote / invoice / later booking for cleanup.**
- **No cleanup during setup** unless separately approved.

## 7. Role / access
- **admin or super_admin only.**
- **viewer / agent / finance do not participate.**

## 8. Verification after setup
- Quote status **ACCEPTED**.
- `acceptedAt` set.
- **acceptedVersion exists.**
- Totals / currency correct.
- **Booking count = 0.**
- Booking-create flags **still OFF**.
- **No email sent.**
- **No supplier / voucher / packet created.**

## 9. Rollback / cleanup
- If setup **fails before acceptance** → archive/delete the synthetic quote if safe.
- If **accepted** → track the quote + generated invoice for later cleanup.
- **No cleanup without separate approval.**

## 10. GO / NO-GO
- **GO** only with the internal company + synthetic contact strategy.
- **GO** only if no email path is used.
- **GO** only if booking-create flags remain OFF.
- **NO-GO** if any step risks real client data, email, supplier send, or conversion.

## 11. Recommended execution order
1. Save this plan as a doc PR.
2. Approve setup execution separately.
3. Prepare the accepted internal quote.
4. Document the setup.
5. Only then enable booking-create flags and run the conversion smoke.

## 12. Confirmations
- No code changed.
- No data changed.
- No quote created or accepted.
- No booking conversion / creation.
- No schema / migration.
- No flags / environment changed.
- No production / staging behavior changed.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## Net conclusion
- The internal prod test quote setup is **feasible and low-risk**.
- It remains a **separate approved execution step**.
- Booking Creation V2 prod conversion remains **NO-GO until the accepted internal test quote exists**.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher / packet IDs are recorded
  here — only the quote label, company name, flag/role names, and the plan.

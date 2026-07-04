# Booking Creation V2 — Production Pilot Acceptance Report

**Date:** 2026-07-04
**Environment:** Production (real prod API + prod data)
**Verdict:** ✅ First production Booking Creation V2 conversion succeeded. Production flags returned to OFF.
**Scope of change:** Documentation only. No code, schema, flag, or environment change accompanies this report.

Feature: Quote Builder V2 → **Create Booking** → Operations V2, behind
`QUOTE_BOOKING_CREATE` (backend) / `NEXT_PUBLIC_QUOTE_BOOKING_CREATE` (frontend),
both default OFF / fail-closed. The pilot was a **single-booking, single-operator** conversion
executed through the authoritative backend endpoint only; the Create Booking card was never
exposed to staff.

References: `docs/booking-creation-v2-production-pilot-plan.md`,
`docs/booking-creation-v2-staging-acceptance.md`,
`docs/booking-creation-v2-launch-control.md`.

---

## 1. Quote

- **Q-2026-0081** — internal test dummy, "ZZZ TEST — BOOKING V2 PILOT — DO NOT SEND".
- Status ACCEPTED with a populated accepted version; latest revision; USD; internal company + internal
  contact (no client PII, no client email). Two priced items with resolving suppliers.

## 2. Booking

- **BK-2026-0006** — created from Q-2026-0081.

## 3. Conversion result

- `POST /quotes/<quote>/v2/booking` → **HTTP 201**.
- `alreadyExisted: false` (fresh creation).
- Returned a booking reference and an "Open in Operations V2" link.
- No 500s, no unhandled errors, no email sent by conversion.

## 4. Service rows

Two rows, both correctly mapped with resolving catalog suppliers:

| Row        | Operation type | Service                                   | Supplier                | Amount |
| ---------- | -------------- | ----------------------------------------- | ----------------------- | ------ |
| Guide      | **GUIDE**      | Licensed Jordan Guide Service             | Desert Compass Guides   | 120.00 |
| Entrance   | **TICKET**     | Dead Sea Resort Day Pass – entrance fee   | Jordan Entrance Fees    | 70.50  |

The entrance-fee line maps to **TICKET** (not ACTIVITY) by the mapper's entrance-fee-dominant
classification. This is accepted as correct behavior.

## 5. Finance

| Metric         | Value            |
| -------------- | ---------------- |
| Currency       | **USD**          |
| Quoted sell    | **USD 190.50**   |
| Quoted cost    | **USD 190.50**   |
| Margin         | **USD 0.00 (0%)** |

The 0% margin (both items carried no markup) raises the expected **low-margin** indicator in
Operations V2. This is expected and acceptable for this pilot.

## 6. Frontend card was never exposed

The production frontend flag was never live, so the Create Booking card was **never shown** to any
user at any point during the pilot. The conversion was performed through the authoritative backend
endpoint (the same call the card issues).

## 7. Backend flag — narrow window only

`QUOTE_BOOKING_CREATE` was enabled on the production API only for the brief conversion window and
then disabled again. Redeploys completed successfully on both enable and disable.

## 8. Frontend NEXT_PUBLIC flag — removed, never deployed

`NEXT_PUBLIC_QUOTE_BOOKING_CREATE` was added to the production admin-web (4gu9) environment, but the
rebuild did not go live (blocked by a Vercel CLI upload limit). The env var was then removed. Because
it was never inlined into a live build, no frontend deployment ever carried the flag, and no rebuild
was required to remove it.

## 9. Kill-switch verified

After disabling the backend flag, `POST /quotes/<quote>/v2/booking` returns **HTTP 400
`feature_disabled`** (fail-closed, no mutation), confirming the backend flag is the effective kill
switch.

## 10. No email sent

Conversion creates database rows only and sends no email. The separate, already-gated voucher-send
flow was not exercised and its flag remained OFF.

## 11. Voucher-send allowlist unchanged

The voucher-send recipient allowlist remains limited to **`ziad@axisdmc.com`** only. It was not
touched by the pilot.

## 12. Booking retained

**BK-2026-0006 is retained** (not deleted). Q-2026-0081 was not modified. No additional booking or
quote was created; no duplicate booking exists (the quote has exactly one booking).

## 13. Remaining note — production UI path

The production **UI path** (visible card → click) was not exercised in production: the staging
acceptance run already validated the full UI card path end-to-end, and the production frontend build
did not go live (Vercel CLI upload limit). If the production UI path is ever needed, use a
Git-triggered redeploy or a compressed-archive upload for the admin-web build rather than the direct
CLI upload.

---

## Safety confirmation (post-pilot)

- **Production flags OFF** — backend `QUOTE_BOOKING_CREATE` disabled; frontend
  `NEXT_PUBLIC_QUOTE_BOOKING_CREATE` removed/absent. Not to be re-enabled without explicit approval.
- **No email sent**; supplier email / voucher-send behavior untouched; allowlist unchanged
  (`ziad@axisdmc.com` only).
- **BK-2026-0006 retained**; Q-2026-0081 unmodified.
- Documentation only — no code, schema, flag, or environment change in this report.

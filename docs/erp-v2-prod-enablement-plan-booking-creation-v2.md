# ERP V2 — Controlled Production Enablement Plan: Booking Creation V2

**Date:** 2026-07-17
**Status:** Planning only. **No flags changed, no production conversion run.** No code, schema,
environment, or data change accompanies this plan.

## 1. Purpose
- Controlled production enablement plan for **Booking Creation V2**.
- The **next V2 production surface after Passenger / Rooming edit**.
- **Planning only.**
- **No flags changed.**
- **No production conversion run.**

## 2. Scope to enable
- V2 **quote-to-booking conversion** for accepted quotes.
- **Duplicate guard.**
- **Booking reference creation.**
- **Finance snapshot preservation.**
- **Quote-to-booking linkage.**

## 3. Explicitly out of scope
- Broad rollout.
- Real client conversion unless explicitly approved.
- Supplier assignment.
- Voucher generation.
- Packet generation.
- Passenger / rooming edits.
- Finance writes.
- Supplier-send / voucher-send.

## 4. Required production flags (verified read-only; not changed)
- **`QUOTE_BOOKING_CREATE`** — backend flag, currently **`false` / OFF** in production.
- **`NEXT_PUBLIC_QUOTE_BOOKING_CREATE`** — frontend flag, currently **absent / OFF** on `-4gu9`.
- **Both are required.**
- The **backend flag is fail-closed** (the conversion endpoint rejects unless it is truthy — even
  API-driven).
- The **frontend flag requires a `-4gu9` rebuild** (build-time).
- **Staging has the validated config** (both ON).
- **No flags changed in this plan.**

## 5. Role access
- **admin / operations** — allowed.
- **super_admin** — allowed via guard coalescing.
- **agent_admin** — allowed (coalesces to admin).
- **viewer / agent** — blocked.
- **finance** — blocked.

## 6. Production test-record strategy — prerequisite gap
- **Current prod has no accepted-but-unconverted internal / test quote** (all accepted quotes are
  already converted).
- **Current execution status is NO-GO** until **one labeled internal accepted prod test quote is
  prepared**.
- Create a **synthetic internal test quote later** as a **separate approved setup** (create → item →
  Mark-as-Sent → save version → Accept).
- **No real client quote** unless explicitly approved.
- No supplier communication.
- No email.
- No downstream supplier / voucher / packet action.
- **Track the generated quote / invoice / booking for later cleanup** (the Accept step auto-generates a
  client invoice; the conversion creates one booking).

## 7. Smoke-test plan (after enablement)
1. Enable only `QUOTE_BOOKING_CREATE` and `NEXT_PUBLIC_QUOTE_BOOKING_CREATE`.
2. **Rebuild `-4gu9`.**
3. Convert one labeled accepted internal quote.
4. Confirm **exactly one booking created**.
5. Confirm the **duplicate guard**.
6. Confirm the **quote remains ACCEPTED and links to the booking**.
7. Confirm **totals / currency preserved**.
8. Confirm **no email**.
9. Confirm **no supplier / voucher / packet created**.

## 8. Rollback plan
- Turn `QUOTE_BOOKING_CREATE` **OFF**.
- Remove / turn OFF `NEXT_PUBLIC_QUOTE_BOOKING_CREATE`.
- **Rebuild `-4gu9`.**
- Confirm the create-booking affordance disappears.
- **No DB rollback** unless the test quote / booking / invoice cleanup is separately approved.

## 9. Monitoring
- API / admin-web errors.
- Audit trail / `booking.created`.
- Booking count.
- Duplicate-guard behavior.
- Totals / currency.
- No email / send events.

## 10. GO / NO-GO criteria
- **GO** only if exact flags are confirmed.
- **GO** only with a labeled internal accepted quote.
- **GO** only with a rollback owner.
- **Current state: NO-GO** because no accepted-unconverted internal prod quote exists.
- **NO-GO** if flag ambiguity, no safe accepted quote, or any pricing / booking-link uncertainty.

## 11. Recommended execution order
1. Approve plan.
2. Prepare one internal accepted prod test quote as a **separate approved setup**.
3. Confirm flags.
4. Enable backend + frontend booking-create flags.
5. Rebuild `-4gu9`.
6. Run one conversion smoke.
7. Run the duplicate guard.
8. Document result.
9. Keep broader rollout paused.

## 12. Safety boundaries
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.
- No supplier emails.
- No voucher / packet / send paths.
- Production flags remain unchanged until explicitly approved.

## 13. Net conclusion
- Booking Creation V2 production enablement is **technically ready for controlled planning**.
- Execution is **NO-GO until an internal accepted prod test quote exists**.
- The next step after this doc merges is a **separate approved setup** for that internal accepted test
  quote.

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No quote created or accepted.
- No booking conversion.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher / packet IDs are recorded
  here — only flag names, role names, and the plan.

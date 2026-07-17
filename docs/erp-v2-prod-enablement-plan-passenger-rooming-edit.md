# ERP V2 — Controlled Production Enablement Plan: Passenger / Rooming Edit

**Date:** 2026-07-17
**Status:** Planning only. **No flags changed, no production touched.** No code, schema, environment, or
data change accompanies this plan.

## 1. Purpose
- Controlled production enablement plan for **Passenger / Rooming edit**.
- The **first low-risk V2 production edit surface**.
- **Planning only.**
- **No flags changed.**

## 2. Scope to enable
- Passenger read.
- Safe passenger edit fields (non-PII operational notes — e.g., dietary notes, rooming notes,
  arrival / departure flight text).
- Rooming readiness / status display.
- Rooming edit **only where an existing validated room / rooming structure exists**.
- **No pricing-affecting passenger-count changes.**

## 3. Explicitly out of scope
- Passenger-count changes affecting pricing.
- Passport / private-PII bulk import.
- Unvalidated hotel / rooming edits.
- Supplier assignment.
- Voucher generation.
- Booking creation.
- Finance writes.
- Supplier send / voucher-send.

## 4. Required production flags (verified read-only; not changed)
- `NEXT_PUBLIC_OPS_V2_DEFAULT` — **already present / ON** on `-4gu9` (workspace reachable, read-only
  beta).
- `NEXT_PUBLIC_OPS_V2_PAX_EDIT` — **currently absent / OFF** on `-4gu9` (the pax/rooming editor gate).
- `NEXT_PUBLIC_OPS_V2_PAX_READINESS` — **currently absent / OFF** on `-4gu9` (readiness / status display).
- The **backend passenger edit endpoint is role-gated and has no separate flag**.
- `NEXT_PUBLIC` flags require a **Vercel env update + `-4gu9` rebuild** to take effect (build-time).
- **No flags changed in this plan.** (Staging already runs with `PAX_EDIT` + `PAX_READINESS` present —
  the exact config validated in UAT.)

## 5. Role access
- **admin / operations / super_admin** can edit where intended.
- **agent_admin** — redacted / no editor / export blocked.
- **finance** — blocked from the Ops V2 workspace; uses Classic `/finance`.
- **agent / viewer** — blocked.
- **PII export remains restricted** (admin / operations / super_admin only).

Editor visibility = `NEXT_PUBLIC_OPS_V2_PAX_EDIT === 'true'` AND role in {admin, operations, super_admin};
the backend edit endpoint accepts admin / operations (super_admin via coalescing).

## 6. Production test-record strategy
- Use **one clearly labeled internal / test booking** only.
- **No real client booking** unless explicitly approved.
- No email.
- No supplier communication.
- No pricing-affecting edits.
- **One safe non-PII note-field edit only.**
- Rollback / revert path for the test edit (set the note field back; delete the labeled test booking if
  one was created).

## 7. Smoke-test plan
1. Open the Ops V2 passenger tab.
2. Confirm the passenger list renders.
3. Perform one safe non-PII edit.
4. Confirm persistence.
5. Confirm totals / currency / status unchanged.
6. Confirm an audit / activity entry.
7. Confirm restricted roles blocked / redacted.
8. Confirm unauthorized PII export blocked.

## 8. Rollback plan
- Turn `NEXT_PUBLIC_OPS_V2_PAX_EDIT` **OFF**.
- Turn `NEXT_PUBLIC_OPS_V2_PAX_READINESS` **OFF** if needed.
- **Rebuild `-4gu9`.**
- Verify editor affordances disappear.
- Keep the read-only workspace intact.
- Revert the one safe test edit only if needed.

## 9. Monitoring
- API / admin-web errors.
- Audit trail.
- No pricing drift.
- No PII leak.
- No email / send events.

## 10. GO / NO-GO criteria
- **GO** only if exact flags are confirmed.
- **GO** only with a labeled internal production test booking.
- **GO** only with a rollback owner.
- **NO-GO** if flag ambiguity, no safe test booking, or any pricing / PII uncertainty.

## 11. Recommended execution order
1. Approve plan.
2. Confirm flags.
3. Enable only `PAX_EDIT` + `PAX_READINESS` on `-4gu9`.
4. Rebuild `-4gu9`.
5. Run one smoke test.
6. Document result.
7. Keep broader rollout paused until smoke passes.

## 12. Safety boundaries
- Production flags remain unchanged until explicitly approved.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.
- No supplier emails.
- No production testing started by this plan.

## 13. Net conclusion
- Passenger / Rooming prod edit enablement is **low-risk and frontend-gated**.
- The **backend is already role-gated**.
- **Staging validated the same config.**
- Execution still requires **explicit approval, a labeled prod test booking, and a rollback owner**.

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher / packet IDs are recorded
  here — only flag names, role names, and the plan.

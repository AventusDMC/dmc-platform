# ERP V2 — Internal Staff Controlled Usage Plan

**Date:** 2026-07-18
**Status:** Planning only. **No flags changed, no production/staging touched, no cleanup, no email.** No
code, schema, environment, or data change accompanies this plan.

## 1. V2 surfaces staff may use now (all production-smoke validated)
- **Passenger / Rooming edit.**
- **Booking Creation V2.**
- **Supplier assignment / confirmation.**
- **Voucher generate / preview / download.**
- **Packet V2 no-send.**

"Open in Classic" stays available on every screen.

## 2. Actions still forbidden
- **supplier send.**
- **voucher-send.**
- **packet-send.**
- **finance writes.**
- **catalog / supplier / rate edits.**
- **full no-Classic workflow.**

## 3. Roles
- **admin / operations** — full controlled V2 beta use.
- **super_admin** — allowed via coalescing.
- **agent_admin** — only where intended / redacted / **no PII export**.
- **finance** — uses Classic `/finance`.
- **agent / viewer** — blocked from V2 write surfaces.

The backend enforces these role gates; the UI mirrors them. Restricted roles must not be given
workarounds.

## 4. Daily workflow guidance
- **Quote work** where V2 supports it (fall back to Classic for anything V2 does not expose).
- **Convert an accepted quote to a booking** (Booking Creation V2; duplicate-guarded).
- **Safe passenger edits** (non-PII operational fields; passport / PII bulk work and pax-count / pricing
  changes stay in Classic).
- **Supplier assignment / confirmation** (records the confirmation outcome only — V2 sends nothing).
- **Voucher generation / preview / download** (internal use; do not attempt to email from V2).
- **Packet V2 no-send** (group → generate → PDF → regenerate → send-preview readiness only).
- **Fallback to Classic** for unsupported flows — any send / dispatch, finance / invoice / payment work,
  catalog / supplier / rate edits, and anything the V2 screen does not offer.

## 5. Safety rules
- **No supplier emails from V2.**
- **No send buttons** — if a send affordance ever appears active, stop and report.
- **No real supplier dispatch through V2.**
- **No catalog / rate edits in V2.**
- **No finance writes in V2.**
- **Stop / report unexpected behavior** immediately.

## 6. Monitoring
- **Audit logs.**
- **Booking activity.**
- **Voucher / packet counts.**
- **No-send checks.**
- **Role-gate checks.**
- **API / admin-web errors.**

## 7. Training plan
- **Start with 1–2 internal users** (admin / operations), supervised.
- **Supervised live bookings only.**
- **Report screenshots / results** — the V2 screen + outcome, the booking / quote reference, and whether
  totals / status stayed as expected.
- **Escalation path for anomalies** — active send button, unexpected totals change, role-gate leak, or
  error → stop, screenshot, report to the V2 owner; do not retry.

## 8. Rollback / pause plan
- **Pause V2 usage for the affected surface.**
- **Fallback to Classic.**
- **Turn off specific flags only if separately approved.**
- **Keep "Open in Classic" available** at all times.

## 9. GO / NO-GO
- ✅ **GO** for controlled internal staff use.
- ⛔ **NO-GO** for supplier send.
- ⛔ **NO-GO** for no-Classic launch.

## 10. Net conclusion
- **Staff may begin controlled internal-beta use of the five validated V2 surfaces.**
- **Start with supervised admin / operations users.**
- **Classic remains the fallback.**
- **Supplier send and full no-Classic launch remain NO-GO.**

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No cleanup started.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only surface names, role names, workflow guidance, and the plan.

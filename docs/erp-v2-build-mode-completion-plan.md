# ERP V2 — Build-Mode Completion Plan

**Date:** 2026-07-18
**Status:** Planning only. **ERP V2 is still being built — NOT ready for staff rollout or live bookings.**
All production smokes were validation only. No flags changed, no production/staging touched, no cleanup, no
staff rollout, no live-booking usage, no email. No code, schema, environment, or data change accompanies
this plan.

## 1. Current validated surfaces
- **Passenger / Rooming edit.**
- **Booking Creation V2.**
- **Supplier assignment / confirmation.**
- **Voucher generate / preview / download.**
- **Packet V2 no-send.**

## 2. Clarification of what "validated" means
- **Smoke-tested on internal / test records only.**
- **Not approved for staff / live operational use.**
- **Classic remains the fallback and the reference system.**
- **Passed smokes do not equal finished ERP readiness** — each smoke proves a surface works in isolation,
  not that the end-to-end operational workflow is complete or production-hardened.

## 3. Remaining build areas
- **Quote Builder V2 — full real quote workflow.**
- **Hotel / rooming coverage with real room structures.**
- **Operations V2 polish and consistency.**
- **Service-type mapping cleanup.**
- **Source-quote visibility.**
- **Supplier field display consistency.**
- **Finance write strategy.**
- **Catalog / supplier / rate edit strategy.**
- **Cleanup / admin tooling.**
- **Monitoring dashboards.**
- **Permissions / role polish.**
- **Send-safety design — later only.**

## 4. Current Classic dependencies
- **Finance writes.**
- **Invoices / payments / reconciliation.**
- **Catalog / supplier / rate edits.**
- **Quote-building gaps.**
- **Cleanup / admin tools.**
- **Supplier send / dispatch.**

## 5. Recommended build order
1. **Harden Quote Builder V2.**
2. **Complete hotel / rooming coverage.**
3. **Fix known minor observations.**
4. **Improve Ops V2 display consistency.**
5. **Build cleanup / admin tooling.**
6. **Finance V2 roadmap.**
7. **Catalog / supplier / rate edit roadmap.**
8. **Send-safety review — last.**

## 6. Ready-for-staff-rollout criteria
- **Critical workflows tested end-to-end.**
- **No open blockers / majors.**
- **Classic fallback documented.**
- **Cleanup / monitoring process ready.**
- **Staff training material ready.**
- **Owner approval.**

## 7. Ready-for-live-bookings criteria
- **Quote → booking → ops → voucher/packet stable on real data.**
- **Hotel / rooming coverage tested.**
- **Finance handoff clear.**
- **Supplier send still disabled unless separately approved.**
- **Rollback plan ready.**

## 8. Current build status
- **Five surfaces smoke-validated.**
- **V2 is a functional operational skeleton.**
- **Not a finished ERP.**
- **Classic remains the system of record.**

## 9. Remaining gaps
- **Quote Builder V2 not the full real workflow.**
- **Hotel / rooming coverage thin.**
- **Finance / catalog / rate edits absent.**
- **Service-type / supplier-field inconsistencies.**
- **No cleanup / admin tooling.**
- **Monitoring manual.**
- **Send-safety undesigned.**

## 10. Recommended next 5 build tasks
1. **Quote Builder V2 hardening.**
2. **Hotel / rooming coverage.**
3. **Service-type + supplier-field display fixes.**
4. **Source-quote visibility + Ops display consistency.**
5. **Cleanup / admin tooling.**

## 11. Suggested timeline (indicative)
- **Weeks 1–2:** Quote Builder V2 hardening.
- **Weeks 2–4:** hotel / rooming coverage.
- **Weeks 3–4:** mapping / display fixes.
- **Week 5:** cleanup / admin tooling.
- **Weeks 6+:** finance / catalog roadmaps and send-safety later.

## 12. GO / NO-GO
- ⛔ **NO-GO for staff rollout.**
- ⛔ **NO-GO for live bookings.**
- ⛔ **NO-GO for supplier send.**
- ✅ **GO for continued build + isolated validation on internal / test records only.**

## 13. Net conclusion
- **ERP V2 remains in active build-mode.**
- **Production smokes were validation only.**
- **Staff / live usage remains blocked.**
- **Classic remains the system of record.**

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No staff rollout started.
- No live bookings used.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only surface names, build-area names, criteria, and the plan.

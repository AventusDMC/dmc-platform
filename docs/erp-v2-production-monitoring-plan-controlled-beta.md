# ERP V2 — Production Monitoring Plan for Controlled Internal Beta

**Date:** 2026-07-18
**Status:** Planning only. **No flags changed, no production/staging touched, no cleanup, no email.** No
code, schema, environment, or data change accompanies this plan.

## 1. Scope
- **Passenger / Rooming edit.**
- **Booking Creation V2.**
- **Supplier assignment / confirmation.**
- **Voucher generate / preview / download.**
- **Packet V2 no-send.**

## 2. What to monitor
- **API errors** (prod API logs on the V2 routes).
- **admin-web errors** (`-4gu9` runtime logs on `/operations/v2/*` and the V2 quote builder).
- **Audit / activity logs** (every V2 write has a matching audit row).
- **Unexpected writes** (only the five enabled surfaces should write; no finance / catalog / rate / pax-count
  writes from V2).
- **Duplicate bookings / vouchers / packets** (guards must hold: 1 booking per accepted quote, 1 voucher
  per service, 1 packet per group).
- **Pricing / totals drift** (assignment / confirmation / voucher / packet are pricing-inert).
- **Role-gate leaks** (finance / agent / viewer blocked; agent_admin redacted / no PII export).
- **PII leaks** (no passport / PII exposure to non-privileged roles; PDFs client-safe).
- **Send / email events** (must be zero).

## 3. Safety checks
- **Supplier sending remains disabled.**
- **`OPS_V2_VOUCHER_SEND_ENABLED` remains `false`.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **No supplier emails.**
- **No voucher-send.**
- **No packet-send.**

## 4. Daily review checklist
- [ ] **Booking conversions** — new bookings match accepted quotes; no duplicates; totals preserved.
- [ ] **Passenger edits** — only safe operational fields; no PII writes by non-privileged roles.
- [ ] **Supplier assignment / confirmation records** — fields aligned; no real-supplier dispatch.
- [ ] **Voucher counts** — one per service; PDFs finance-safe; no send.
- [ ] **Packet counts** — one per group; PDFs finance-safe; no send.
- [ ] **Error logs** — API + admin-web; no new error class on V2 routes.
- [ ] **Audit rows** — every V2 write has a corresponding audit entry.
- [ ] **Send / flag check** — send flags OFF, allowlist unchanged, zero send events.

## 5. Alert / escalation rules
- **Active send button appears** on any V2 surface.
- **Email / send event detected** in logs.
- **Pricing / totals drift** on a V2-touched booking.
- **Unauthorized role access** (restricted role reaching a write control / endpoint).
- **Duplicate records** (a second booking / voucher / packet).
- **PDF finance leak** (cost / margin / payable in a voucher or packet PDF).
- **Production error spike** on V2 routes.
- **Escalation path:** **capture evidence (screenshots / logs / audit rows), stop, report to the V2 owner,
  decide continue / pause / rollback**; do not retry a failing action.

## 6. Owner / cadence
- **Owner:** the V2 enablement owner / admin-operations lead.
- **Backup reviewer** named.
- **Daily during the first week.**
- **Reduce to 2–3 times per week after a stable period.**
- **Weekly after continued stability.**
- **Full checklist after any deploy or flag change**, regardless of cadence.

## 7. Rollback / pause plan
- **Pause usage of the affected V2 surface.**
- **Fall back to Classic** ("Open in Classic" always available).
- **Disable the specific flag only if separately approved.**
- **Preserve evidence before any cleanup.**
- **A Critical send-related trigger** (active send button / send event / allowlist change) means
  **pause / rollback immediately**, then investigate.

## 8. Net conclusion
- **Controlled beta can continue under monitoring.**
- **Supplier send remains NO-GO.**
- **Full no-Classic launch remains NO-GO.**

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
  packet IDs are recorded here — only surface names, signal names, flag / role names, and the plan.

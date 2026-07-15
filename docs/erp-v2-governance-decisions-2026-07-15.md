# ERP V2 — Governance Decision Record

**Decision date:** 2026-07-15
**Status:** Decision record only. **No code, flag, environment, production, staging, or data change
accompanies this record.** It ratifies the current state and records rollback options.

Ratifies the two RISK-VERIFY findings from the production flag audit as accepted state.

---

## Decision summary
1. **Entrance / Jordan-Pass apply** (`QUOTE_PRICING_ENTRANCE_APPLY=true` in production) is **accepted as
   an intentional staff enablement.**
2. **The `-4gu9` admin build is confirmed as the canonical staff-production admin build.**
3. **Operations V2 on `-4gu9` is accepted as a read-only beta, live for internal staff.**

## Accepted state

### 1. Entrance / Jordan-Pass apply — accepted as intentional
- **admin / operations only.**
- **Multi-flag gated** (global preview + global apply + entrance preview + entrance apply — any one OFF
  blocks it).
- **Requires matching preview-token validation** (the applied payload must match the re-derived
  dry-run).
- **Status-gated to editable quotes.**
- **Uses the existing Classic update / recalculate path** — no schema or formula change.
- **Risk accepted as low–medium** governance / documentation risk (safe mechanism; previously
  unrecorded in launch notes — this record closes that gap).

### 2. Canonical staff-production build — confirmed
- **`-4gu9` is the canonical staff-production admin build** (the active deploy target that carries the
  production frontend flags, including the confirmed-live hotel-apply flag).

### 3. Operations V2 on `-4gu9` — accepted as read-only beta
- **Live for internal staff** as a read-only beta.
- **Classic remains the default operational path.**
- **Ops V2 is not a broad launch.**
- **Ops V2 is role-gated** (admin / operations / super_admin / agent_admin).
- Consumes GET endpoints only — **no mutation and no send path** is opened by this.

## Safety boundaries (still in force)
- Supplier sending remains **disabled**.
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Voucher packet in production remains **OFF**.
- Booking Creation broad production enablement remains **OFF**.
- Passenger / Rooming production edit remains **OFF**.
- Classic remains the default for operations and for all mutations not explicitly enabled.

## What this decision does NOT approve
- **No supplier send** or voucher-send path is enabled by this decision.
- **No Booking Creation broad production enablement** is approved by this decision.
- **No Passenger / Rooming production edit enablement** is approved by this decision.
- **No broad Operations V2 launch** — it remains a read-only, role-gated beta with Classic as default.
- **No flag or environment change** is made by this record.

## Rollback options (each a separate, explicitly-approved task if ever needed)
- **Entrance apply rollback:** set `QUOTE_PRICING_ENTRANCE_APPLY=false` (and redeploy / restart the API)
  as a separate approved task → entrance apply is rejected out-of-scope and nothing is written.
- **Ops V2 beta rollback:** set `NEXT_PUBLIC_OPS_V2_DEFAULT` off for the `-4gu9` build and rebuild
  (NEXT_PUBLIC values are build-time) as a separate approved task → the `/operations/v2` route returns
  notFound and the Beta nav child disappears.

## Confirmation
- **No changes were made by this decision record.** No flag was changed; no production or staging value
  was modified; no code, data, email, or allowlist change. This document records decisions and rollback
  options only.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No secrets, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session tokens,
  cookies, or raw supplier / service / quote IDs are recorded here — only safe flag names, accepted
  states, and rollback options.

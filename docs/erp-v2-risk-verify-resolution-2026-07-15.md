# ERP V2 — RISK-VERIFY Resolution Report

**Date:** 2026-07-15
**Status:** Read-only verification. **No flags or production values were changed.** No code, schema,
environment, staging, or data change accompanies this report.

Resolves the two RISK-VERIFY items raised by the production flag audit.

---

## 1. Scope
Read-only verification only. Nothing was enabled, disabled, or edited. All findings come from source
inspection, PR/commit history, backend flag reads, and a read-only UI spot-check.

## 2. No changes made
No flag was changed; no production or staging value was modified; no code, data, email, or allowlist
change.

---

## Risk item 1 — `QUOTE_PRICING_ENTRANCE_APPLY=true` in prod backend

**Verdict: likely intentional, but undocumented.**

**Evidence**
- Introduced by **PR #561** as "V2 entrance / Jordan Pass preview-apply" with **separate flags,
  default OFF**. Enablement is a runtime environment decision; there is **no enabling commit** and
  **no launch note records the prod enablement**.
- Backend guardrails: an entrance apply requires **global preview + global apply + entrance preview +
  entrance apply** all ON; any one OFF → rejected as out-of-scope and nothing is written.
- Apply requires a **matching stateless preview token** (the applied payload must fully match the
  re-derived dry-run).
- **Role-gated to admin / operations.**
- **Status-gated to editable quotes.**
- Mutation uses the **existing Classic update / recalculate path** (re-persists the freshly-resolved
  entrance / Jordan-Pass price and recalculates quote totals). **No schema or formula change.**
- The paired frontend entrance-pricing flag is present in the staff-prod build — backend apply +
  backend preview + frontend UI as a matched set is the signature of a deliberate rollout (mirrors the
  hotel-apply enablement), not lone-flag drift.

**Risk level: low–medium.** The mechanism is safe (multi-flag + token + role + status gated, Classic
write path, no formula change). The only gap is governance — a live pricing-write path not recorded in
the launch notes.

**Recommendation**
- Accept as an intended staff enablement once confirmed.
- **Document it in the launch notes.**
- Rollback path, only if ever needed (separate task): set `QUOTE_PRICING_ENTRANCE_APPLY=false` and
  redeploy/restart the API.

---

## Risk item 2 — `NEXT_PUBLIC_OPS_V2_DEFAULT` key exists in prod frontend

The flag value is **not readable via CLI** (stored as a Sensitive Vercel variable; env pull returns it
blank). Resolved instead by a read-only UI spot-check of the two production admin-web builds.

**UI spot-check result**
- **MAIN prod admin build:** `/operations/v2` → **notFound / OFF** (the flag-gate 404s the route; no
  Operations V2 content renders).
- **`-4gu9` prod admin build:** `/operations/v2` → **renders the Operations V2 Command Center / ON**
  (heading "Booking Operations"; the route only renders when the flag is `'true'`).

**Supporting facts**
- **Classic remains the default** on both builds — the flag only makes the `/operations/v2` route
  reachable and adds an "Operations V2 (Beta)" nav child; it never replaces Classic as the landing
  surface.
- **Operations V2 exposure is a read-only beta** (Round 1 consumes GET endpoints only; no backend flag,
  no mutation, no send) and is **role-gated** (admin / operations / super_admin / agent_admin).
- **No supplier-send or mutation risk** was found from this flag.
- The Finance V2 tab is a separate read-only surface (role-gated), not gated by this flag.

**Which build is staff-prod?** Evidence points to `-4gu9` (the repo's active deploy target and the
flag-baking prod-promotion build; it also carries the frontend hotel-apply flag, and hotel apply is
confirmed live for staff, whereas the MAIN build lacks that frontend flag). If `-4gu9` is the staff
build, Operations V2 is effectively read-only-live in production — a drift from the "prod OFF" record.

**Risk level: low** (read-only, role-gated, Classic stays default) — a state-vs-record discrepancy, not
a dangerous exposure.

**Recommendation**
- Confirm **`-4gu9` is the canonical staff-prod build**.
- If yes → accept the read-only Operations V2 beta as live on staff-prod and **update the records**.
- If no → separately approve disabling `NEXT_PUBLIC_OPS_V2_DEFAULT` on `-4gu9` and rebuild.
- **Do not change it in this PR.**

---

## Overall conclusion
- **No dangerous production exposure found.**
- **Booking Creation broad prod remains OFF.**
- **Voucher packet prod remains OFF.**
- **Voucher-send prod remains disabled.**
- **Allowlist remains `ziad@axisdmc.com` only.**
- The remaining issue is **documentation / governance alignment**, not an emergency rollback.

### Safety confirmations
- Read-only verification — no flag, environment, production, staging, code, or data change.
- No secrets, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session tokens,
  cookies, or raw supplier / service / quote IDs are recorded here — only safe flag names, their
  true / false / absent states, and observed behavior.

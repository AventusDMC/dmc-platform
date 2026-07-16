# ERP V2 — UAT Phase 1: Read-Surface Checks Report

**Date:** 2026-07-16
**Status:** Read-only UAT execution. **No data changed.** No code, flag, schema, production, or staging
change accompanies this report.

## 1. Read-only execution only
Phase 1 exercised read surfaces only. Every check was a GET / render observation — no create, update,
delete, apply, convert, assign, or send.

## 2. Scope
- **U7 — Finance V2 read-only tab.**
- **U8 — Product Catalog V2 access / gating.**
- Staging **full role matrix** (super_admin, admin, operations, finance, agent_admin, agent, viewer).
- **Production read-only smoke for Catalog V2 only** (canonical staff-production build).

Intended matrix was code-verified; actual results are live per-role probes (minted role sessions,
GET-only).

## 3. U7 — Finance V2 read-only tab results
The Finance V2 tab is inside the Ops V2 booking workspace. Entry gate: admin / operations / super_admin /
agent_admin. Margin/cost + supplier-payments gate: admin / super_admin / finance.

| Role | Result |
|---|---|
| super_admin | **PASS** — tab renders, margin/cost visible |
| admin | **PASS** — tab renders, margin/cost visible |
| operations | **PASS** — tab renders, **margin/cost restricted** (supplier payments withheld) |
| agent_admin | **PASS** — tab renders, **margin/cost restricted** |
| finance | **PASS / BLOCKED as-designed** from the Ops workspace — pending product confirmation |
| agent | **PASS** — blocked |
| viewer | **PASS** — blocked |

- **Classic handoff present** wherever the tab renders (read-only "actions handled in Classic" panel +
  "Open financials in Classic" link).
- **No finance write actions available in V2** — no record / mark-paid / invoice / export controls.
- The `finance` role's read-only finance surface is Classic `/finance`; the Finance V2 tab lives in the
  Ops workspace, which the `finance` role is not part of (see Minor observation 1).

## 4. U8 — Product Catalog V2 results
| Role | Access | Result |
|---|---|---|
| super_admin / admin / operations / finance | Catalog V2 accessible (pricing visible) | **PASS** |
| agent_admin / agent / viewer | Blocked | **PASS** |

- **Warning counts render** for authorized roles.
- **No catalog create / edit / update / delete affordances** (no mutate controls; the only form present
  is the global navigation search shell).
- **Production smoke:** admin **renders read-only**; viewer **blocked** — production Catalog V2 remains
  **read-only and internal-only** (GET-only; no production writes).

## 5. Roll-up
- **U7 — PASS.**
- **U8 — PASS.**
- **Blockers: 0.**
- **Majors: 0.**
- **Minors: 2.**

## 6. Minor observations (no fix required to proceed)
1. **Confirm intended UX** that the `finance` role uses **Classic `/finance`** rather than the Finance V2
   tab inside the Ops workspace (the Ops-workspace entry gate excludes the `finance` role, so only
   admin / super_admin see the Finance V2 tab with margin).
2. **Reconcile** the staging backend **403** for non-internal catalog roles (agent / agent_admin /
   viewer) versus the source/comment expectation around pricing redaction. The **deployed behavior is
   safely stricter** (blocked rather than redacted) — no security risk.

## 7. Confirmations
- No data changed.
- No production mutation.
- No email sent.
- No Quote Builder write / apply.
- No quote conversion.
- No passenger / rooming edit.
- No supplier assignment.
- No voucher generation.
- No Phase 2 started.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 8. Net conclusion
- **Phase 1 PASS.**
- Read-surface **gating, redaction, read-only enforcement, and Classic handoff are working.**
- Safe to proceed next to **Phase 2 planning / execution only after this doc is merged**.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or raw user / supplier / quote / booking IDs are recorded here — only role names,
  observed gating results, and roll-up counts.

# ERP V2 — UAT Phase 0 Setup Inventory

**Date:** 2026-07-15
**Status:** Read-only inventory. **Nothing was created, edited, or changed.** No UAT execution started.

Prepares the UAT Phase 0 setup inventory before execution.

---

## 1. Read-only inventory only
All findings come from read-only reachability checks and read-only staging reads. No user, quote,
booking, voucher, flag, or environment was created or modified.

## 2. No UAT execution started
This is preparation only. No scenario was run.

## 3. Staging environment readiness
| Check | Result |
|---|---|
| Staging admin-web reachable | Up (root redirects to auth — app is serving) |
| Staging API reachable | Authenticated read returned `HTTP 200` |
| API-to-DB round-trip | Confirmed — the API read returned data through the existing app/API path |
| No production writes needed | Confirmed — all write/edit UAT flows target staging; production stays read-only (Catalog V2) |

## 4. Staging flag readiness
_(Production flags were **not** touched.)_
- **Catalog V2 — ON.**
- **Booking Creation V2 — ON.**
- **Voucher Packet V2 — ON.**
- **Voucher-send staging flag — ON but allowlist-restricted to `ziad@axisdmc.com` only** →
  **use send-preview only during UAT.**
- **Quote pricing preview flags — ON.**
- **Entrance apply — ON.**
- **Hotel / transport / external apply — not enabled on staging** unless separately approved.
- **Production flags were not touched.**

## 5. Test role readiness
**Existing staging accounts (reuse):**
- admin
- operations
- agent

**Missing staging UAT accounts (create later, separately approved):**
- super_admin
- finance
- agent_admin
- viewer

## 6. Test data readiness
Existing staging data can be reused for every scenario:
- Existing **DRAFT quotes** can be reused (Quote Builder V2).
- Existing **ACCEPTED quotes** can be reused (Booking Creation V2 convert).
- Existing **bookings with services** can be reused (Operations V2).
- Existing **passenger-bearing bookings** can be reused (Passenger / Rooming).
- Existing **supplier-assignment / confirmation candidates** can be reused (one booking has an
  unassigned service for the assign flow; assigned services exist for the confirm flow).
- Existing **voucher candidate** can be reused (single-service voucher).
- Existing **voucher packet candidate** can be reused.

## 7. Optional later setup (only if separately approved)
- Create a clearly labeled UAT **DRAFT quote**.
- Create a clearly labeled UAT **ACCEPTED quote**.
- Create a clearly labeled UAT **booking**.

These keep UAT edits from disturbing pre-existing staging data; none created here.

## 8. Safety checklist
- No real client bookings.
- No real supplier emails.
- No allowlist widening.
- No production mutations.
- Staging test data must be clearly labeled.
- Future staging data creation requires separate approval.

## 9. Recommended Phase 0 execution plan
- Create the **4 missing UAT role accounts** later (super_admin, finance, agent_admin, viewer).
- Reuse existing staging test records where possible.
- Keep staging flags as-is.
- Separately decide whether any staging **apply** flags (hotel / transport / external) need toggling for
  apply-path UAT (currently not enabled).
- Cleanup UAT-created users / data after testing; leave pre-existing staging data intact.

## 10. Net conclusion
- Staging is reachable.
- Existing test-data coverage is sufficient.
- The main gap is the **4 missing UAT role accounts**.
- The next step after this doc merges is **approval for Phase 0 setup execution**, not full UAT
  execution.

## 11. Confirmations
- No data created / edited / deleted.
- No users created.
- No flags / environment changed.
- No production / staging mutation.
- No email sent.
- Production voucher-send remains disabled.
- Allowlist remains `ziad@axisdmc.com` only.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No secrets, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session tokens,
  cookies, or raw user / supplier / service / quote / booking IDs are recorded here — only reachability
  results, flag states, role names, and counts-driven readiness.

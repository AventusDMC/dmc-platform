# ERP V2 — UAT Phase 2 Plan: Quote → Proposal Write Flows

**Date:** 2026-07-16
**Status:** Planning only. **No execution started.** No code, flag, schema, production, or staging change
accompanies this plan.

Prepares the staging-only UAT Phase 2 execution plan for the Quote Builder V2 → proposal lifecycle.

---

## 1. Planning only
This is a plan. No scenario was executed.

## 2. No execution started
No quote was created or updated, no pricing applied, no status changed.

## 3. Scope
- **U1 — Quote Builder V2 build checks.**
- **U2 — Price preview / apply checks.**
- **U3 — Mark-as-Sent + public proposal link + Accept / Request Changes.**

## 4. Environment
- **Staging only.** No production writes. No production flag changes.
- **Staging flag states must be re-confirmed at execution start** (the values below are from the flag
  audit and can drift).

## 5. Roles
| Role | Use |
|---|---|
| admin | Primary operator (apply endpoints are restricted to admin/operations) |
| operations | Secondary write operator where supported |
| viewer | Negative — must not write/apply |
| agent | Negative — customer-facing role must not reach internal builder writes |
| super_admin / finance / agent_admin | Spot checks where relevant |

## 6. Test-record plan
- **Reuse existing staging quotes** (DRAFT / READY / ACCEPTED) for **preview / read-only** checks that do
  not mutate.
- **Create one clearly labeled `UAT-P2` quote later** for the write-flow execution so existing data is
  not disturbed.
- **Naming convention:** prefix **`UAT-P2`** (client/title) for easy discovery and cleanup.
- **Cleanup expectation:** delete the `UAT-P2` quote (and any proposal link it created) after UAT; leave
  pre-existing staging data intact.
- **Quote creation is a separate approval** — not part of this plan PR.

## 7. Current U1 staging reality
| Check | Current staging expected |
|---|---|
| Open Quote Builder V2 route / shell | **PASS** (testable) |
| Add / edit itinerary day | **BLOCKED** — `QUOTE_ITINERARY_EDIT` OFF/absent |
| Add activity item | **BLOCKED** — `QUOTE_ITEM_CREATE` OFF/absent |
| Add guide item | **BLOCKED** — `QUOTE_ITEM_CREATE` OFF/absent |
| Hotel preview | **PASS** — preview ON |
| Hotel apply | **BLOCKED** — hotel apply OFF/absent on staging |
| Totals behavior | Totals must update **only on intended writes**, never on preview/open |

## 8. Current U2 staging reality
| Path | Staging state | Expected |
|---|---|---|
| Hotel / transport / external / entrance **preview** | ON | **PASS** (no write) |
| **Entrance apply** | **ON** | **PASS / executable** — changes only the intended item + totals |
| Hotel apply | OFF/absent | **BLOCKED** |
| Transport apply | OFF/absent | **BLOCKED** |
| External-package apply | OFF/absent | **BLOCKED** |

- Preview must **not** write.
- Entrance apply must change **only the intended item and totals**.
- **No unintended currency / margin drift.**

## 9. U3 proposal lifecycle plan
- **Mark-as-Sent** on the **`UAT-P2` staging quote only** (status → SENT; status-only, no email/PDF/link
  auto-sent).
- **Public proposal link opened by the tester only** (never emailed to a real client).
- **Accept / Request Changes** on the **`UAT-P2` staging quote only** (allowed only when status is SENT;
  backend guards otherwise).
- Confirm **status / audit behavior**.
- **No real client communication. No email.**

## 10. Negative / role-gate checks
- **viewer** cannot write / apply.
- **agent** cannot access internal builder writes.
- **Disabled apply actions remain blocked for all roles** (out-of-scope reject).
- **Apply endpoints restricted to admin / operations.**

## 11. Safety rules
- Staging only.
- UAT-labeled data only.
- No real clients.
- No email.
- No supplier send.
- No allowlist widening.
- No production mutation.
- **Stop immediately on any unexpected production path or email path** and report before proceeding.

## 12. Report template (one row per run)
| Field |
|---|
| Scenario · Role · Environment · Test-record label (`UAT-P2…`) · Expected result · Actual result · **Pass / Fail / Blocked** · Severity · Owner · Next action |

Roll-up per scenario + any Blocker / Major open.

## 13. Go / No-Go criteria
- **GO** for the currently-enabled subset **after** staging flags are re-confirmed **and** one `UAT-P2`
  quote is created separately.
- **Executable subset:** build shell, previews, entrance apply, proposal lifecycle, negatives.
- **Blocked subset requires separate staging flag approval** (§14).
- **STOP** on any real-client communication, email send, production write, or unexpected mutation.

## 14. Blocked subset — requires separate approval
To execute the blocked scenarios, staging would need these flags enabled (each an explicit, separately
approved change):
- `QUOTE_ITINERARY_EDIT` (U1 add/edit day)
- `QUOTE_ITEM_CREATE` (U1 add activity / guide)
- `QUOTE_PRICING_HOTEL_APPLY` (U2 hotel apply)
- `QUOTE_PRICING_TRANSPORT_APPLY` (U2 transport apply)
- `QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY` (U2 external apply)

## 15. Confirmations
- No data edited.
- No quote created / updated.
- No pricing applied.
- No conversion.
- No flag / environment change.
- No email sent.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.
- Phase 2 execution not started.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or raw user / supplier / quote / booking IDs are recorded here — only flag names,
  role names, and the plan.

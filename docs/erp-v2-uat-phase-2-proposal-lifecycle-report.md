# ERP V2 — UAT Phase 2 Execution: Proposal Lifecycle

**Date:** 2026-07-16
**Status:** Staging execution. No code, schema, flag, or production change accompanies this report.

Executes the proposal lifecycle on `Q-2026-0003` — Mark-as-Sent → public link → Accept.

## 1. Environment
- **Staging only.**
- **`Q-2026-0003`** ("UAT-P2 Quote - Phase 2 Test") only.

## 2. Preflight
- Quote was **DRAFT**.
- Synthetic, staging-only.
- 1 day.
- 1 priced item.
- Totals **100 sell / 80 cost USD**.
- 0 bookings.
- No public link before execution.
- No email path used.
- Production flags unchanged.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.

## 3. Results
| Step | Result |
|---|---|
| Mark-as-Sent | **PASS** — status became **SENT**, `sentAt` set, **no email sent** |
| Public proposal link creation | **PASS** — public link enabled |
| Proposal rendered read-only | **PASS** — renders read-only, status shown SENT |
| **Accept** | **BLOCKED (Minor)** — "Accepted quotes require at least one saved quote version" |
| Request Changes | Not run (Accept preferred) |
| Negative — agent write/apply | **PASS** — blocked (403) |
| Negative — viewer write/apply | **PASS** — blocked (403) |

## 4. Final state
- `Q-2026-0003` status **SENT**
- `acceptedAt = null`
- Public proposal **enabled**
- Quote **versions = 0**
- `bookings = 0`
- Totals remain **100 / 80 USD**
- No currency drift

## 5. Roll-up
- **Blockers: 0.**
- **Majors: 0.**
- **Minors: 1** — Accept requires a saved quote version before acceptance.

## 6. Recommended next separate step (do NOT perform in this doc PR)
- Save one quote version / snapshot for `Q-2026-0003` through the normal version path.
- Then re-run Accept.

## 7. Confirmations
- No production mutation.
- No email sent.
- No flags changed.
- No booking created.
- No voucher / packet created.
- No supplier assignment.
- No passenger / rooming edit.
- No Phase 3 started.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, public token values, or internal UUIDs / raw user / supplier / booking IDs are
  recorded here — only the human-readable quote reference, step results, and counts.

# ERP V2 — UAT Phase 2 Execution: Save Quote Version + Accept Proposal

**Date:** 2026-07-16
**Status:** Staging execution via the normal app/API version path. No code, schema, flag, or production
change accompanies this report.

Completes the proposal lifecycle on `Q-2026-0003` — save a quote version, then Accept.

## 1. Environment
- **Staging only.**
- **`Q-2026-0003`** ("UAT-P2 Quote - Phase 2 Test") only.

## 2. Preflight
- Quote was **SENT**.
- Synthetic, staging-only.
- 1 day.
- 1 priced item.
- Totals **100 sell / 80 cost USD**.
- Quote versions = 0 before step.
- Bookings = 0 before step.
- Public proposal already enabled.
- No email path used.
- Production flags unchanged.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.

## 3. Results
- Saved **exactly one quote version**.
- versionNumber **1**.
- Label / name **"UAT-P2 v1"**.
- Snapshot totals **100 / 80 USD**.
- Public proposal link **reused** (existing link; token value not exposed).
- **Accept succeeded.**
- Quote status became **ACCEPTED**.
- `acceptedAt` **set**.
- Accepted version **set**.
- **No booking created.**
- Totals stable.
- No currency drift.

## 4. Final state
- `Q-2026-0003` status **ACCEPTED**
- Quote version count = **1**
- Booking count = **0**
- Totals remain **100 / 80 USD**
- Public proposal remains **enabled**

## 5. Minor observation
- Accept generated **one client invoice** for the synthetic staging quote.
- This appears to be **expected app behavior** (accepting a quote creates a client invoice).
- It is a **finance record, not a booking / voucher / packet**.
- It should be **tracked for UAT cleanup later**.
- **Not** cleaned up in this doc PR.

## 6. Roll-up
- **Blockers: 0.**
- **Majors: 0.**
- **Minors: 1.**
- **Phase 2 proposal lifecycle is complete.**

## 7. Confirmations
- No production mutation.
- No email sent.
- No flags changed.
- No Request Changes run.
- No booking conversion.
- No voucher / packet created.
- No supplier assignment.
- No passenger / rooming edit.
- No new quote / contact / day / item.
- No pricing apply.
- No Phase 3 started.
- No public token value exposed.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 8. Net conclusion
- `Q-2026-0003` is now a **valid accepted staging quote**.
- It is **ready for the Booking Creation V2 controlled staging test** after this doc is merged.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, public token values, or internal UUIDs / raw user / supplier / booking / invoice IDs
  are recorded here — only the human-readable quote reference, version label, results, and counts.

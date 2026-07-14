# Supplier Data Cleanup — Desert Compass Experiences Currency Preflight

**Date:** 2026-07-14
**Status:** Read-only preflight. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited.**

Investigates the Desert Compass Experiences EUR seed-style row that drives the supplier's
`CURRENCY_MISMATCH`, and determines the safe correction options before any edit.

---

## 1. Scope
Read-only preflight only. Values were read via read-only queries. No service / rate / currency /
supplier row was created, updated, deleted, or deactivated.

## 2. Warning
Desert Compass Experiences carries `CURRENCY_MISMATCH` because its services mix **EUR + USD**.

## 3. Services
The supplier has **3 active Sightseeing services**.

## 4. The EUR row
- Name: **Petra Full-Day Guided Experience**
- baseCost: **92**
- currency: **EUR**
- Identifier: **seed-style** (a repeated-digit UUID, unlike the normal random identifiers on the
  other two services).
- **1 linked serviceRate** (its own EUR rate — this is why the supplier's rate amounts also show EUR).
- **0 quote items / 0 booking usage** (0 excursion/package components, 0 quote blocks, 0 ticket-rate
  variants) — never used in a live quote or booking.

## 5. The other two services are USD
- "Petra Entrance And Guided Visit" — 65 USD.
- "Jerash And Amman Touring" — 38 USD.

## 6. Not a byte-identical duplicate
The EUR row is **not** a byte-identical duplicate of the USD Petra service — it has a distinct name
("Full-Day Guided Experience" vs "Entrance And Guided Visit") and a distinct amount. It is either a
real distinct product mispriced in EUR, or a seed variant; the seed-style identifier and zero usage
lean toward seed, but this cannot be assumed.

## 7. Classification
- **DUPLICATE_SEED_ROW (leaning)** — seed-style identifier + zero quote usage.
- **NEEDS_CURRENCY_VALUE_CORRECTION (if real)** — if it is a genuine product mispriced in EUR.
- **HOLD pending pricing-owner confirmation** — because it has a distinct product name and amount, do
  not assume seed; a human must confirm real-vs-seed.

## 8. Correcting the service alone is not enough
The EUR appears on **both** the service `baseCost` **and** its 1 linked `serviceRate`. If the row is
kept and currency-corrected, **both** the service and its serviceRate must be updated to USD — fixing
only the service would leave EUR on the rate and the mismatch would persist.

## 9. Options
- **If real product:** set the **service** and its **serviceRate** to USD with a **confirmed USD
  value** (reversible field edits; deletes nothing).
- **If seed/test:** a later, authorized retire / deactivate of the EUR row (cascades its single rate).
- **If genuinely EUR:** accept the mismatch.

## 10. Expected warning impact (if corrected or retired)
- `CURRENCY_MISMATCH` **4 → 3**.
- Total warnings **27 → 26**.
- Only Desert Compass Experiences clears; the other three currency mismatches (Alpha accepted
  dual-currency, Desert Compass Transport, Amman West Hotel) are unchanged.

## 11. Risks
- **Partial fix leaves EUR** — correcting the service but not the linked serviceRate keeps the
  mismatch.
- **Symbol-flip mispricing** — the amount is ~92 EUR (roughly ~100 USD); a correction requires the
  pricing owner's actual USD value, not a bare currency swap.
- **Retiring a real product** — if it is a genuine product, retiring would lose it; hence the HOLD.
- **Touching the clean USD services accidentally** — the two USD services are clean and must not be
  changed.

## 12–15. Confirmations
- **No data was edited.**
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / service / rate IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only service names, amounts, currencies,
  reference counts, and the recommendation.

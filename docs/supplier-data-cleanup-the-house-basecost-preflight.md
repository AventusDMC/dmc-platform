# Supplier Data Cleanup — The House Boutique Suites baseCost 0 Preflight

**Date:** 2026-07-14
**Status:** Read-only preflight. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited.**

Investigates The House Boutique Suites Amman accommodation service with `baseCost 0` and determines the
safe correction options before any edit. **Conclusion: HOLD — this is not a simple service-baseCost
fix.**

---

## 1. Scope
Read-only preflight only. Values were read via read-only queries. No service / rate / currency /
supplier / hotel row was created, updated, deleted, or deactivated.

## 2. The linked service
The House Boutique Suites has **one linked service**:
- Name: **Jordan Contracted Hotel Night**
- Category: **Accommodation**
- baseCost: **0**
- currency: **JOD**
- Status: **active**
- **187 quote-item references**
- **0 serviceRates**

## 3. Generic + heavily referenced → a flat baseCost is not safe
The service has a **generic name** and is **referenced by 187 quote items**, so it behaves like a
shared/generic "contracted hotel night" line rather than a per-hotel priced service. Setting a flat
`baseCost` on it would apply that cost to everything using the line and would **mis-price** future
quotes.

## 4. The likely issue is missing hotel contract/rate data, not the service baseCost
The generic accommodation line is expected to be priced via the selected hotel's contract/rate at
quote time — not via the service `baseCost`. So the real gap is **missing hotel contract/rate data for
The House**, not the service's `baseCost 0`.

## 5. The House hotel record
There is a Hotel record for The House Boutique Suites linked to this supplier with **room categories**
but **0 hotel contracts and 0 hotel rates** — i.e. no hotel-rate source to price accommodation from.

## 6. Classification
- **ON_REQUEST_PLACEHOLDER (leaning)** — the generic baseCost-0 accommodation line is very likely an
  intentional placeholder priced via hotel selection.
- **REAL_PRICING_GAP at the hotel-contract level** — The House's hotel has no contract/rate loaded.
- **HOLD overall** — a pricing-owner / hotel-contract question, not a service-baseCost edit.

## 7. Do not set the service baseCost without pricing-owner approval
Setting a flat baseCost on this shared, heavily-referenced line is not recommended and should not be
done without pricing-owner approval.

## 8. Do not retire/deactivate the service
The service has **187 quote-item references**; retiring or deactivating it would break those
references and is not safe.

## 9. Likely correct path
If The House should be offered, the likely correct path is a **pricing-owner review and loading a
proper hotel contract/rate for The House** (like the verified hotels), so accommodation prices through
the hotel-rate layer.

## 10. Expected warning impact
- **Setting the service baseCost would not clear MISSING_RATES** (the warning counts service-rate /
  vehicle-rate rows, of which there are 0).
- **Loading a hotel contract also likely does not clear that service-rate warning** (a hotel contract
  adds hotel rates, not the service-rate / vehicle-rate rows the warning counts).
- This is a **pricing-correctness** issue, not a warning-clearing issue.

## 11. Risks
- **Mispricing future quotes** — a flat baseCost on a shared/generic line would apply broadly.
- **Breaking referenced quote items** — retiring/deactivating a service with 187 references.
- **Fixing the wrong layer** — editing the service leaves the underlying missing hotel contract/rate
  gap unresolved.

## 12–15. Confirmations
- **No data was edited.**
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / service / hotel / quote IDs), secrets, hosts, URLs, project
  identifiers, session tokens, or connection details are recorded here — only names, the category,
  amounts, currencies, reference counts, and the recommendation.

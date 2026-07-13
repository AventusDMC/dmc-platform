# Supplier Data Cleanup — General Transport Reference / Deactivation Preflight

**Date:** 2026-07-13
**Status:** Read-only preflight. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited.**

Investigates whether the "General Transport" supplier is a true stub/inactive row and whether it can
be safely retired later.

---

## 1. Summary
General Transport is a **zero-reference orphan / stub** supplier — an imported placeholder with no
contact details, no operational data, and no references anywhere.

## 2. Current state
| Field | Value |
|---|---|
| type | transport |
| email | null |
| phone | null |
| baseCity | null |
| operationallyActive | false |
| warnings | MISSING_EMAIL, NO_ACTIVE_SERVICES, MISSING_BASE_CITY |

(Notes indicate it was imported from a transport contract template spreadsheet.)

## 3. Reference checks — all zero
A read-only cross-table count against the supplier found **zero references** in every location:
- booking services
- assigned-supplier references
- transport contracts
- vehicle rates
- vouchers
- voucher packets
- pricing rules (transport pricing rules + touring-route pricings)
- supplier services (both `supplierId` and `resolvedSupplierId`)
- service rates (both `supplierId` and `resolvedSupplierId`)

Confirmed: zero services, zero contracts, zero rates, and zero booking / quote / voucher / packet
references. (Regular quote items have no direct supplier link; the supplier owns none.)

## 4. No soft-deactivation mechanism
The Supplier model has **no `active` / `isActive` / `status` / `deactivatedAt` field** — there is no
soft-deactivation mechanism.

## 5. Only realistic removal path is hard delete
Because there is no soft-deactivate, the only way to retire the row is a **hard delete**.

## 6. Hard delete appears safe (but irreversible)
From a reference / cascade perspective, a hard delete **appears safe** because references are zero
(nothing would be nulled, cascade-deleted, or orphaned — including the cascade-linked voucher
relation, which has zero rows). However, a hard delete is **irreversible**.

## 7. Recommendation — NEEDS_MANUAL_REVIEW
The data supports safe retirement (a zero-reference orphan), but since no soft-deactivation exists and
hard delete is irreversible, the decision is a manual one:
- **Hard-delete later** (safe given zero references), **or**
- **Keep as placeholder** (harmless — only 3 cosmetic warnings remain).

`DEACTIVATE_LATER` is not offered because no deactivation field/mechanism exists to enable it;
`DO_NOT_TOUCH` is not warranted because it is a genuine orphan.

## 8. Expected warning impact if later retired
| Code | Now | After retire |
|---|---|---|
| MISSING_EMAIL | 6 | 5 |
| NO_ACTIVE_SERVICES | 5 | 4 |
| MISSING_BASE_CITY | 1 | 0 |
| Total | 30 | 27 |

(Keeping it as a placeholder leaves all counts unchanged.)

## 9. No data was edited
All queries were read-only counts. No supplier / service / rate / contract / voucher row was created,
updated, or deleted; nothing was deactivated or verified.

## 10. No email was sent
This preflight performed read-only queries only; no mail path was exercised.

## 11. Voucher-send allowlist
Remains `ziad@axisdmc.com` only.

## 12. Supplier sending
Remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier IDs), secrets, hosts, URLs, project identifiers, session tokens, or
  connection details are recorded here — only field values, reference locations, and warning counts.

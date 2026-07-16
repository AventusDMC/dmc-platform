# ERP V2 — UAT Phase 2 Staging Flag Enablement: Day + Item Create

**Date:** 2026-07-16
**Status:** Staging flag/env enablement only. **No production change.** No code, schema, or data change
accompanies this report.

## 1. Environment
**Staging only.**

## 2. Purpose
Enable the minimum staging gates needed to add a day and one test item through the real V2 Quote Builder
workflow.

## 3. Staging flags enabled
- **`QUOTE_ITINERARY_EDIT=true`** (backend) — effective.
- **`QUOTE_ITEM_CREATE=true`** (backend) — effective.
- **`NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE=true`** (frontend, staging) — set, **rebuild pending**
  (`NEXT_PUBLIC` is build-time; surfaces in the UI only after a staging admin-web rebuild).

## 4. Production flags unchanged
- `QUOTE_ITINERARY_EDIT` remains **absent/OFF** in prod.
- `QUOTE_ITEM_CREATE` remains **absent/OFF** in prod.
- Voucher-send remains **disabled** in prod.
- Allowlist remains **`ziad@axisdmc.com` only**.

## 5. Explicitly NOT enabled
- `QUOTE_PRICING_HOTEL_APPLY`
- `QUOTE_PRICING_TRANSPORT_APPLY`
- `QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY`
- any voucher-send flag
- any production flag

(All three apply flags verified still absent/OFF on staging after the change.)

## 6. Q-2026-0003 state after flag enablement
- Still **DRAFT**
- 0 items
- 0 days
- 0 bookings
- Totals unchanged

## 7. Notes
- **Backend add-day / add-item is now unblocked for API-driven UAT execution** (the backend flags are
  the real endpoint gates).
- The **frontend item-create flag requires a staging admin-web rebuild** before UI-driven item creation
  will surface.
- A **UI-driven add-day may require a separate frontend itinerary-edit flag**
  (`NEXT_PUBLIC_QUOTE_BUILDER_V2_ITINERARY_EDIT`), which was **not** enabled here.
- **No rebuild and no extra frontend flag** was done in this task.

## 8. Confirmations
- No quote / item / day created.
- No pricing / proposal / booking action.
- No data edit except the approved staging flag / env changes already reported.
- No production change.
- No email sent.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, additional flag/env, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / booking IDs are recorded here — only flag
  names, states, the human-readable quote reference, and counts.

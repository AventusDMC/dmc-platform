# ERP V2 — UAT Phase 2 Setup: Add One Day + One UAT Item via V2 API

**Date:** 2026-07-16
**Status:** Staging setup via the real V2 API. **No production change.** No code, schema, flag, or DB-seed
change accompanies this report.

Prepares `Q-2026-0003` so the Phase 2 proposal lifecycle can be executed.

## 1. Environment
- **Staging only.**
- **`Q-2026-0003`** ("UAT-P2 Quote - Phase 2 Test") only.
- **Real V2 / API endpoints used** (`/quotes/:id/v2/itinerary/day`, `/quotes/:id/v2/experiences/item`).
- **No DB seeding.**

## 2. Preflight
- `Q-2026-0003` was **DRAFT**, synthetic, staging-only.
- 0 items, 0 days, 0 bookings.
- `QUOTE_ITINERARY_EDIT=true` on staging.
- `QUOTE_ITEM_CREATE=true` on staging.
- Production flags unchanged.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.

## 3. Mutations performed
- Added **exactly one itinerary day** through the V2 API.
- Added **exactly one priced activity item** through the V2 API item-create path.
- **No supplier / service / catalog / rate record was created or edited** — an existing safe staging
  activity was referenced.

## 4. Created day
- Day 1
- Label: **UAT-P2 Day 1**

## 5. Created item
- Type: **activity**
- Label: **QA City Tour**
- Variant: **Standard**
- Sell: **100.00 USD**
- Cost: **80.00 USD**
- Service date: **2026-08-01**
- The priced item is now available for **Mark-as-Sent readiness** (the "at least one priced quote item"
  requirement).

## 6. Quote state after setup
- Quote remains **DRAFT**
- `totalPrice = 100` USD
- `totalCost = 80` USD
- `quoteItems = 1`
- `itineraryDays = 1`
- `bookings = 0`
- `publicToken = null`
- `publicEnabled = false`

## 7. Confirmations
- No booking created.
- No public proposal link created.
- No email sent.
- No flags changed.
- No production change.
- No pricing applied separately.
- No proposal status change.
- No accept / request-change execution.
- No voucher / packet created.
- No supplier assignment.
- No passenger / rooming edit.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 8. Net conclusion
- `Q-2026-0003` is now ready for the Phase 2 proposal lifecycle:
  **Mark-as-Sent → public link → Accept.**
- The proposal lifecycle has **not** started yet.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or additional data change accompanies this
  report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / booking IDs are recorded here — only the
  human-readable quote reference, day/item labels, prices, and counts.

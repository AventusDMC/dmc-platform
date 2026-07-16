# ERP V2 — UAT Phase 2 Execution: Currently-Enabled Quote → Proposal Subset

**Date:** 2026-07-16
**Status:** Read-mostly staging execution — every mutation attempt was rejected, so no state changed. No
code, flag, schema, or production change accompanies this report.

## 1. Execution scope
- **Staging only.**
- **`Q-2026-0003`** ("UAT-P2 Quote - Phase 2 Test") only.
- **Currently-enabled subset only.**
- **No Phase 3 started.**

## 2. Preflight
- `QUOTE_ITINERARY_EDIT` **OFF**
- `QUOTE_ITEM_CREATE` **OFF**
- Pricing **previews ON** (hotel / transport / external / entrance)
- `QUOTE_PRICING_ENTRANCE_APPLY` **ON**
- `QUOTE_PRICING_HOTEL_APPLY` / `TRANSPORT_APPLY` / `EXTERNAL_PACKAGE_APPLY` **OFF**
- **`Q-2026-0003` still DRAFT**, synthetic, staging-only, totals 0, **no items, no days, no bookings, no
  public link**.

## 3. U1 — Quote Builder V2 shell / blocked writes
- **Builder V2 shell renders — PASS.**
- **Itinerary edit — BLOCKED as designed** (`QUOTE_ITINERARY_EDIT` OFF).
- **Activity / guide item create — BLOCKED as designed** (`QUOTE_ITEM_CREATE` OFF; endpoint returned
  `feature_disabled`).
- **No unintended writes** — item/day counts stayed 0.

## 4. U2 — Pricing preview / apply
- **Previews — NOT APPLICABLE** because the quote has 0 items.
- **Entrance apply — NOT APPLICABLE** because no eligible entrance / Jordan-Pass item exists (and items
  were not created).
- **Hotel / transport / external apply — BLOCKED as designed** (apply flags OFF).
- **No currency / total / margin drift.**

## 5. U3 — Proposal lifecycle
- **Mark-as-Sent — BLOCKED** because the quote workflow requires **at least one priced quote item**.
- **Public proposal link — NOT created / NOT opened.**
- **Accept / Request Changes — NOT RUN** (cannot reach SENT).

## 6. Negative checks
- **viewer** write / apply — **blocked** (403).
- **agent** write / apply — **blocked** (403).
- **Apply endpoints limited to admin / operations** — confirmed.
- **Disabled actions blocked for all roles.**

## 7. Final state of Q-2026-0003
- Status remains **DRAFT**
- `totalPrice = 0`
- `totalCost = 0`
- `quoteItems = 0`
- `itineraryDays = 0`
- `bookings = 0`
- `publicToken = null`
- `publicEnabled = false`

## 8. Roll-up
- **Executable-now checks PASS** (builder shell + all role negatives + correct write-blocking).
- **Blockers: 0.**
- **Majors: 0.**
- **Minors: 1** — the bare `UAT-P2` shell cannot exercise pricing apply or the proposal lifecycle
  without at least one priced item.

## 9. Recommended next separate decision (do NOT change in this doc PR)
- **Either** enable `QUOTE_ITEM_CREATE` on staging to add an item through V2,
- **or** seed one priced / eligible item into `Q-2026-0003` through a separately approved setup step.
- Then U2 entrance apply + the full U3 lifecycle (Mark-as-Sent → public link → Accept) become executable.

## 10. Confirmations
- No production mutation.
- No email sent.
- No booking created.
- No flags changed.
- No new quote / contact created.
- No voucher / packet created.
- No supplier assignment.
- No passenger / rooming edit.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / booking IDs are recorded here — only the
  human-readable quote reference, flag names, observed results, and counts.

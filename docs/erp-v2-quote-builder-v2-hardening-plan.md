# ERP V2 — Quote Builder V2 Hardening Plan

**Date:** 2026-07-18
**Status:** Planning only. **ERP V2 is in build-mode — Classic remains the system of record.** No flags
changed, no production/staging touched, no cleanup, no staff rollout, no live-booking usage, no email. No
code, schema, environment, or data change accompanies this plan.

## 1. Current Quote Builder V2 state
- **Builder scaffold and route** (`/quotes/[id]/builder-v2`; Classic at `/quotes/[id]/classic`).
- **Day itinerary render.**
- **Item display / reorder / set-primary.**
- **Passenger / rooming edit** (pricing-inert).
- **Itinerary text tools.**
- **Readiness / audit panels.**
- **Diagnostics / contract status.**
- **Pricing preview / token architecture** (pure compute preview + token, then recalc on apply).
- **Proposal lifecycle** (Mark-as-Sent, share / public link, Accept / Request-Changes gating).
- **Booking Creation V2 production-smoke linkage** (accepted quote → booking; duplicate guard; totals
  preserved).

## 2. What remains Classic-dependent
- **Pax counts / pricing-impacting passenger changes.**
- **Finance / invoice / payment work.**
- **Catalog / supplier / rate edits.**
- **Full multi-country grouping.**
- **Flows V2 does not expose.**

## 3. Real quote workflow requirements
- **Multi-day itinerary.**
- **Multi-item quote.**
- **Hotel / activity / guide / transport / entrance / external items.**
- **Notes / inclusions / exclusions.**
- **Proposal versioning.**
- **Public proposal link.**
- **Accept / Request Changes.**

## 4. Pricing hardening
- **Preview paths** — confirm every item type has a pure preview.
- **Apply paths** — hotel + entrance apply live; transport + external apply built but OFF; harden before
  any enable.
- **Currency handling** — multi-currency totals consistent across preview → apply.
- **Totals / cost / margin preservation** — apply must not drift; the dry-run token guarantees
  preview == apply.
- **No pricing drift** — item CRUD re-prices via recalc (historically non-deterministic) — top hardening
  risk.
- **Role visibility for cost / margin** — never surfaced to non-privileged roles or into client-facing
  proposal / PDF.

## 5. Current flags (read-only audit — prod API)
- **Quote Builder V2 default: OFF in prod** (`NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT`).
- **Preview / apply:** `QUOTE_PRICING_PREVIEW` = true, `QUOTE_PRICING_APPLY` = true.
- **Hotel / entrance apply live:** `QUOTE_PRICING_HOTEL_PREVIEW` / `_HOTEL_APPLY` = true;
  `QUOTE_PRICING_ENTRANCE_PREVIEW` / `_APPLY` = true.
- **Transport / external apply OFF:** `QUOTE_PRICING_TRANSPORT_PREVIEW` = true but
  `_TRANSPORT_APPLY` = false; `QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW` = true but `_APPLY` = false.
- **Item-create and itinerary-edit OFF in prod:** `QUOTE_ITEM_CREATE` and `QUOTE_ITINERARY_EDIT`
  absent / OFF (staging-validated).
- **Booking-create live:** `QUOTE_BOOKING_CREATE` = true.
- **Flags that must stay OFF in prod during build-mode:** `QUOTE_ITEM_CREATE`, `QUOTE_ITINERARY_EDIT`,
  `QUOTE_PRICING_TRANSPORT_APPLY`, `QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY`,
  `NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT`, and proposal-email send flags — until hardened + separately
  approved. *(Exact `NEXT_PUBLIC_*` per-flag prod values to be confirmed in Slice 1.)*

## 6. Known gaps / risks
- **Add-day / add-item coverage** — built (Phase B) but flags OFF in prod.
- **Add-guide not fully merged.**
- **Hotel / rooming depth** — apply live but room-category / occupancy coverage thin.
- **Transport / external apply** — OFF; need staging hardening before enable.
- **`serviceType` vs `operationType` mapping** — divergence (TICKET vs Activity) surfaced during packet
  work; may affect classification / pricing display.
- **Accepted-version requirement** — Accept needs a saved version + SENT; conversion needs an accepted
  version.
- **Invoice side effects after Accept** — Accept auto-generates a client invoice (finance artifact).
- **Non-deterministic recalc risk** on item CRUD — the central correctness risk.
- **Classic-only paths** — pax counts, multi-country grouping, finance, catalog / rate.

## 7. Test strategy
- **Staging first.**
- **Synthetic quotes only.**
- **No staff / live usage.**
- **No real client quote.**
- Cover **simple quote**, **complex multi-day quote**, **multi-service quote**, **proposal lifecycle**,
  **conversion readiness**.
- **Role / cost / margin / audit checks.**
- **No send.**

## 8. Acceptance criteria
- **Real quote workflow works end-to-end on staging.**
- **No blockers / majors.**
- **Totals / currency stable.**
- **Proposal versioning stable.**
- **Classic fallback clear.**
- **No send paths.**

## 9. Recommended slices
- **Slice 1 — Capability Inventory** (read-only item-type × capability × flag-state matrix + Classic-only
  gaps).
- **Slice 2 — Add-day / add-item hardening.**
- **Slice 3 — Hotel + rooming-related quote coverage.**
- **Slice 4 — Pricing preview / apply hardening.**
- **Slice 5 — Proposal lifecycle hardening.**
- **Slice 6 — Staging complex-quote UAT.**
- **Slice 7 — Documentation / readiness report.**

## 10. GO / NO-GO
- ✅ **GO** for continued build + staging validation.
- ⛔ **NO-GO** for staff rollout.
- ⛔ **NO-GO** for live bookings.
- ⛔ **NO-GO** for supplier send.
- ⛔ **NO-GO** for full no-Classic launch.

## 11. Net conclusion
- **Quote Builder V2 is capable but flag-fragmented.**
- **Classic remains the system of record.**
- **The next immediate task is Slice 1 — Capability Inventory.**
- **No staff / live usage until later owner approval.**

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No staff rollout.
- No live bookings.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only surface names, flag names, item-type names, and the plan.

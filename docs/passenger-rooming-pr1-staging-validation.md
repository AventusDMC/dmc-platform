# Passenger / Rooming MVP — PR-1 Staging Validation Report

**Date:** 2026-07-04
**Environment:** Staging only (`dmc-platform-admin-web-staging.vercel.app`)
**Verdict:** ✅ PR-1 (advisory Passenger/Rooming readiness) validated on staging. Production unchanged.
**Scope of change:** Documentation only. No code, schema, flag, or environment change accompanies this report.

Feature: a flag-gated, advisory-only readiness strip on the Operations V2 Passengers & Rooming tab,
behind `NEXT_PUBLIC_OPS_V2_PAX_READINESS` (default OFF). Shipped in PR #619 (merge commit `07e39572`).
References: `docs/passenger-rooming-mvp-plan.md`, `docs/booking-creation-v2-production-acceptance.md`.

---

## 1. What was validated
Target booking: **BK-2026-0002** on staging (converted earlier from the staging pilot quote —
2 adults / 1 room, with a single seeded lead passenger and one rooming entry).

The staging admin-web was rebuilt with `NEXT_PUBLIC_OPS_V2_PAX_READINESS=true` (staging Production env
only), and the Operations V2 Passengers & Rooming tab was opened for BK-2026-0002.

## 2. Results

| Check | Result |
| ----- | ------ |
| Flag enabled on staging admin-web only | ✅ (the strip renders, confirming the flag is baked in) |
| Staging admin-web rebuilt/redeployed | ✅ |
| BK-2026-0002 opened in Operations V2 | ✅ Passengers & Rooming tab |
| Readiness strip appears | ✅ |
| Expected advisory warnings appear | ✅ "Room capacity (1) doesn't match 2 passengers." + "1 passenger missing a passport." |
| Per-passenger chip appears | ✅ "No passport" chip on the lead passenger |
| No finance data in the passenger/rooming UI | ✅ only identity + rooming columns; no cost/sell/margin/payable/invoice anywhere |
| Passenger/rooming CRUD behavior unchanged | ✅ tab remains read-only ("Changes are made in Classic"); no edit controls; the strip is pure display |
| Production remains OFF/unchanged | ✅ production admin-web (4gu9) has `NEXT_PUBLIC_OPS_V2_PAX_READINESS` absent |

## 3. Warning correctness against live data
For BK-2026-0002 (2 passengers expected, 1 seeded lead with no passport, 1 room with the lead
assigned), exactly the right advisory warnings fired, and the rest correctly stayed silent:

- **Fired:** room-capacity-vs-pax (capacity 1 vs 2 passengers); missing-passport (1).
- **Correctly silent:** rooms-vs-roomCount (1 room vs roomCount 1 — equal); unassigned-passengers
  (the lead is assigned to the room); empty-rooms (the room has an occupant); passport-expiry (no
  passport and no travel-end reference → skipped, no false positive).

All warnings are advisory only — nothing was blocked, and no passenger/rooming data was mutated.

## 4. Privacy / safety
- **No new PII surfaced** — the strip and chips use only the already-masked passport data and the
  identity fields already displayed in the tab.
- **No finance/pricing** appears in or is computed by the passenger/rooming view.
- **Read-only** tab behavior preserved; passenger/rooming CRUD (in Classic) is unchanged.

## 5. Post-validation state
- Staging admin-web serves the PR-1 build with the readiness flag **ON** (intended staging-QA state).
- **Production untouched:** `NEXT_PUBLIC_OPS_V2_PAX_READINESS` absent on production admin-web (4gu9);
  Booking Creation V2 production flags remain OFF; supplier email / voucher-send / allowlist unchanged
  (`ziad@axisdmc.com` only).
- BK-2026-0002 retained; no CRUD changes; no Classic changes.

---

## Safety confirmation
- **Production not enabled**; no production flag changes.
- **Supplier email / voucher-send / allowlist untouched** — allowlist remains `ziad@axisdmc.com` only.
- **Booking Creation V2 flags untouched** (production OFF).
- Documentation only — no code, schema, flag, or environment change in this report.

# ERP V2 Launch Readiness Refresh — After Product Catalog / Supplier Cleanup

**Date:** 2026-07-15
**Status:** Read-only readiness refresh. No code, schema, flag, environment, or **data** change
accompanies this report.

Refreshes the V2 launch readiness checklist after the Product Catalog V2 production rollout and the
supplier data-cleanup progress.

---

## 1. Product Catalog V2 — production status
- **Live** in production.
- **Internal-only** — role-gated to staff, not customer-facing.
- **Read-only** — a data-quality / warning surface; it does not write catalog data.
- **Polished UI** — summary API, view, role gate, warning model, and active-hotel-contract modeling
  shipped.
- **Warnings reduced 46 → 27** over the cleanup campaign. Current breakdown: MISSING_EMAIL 5,
  MISSING_RATES 6, UNVERIFIED_HOTEL_CONTRACT 8, NO_ACTIVE_SERVICES 4, CURRENCY_MISMATCH 4.

## 2. Supplier cleanup — completed
- **Batch 1** — baseCity fill + Alpha email cleanup.
- **Corp Amman FOC correction.**
- **Corp / Olive / Petra Moon** hotel contracts verified.
- **Sun City supplier link fixed** (mis-linked contract relinked).
- **General Transport supplier deleted** (references pre-checked).
- **St. George Church / Mosaic Map Entrance moved** to Jordan Entrance Fees (JOD → JOD, no new
  mismatch).
- **Slice 5 NO_ACTIVE_SERVICES modeling fix** — active hotel contracts now count toward supplier
  activity.

## 3. Accepted / no-edit artifacts (deliberately left as-is)
- **Alpha dual currency (JOD + USD)** — genuine (real touring-route pricing references); accepted, not
  stale.
- **baseCost-priced MISSING_RATES artifacts** — services priced via baseCost; adding rate rows would
  risk double-pricing, so left as-is.
- **Jordan Entrance Fees zero-cost items** — accepted as free / included.
- **RateHawk / external inventory** — externally sourced; warnings there are expected and not local
  data defects.

## 4. Still HOLD (pending pricing-owner / verification decisions)
- **Amman West — remaining 5 services** (three Wadi Rum + two ground-handling; new-supplier + currency
  decision pending).
- **Desert Compass Experiences — EUR row** (single stray EUR row; currency decision needed).
- **The House Boutique Suites** (baseCost-0 placeholder + real gap = missing hotel contract / rate).
- **Desert Compass Transport** (JOD + USD mismatch + MISSING_RATES; part of transport regime work).
- **4 uncontracted hotels** (no active services / no valid contract).
- **Remaining 8 unverified hotel contracts** (on the verification track).

## 5. Current launch blockers (for broad V2-first)
- **Staff UAT** — not yet run against the polished V2 surfaces.
- **Production flag audit** — confirm exactly which V2 flags are ON / OFF in production.
- **Operations V2 production state** — Command Center + Workspace are staging-only (prod flag OFF).
- **Passenger / Rooming production edit** — still **OFF** in production.
- **Booking Creation broad enablement** — still **OFF**.
- **Supplier Voucher Packet V2** — **staging-only**; not in production.
- **Supplier send disabled** — voucher-send allowlist remains `ziad@axisdmc.com` only.

## 6. Finance state
- **Finance V2 read-only** — shipped as a read-only surface; no financial mutations.
- **Classic handoff clear** — finance mutations remain in Classic; the V2 / Classic boundary is
  documented.
- **Margin / cost role gate fixed** — sensitive margin / cost fields are role-gated.

## 7. Recommended next 5 tasks
1. **Staff UAT plan** — structured pass over V2 Catalog + Quote Builder + Operations read surfaces.
2. **Production flag audit** — enumerate every V2 flag's production state vs. intended posture.
3. **Booking Creation controlled-enablement plan** — a gated, low-blast-radius pilot (not broad).
4. **Passenger / Rooming production-enablement plan** — enablement criteria + rollback.
5. **Supplier Voucher Packet S8 planning (later only)** — plan the staging → prod path when send is
   eventually re-enabled; do not start the build.

## 8. Updated GO / NO-GO
- ✅ **GO** — continued **internal** Product Catalog V2 use (read-only, staff).
- ✅ **GO** — **staging QA** across V2 surfaces.
- ⛔ **NO-GO** — **broad V2-first launch** until staff UAT, the production flag audit, and the
  enablement decisions (Booking Creation, Passenger / Rooming, Operations prod) are complete.

## 9. Confirmations
- **No data was edited** by this report.
- **No service was moved.**
- **No supplier was created.**
- **No rate / price / currency was changed.**
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**
- **No flag / environment / production change.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / service / quote IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only status, names, counts, and
  recommendations.

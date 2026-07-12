# Supplier Data Cleanup Plan — using Product Catalog V2 warnings

**Date:** 2026-07-12
**Status:** Documentation only. No code, schema, flag, environment, or **data** change accompanies
this plan. It uses the live, read-only Product Catalog V2 warnings to sequence a supplier/contract
cleanup before a V2-first launch. **No supplier or contract data was edited.**

Source: the live production Product Catalog V2 summary (read-only `GET /catalog/v2/summary`),
captured 2026-07-12: **24 suppliers, 12 hotel contracts, 46 warnings, 0 fully-clean suppliers.**

---

## 1. Live Product Catalog V2 warning snapshot

| Code | Severity (catalog) | Count | Notes |
|---|---|---|---|
| MISSING_EMAIL | high | 6 | mostly hotels + a couple of transport/activity suppliers |
| MISSING_RATES | high | 6 | suppliers with services/contracts but no rate rows |
| EXPIRED_CONTRACT | high | 0 | none currently |
| MULTIPLE_EMAILS | medium | 1 | Alpha Bus and Limo Co (transport) |
| EXPIRING_SOON | medium | 0 | none currently |
| UNVERIFIED_HOTEL_CONTRACT | medium | 11 | 11 of 12 hotel contracts unverified |
| NO_ACTIVE_SERVICES | medium | 14 | mostly hotels — see the caveat in §4 |
| CURRENCY_MISMATCH | low | 4 | suppliers mixing more than one currency |
| MISSING_BASE_CITY | low | 4 | all transport suppliers |

Warning trigger logic (from the pure catalog builder):
- **MISSING_EMAIL** — supplier email field parses to zero addresses.
- **MULTIPLE_EMAILS** — email field holds more than one address (comma/semicolon separated).
- **MISSING_RATES** — supplier has services or transport contracts but zero rate rows.
- **NO_ACTIVE_SERVICES** — no active services and no non-expired active transport contracts.
- **CURRENCY_MISMATCH** — more than one distinct currency across the supplier's services/rates/contracts.
- **MISSING_BASE_CITY** — supplier `type` is transport and base city is blank.
- **EXPIRED_CONTRACT / EXPIRING_SOON** — a transport or hotel contract is past `validTo`, or within 30 days of it.
- **UNVERIFIED_HOTEL_CONTRACT** — hotel contract confidence is not `VERIFIED`.

## 2. Warning-to-launch-gate mapping

Ground truth: packet send-preview blockers are MISSING_EMAIL, MULTIPLE_EMAILS, INVALID_EMAIL,
NO_SUPPLIER (plus packet state, send-disabled, and allowlist). Voucher generate/download need only
an assigned supplier + booking (not email/rates). Booking creation snapshots the accepted quote and
does not independently re-check supplier data. Quoting consumes rates/contracts.

| Code | Quoting | Booking creation | Ops V2 assign | Voucher gen/download | Packet send-preview / readiness | Actual send (later) |
|---|---|---|---|---|---|---|
| MISSING_EMAIL | — | — | — | — | **Blocks** | **Blocks** |
| MULTIPLE_EMAILS | — | — | — | — | **Blocks** | **Blocks** |
| MISSING_RATES | Accuracy: no price | inherits | soft | — | — | — |
| EXPIRED_CONTRACT | Accuracy: stale price | inherits | soft | — | — | — |
| EXPIRING_SOON | Accuracy (soon) | inherits | soft | — | — | — |
| UNVERIFIED_HOTEL_CONTRACT | Trust: unverified price | inherits | — | — | — | — |
| NO_ACTIVE_SERVICES | Assignability | — | should not be assignable | — | — | — |
| CURRENCY_MISMATCH | FX ambiguity | inherits | soft | — | — | — |
| MISSING_BASE_CITY | Transport routing/price | inherits | soft (transport) | — | — | — |

"soft" = affects quality/assignability but is not a hard code-level block. No warning hard-blocks
booking creation or voucher generation. The only **hard** gate is email → supplier packet / actual
send (which is post-launch and send-disabled regardless).

## 3. Priority tiers (for a V2-first launch)

- **Must fix before V2-first launch** (pricing/operational integrity of the core V2 flow):
  - **MISSING_RATES (6)** — a priced supplier with no rates yields wrong/blank quotes; fix rates **or** mark on-request/inactive.
  - **MISSING_BASE_CITY (4, all transport)** — base city drives transport pricing/routing; simple field fix.
  - **CURRENCY_MISMATCH (4)** — confirm the intended single currency; FX ambiguity risks mispricing.
- **Should fix before staff testing** (clean UAT / pricing trust):
  - **UNVERIFIED_HOTEL_CONTRACT (11)** — verification review; mark VERIFIED where confirmed.
  - **NO_ACTIVE_SERVICES (14)** — triage the artifact (see §4); fix only genuine empties.
  - **MULTIPLE_EMAILS (1)** — normalize to a single primary address.
- **Can fix post-launch:**
  - **MISSING_EMAIL (6)** — only needed once supplier send is enabled (post-launch, allowlist-gated); see §5.
  - **EXPIRED_CONTRACT / EXPIRING_SOON** — currently 0; keep monitoring as contracts age.

## 4. Caveat — NO_ACTIVE_SERVICES is inflated by hotel-contract modeling

The supplier-level "operationally active" check counts only `supplierServices` + non-expired
**transport** contracts — it does **not** consider `hotelContracts`. So hotels whose inventory lives
entirely in hotel contracts are flagged NO_ACTIVE_SERVICES even though they have valid contracts.
Treat the 14 as **"triage required," not "14 empty suppliers."** The real remedy is either a
catalog-logic change so hotel contracts count toward "operationally active," or accepting it as a
known false-positive — both are **engineering decisions, documented only** for now (no code change in
this plan). Only the genuinely-empty subset needs data cleanup.

## 5. Caveat — MISSING_EMAIL is high severity but not launch-blocking (while send is disabled)

The catalog marks MISSING_EMAIL "high" because email is critical for supplier communication. But
supplier **send** is explicitly post-launch, is **send-disabled**, and is **allowlist-gated** to a
single recipient. So MISSING_EMAIL does **not** block a V2-first launch: it blocks only the (future)
packet/actual send. Priority in §3 is by which gate the launch actually exercises, not raw catalog
severity. Fixing emails improves send *readiness* but cannot trigger a send while send is disabled.

## 6. Cleanup workflow (owner per warning)

- **Fixable directly in Classic (data entry, no confirmation needed):** MISSING_BASE_CITY (set base
  city on the 4 transport suppliers) and MULTIPLE_EMAILS (normalize to one primary address) — via the
  Classic supplier editor.
- **Needs supplier/contact confirmation:** MISSING_EMAIL — obtain the correct address from the
  supplier before entering; do not guess. (Validate format on entry — the catalog flags missing/
  multiple but not a single malformed address.)
- **Needs contract/rate review (pricing owner + finance):** MISSING_RATES (add rates after review, or
  mark on-request/inactive), CURRENCY_MISMATCH (confirm the true currency, then normalize),
  UNVERIFIED_HOTEL_CONTRACT (verify contract terms, then set confidence = VERIFIED).
- **Documented-only / engineering caveats:** the NO_ACTIVE_SERVICES hotel-contract artifact (§4) — a
  catalog-logic decision, not a data fix.

## 7. Validation method

- **Warning reduction:** re-fetch the read-only Product Catalog V2 `warningCounts` before and after
  each batch; confirm the targeted code drops by the expected number and nothing else regresses.
- **Avoid accidental pricing changes:** the first batches (base city, emails, hotel *verification-
  only*) touch no rate rows. For any rate/currency edits, remember accepted quotes are **frozen
  snapshots** — editing catalog rates does not retro-change existing quotes/bookings; still, spot-check
  a couple of existing quote totals are unchanged, and never bulk-edit rates.
- **Confirm no supplier email send occurs:** cleanup is data entry only; the voucher-send flag stays
  **off** and the allowlist stays **`ziad@axisdmc.com`**. Email fixes improve readiness but cannot
  trigger a send while send is disabled.

## 8. First recommended cleanup batch (safe, zero pricing risk)

- **MISSING_BASE_CITY** → set base city on the 4 transport suppliers: Almushtari Logistics Services,
  Desert Compass Transport, Alpha Bus and Limo Co, General Transport.
- **MULTIPLE_EMAILS** → normalize **Alpha Bus and Limo Co** to a single primary address.

Why first: pure Classic field edits, **no rate/pricing impact**, immediately drop ~5 warnings, and
exercise the full edit → re-fetch-`warningCounts` → confirm-drop validation loop with zero pricing or
send risk. (Note: Alpha Bus and Limo Co and Desert Compass Transport also carry CURRENCY_MISMATCH —
flag those for the later rate/currency batch; do **not** touch currency in this first batch.)

Subsequent batches: (2) UNVERIFIED_HOTEL_CONTRACT verification (low risk, no rate edits); (3)
MISSING_RATES + CURRENCY_MISMATCH (must-fix, pricing owner + finance, snapshot-safe but sensitive);
(4) NO_ACTIVE_SERVICES triage; post-launch: MISSING_EMAIL once supplier send is enabled.

## 9. No data was edited

This plan is analysis only. The Product Catalog V2 summary was read via a read-only GET to derive the
warning snapshot; **no supplier, contract, rate, email, currency, or base-city value was created,
updated, or deleted.** No flags, environment, production, supplier-send, or Classic changes were made.
The voucher-send allowlist remains `ziad@axisdmc.com` and supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- Read-only inspection used a session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, or connection details are recorded here.

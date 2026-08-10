# ERP V2 — Ops-DG-1 Ops V2 Service Row Display Polish: Staging Validation Report

**Result: PASS** (read-only) — the deployed operations-grid proxy returns rows that map
to the curated labels + safe detail the board renders; no money/PII in the board's read
path; the booking is unchanged.

---

## 1. Result

- Ops-DG-1 staging validation **passed**.
- The deployed operations-grid proxy returns rows that map to curated labels and safe
  details.
- No money/PII rendered by the board.
- Booking unchanged.
- Read-only validation only.

## 2. Context

- **PR #816** — Ops V2 service row display polish.
- **PR #817** invariant reconciliation is also on main.
- Frontend-only display polish.
- No backend/API changes.
- No new fetch/mutation/action.

## 3. Staging deployed commit

- **admin-web includes PR #816:** `65547be480556745ce2487e5d3e44530d98743c2`
  (the `git-main` alias serves the deploy created 07:06:43Z, matching the merge).
- **PR #817 on main:** `11a50f3fb337412691070b93468d9a32e1cc3b74`.
- Staging API / admin-web on the same `origin/main` tip (`65547be4`).

## 4. Booking used

- **BK-2026-0002** — `635fb212-1a57-443c-a4a2-dee2c8eeb924`.
- status **draft**.
- **5 services**.
- **5 distinct service types**.
- **2 voucher packets**.
- **No new data created.**

## 5. Board render result

- operations-grid proxy returned **200**.
- **5 rows** returned.
- Five-phase layout preserved.
- Service rows render.
- Supplier display preserved.
- Confirmation / Voucher / Status badges preserved.
- Assignment / confirmation / voucher / packet controls unchanged.
- A browser drive was **not** performed because login credentials are prohibited.
- Deterministic VM/rendering covered by the merged regression tests.

## 6. Curated label result

Available serviceTypes mapped to friendly labels:

- `ACTIVITY` → **Activity**
- `HOTEL` → **Hotel**
- `TRANSPORT` → **Transport**
- `GUIDE` → **Guide**
- `DINING` → **Dining**

All present values were **known** in the curated table.

## 7. Fallback result

- No unknown/other serviceType existed in this booking.
- The documented fallback is covered by the merged tests: unknown value → friendly
  title-case + `CircleDot`.
- Fallback does not crash, blank, or show `undefined`/`null`.

## 8. Secondary detail result

- Detail line rendered when safe fields were present.
- Example: `pickupLocation` + `operationalTime` rendered as a safe detail line.
- Rows without safe detail returned `null` and were omitted cleanly.
- No raw `undefined`/`null` displayed.

## 9. Redaction / safety audit

The board-read path does **not** render:

- cost
- margin
- price
- payable
- supplier payment
- supplier discount
- guest phone / email
- passport number
- passenger PII

**Transparent observation:**

- `driverPhone` IS present in the raw operations-grid API payload.
- The Ops-DG-1 frontend `RawGridRow` allowlist does **not** read `driverPhone`.
- UI/render tests assert `driverPhone` is **not rendered**.
- **Recommend tracking a future backend payload-redaction review** for contact fields
  (so `driverPhone`/contact are not shipped in the raw grid payload at all).

Also: no raw supplier object rendered, no `ratePolicies` rendered, no tokens/references
rendered.

## 10. Read-only behavior audit

- No new forms.
- No new inputs/selects.
- No new actions.
- No new fetches from the display polish.
- No POST/PATCH/PUT/DELETE from the display polish.
- `ops-readonly-invariant` is green.

## 11. Side-effect check

- **BK-2026-0002 unchanged.**
- status **draft** unchanged.
- services count unchanged.
- voucher-packet count unchanged.
- per-service assignment/confirmation/voucher fingerprint unchanged.
- All calls **GET / read-only**.
- No writes.
- No email/send.
- No Accept.
- No invoice.
- No booking conversion.
- No voucher/packet send or generate.

## 12. Test / CI confirmation

- `ops-readonly-invariant` **12/12**.
- `ops-display-polish` **9/9**.
- Ops regression **102/102**.
- tsc **9** (baseline).
- All Vercel checks green.

## 13. Confirmations

- No data edits.
- No cleanup needed.
- No Accept.
- No invoice.
- No booking.
- No email/send.
- Production unchanged.
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.
- Next build slice **not started**.

## 14. GO / NO-GO

**GO**

- Ops-DG-1 display polish validated on staging.
- Close Ops-DG-1 after this doc merges.
- Track a future backend payload-redaction review for `driverPhone`/contact fields.

**NO-GO**

- Displaying `driverPhone`/contact fields.
- Cost / margin / price / payable / supplier-payment exposure.
- New actions / forms / fetches / mutations.
- Voucher-send / supplier-send behavior changes.
- Accept / invoice / booking.
- Staff rollout / live bookings.
- Full no-Classic launch.

---

*Validation performed on staging only, read-only, via the deployed admin-web
operations-grid proxy (the exact data the board maps), against an existing QA/UAT
booking. No data created or edited. The visual board rendering + label/detail mapping
are covered by the merged tests; a real browser drive of the authenticated staging page
was not performed (it requires login credentials). Classic remains the system of record.*

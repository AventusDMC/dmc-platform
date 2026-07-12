# Supplier Data Cleanup — Batch 2B Correction Preflight

**Date:** 2026-07-12
**Status:** Read-only preflight. No code, schema, flag, environment, or **data** change accompanies
this report. **No data was edited, nothing was marked VERIFIED, and the confidence endpoint was not
called.**

Batch 2B was held because a source-doc review appeared to conflict with the stored contract data
(meal-plan basis, child policy, and Corp Amman's FOC). This preflight re-inspected the three
candidate contracts against the authoritative endpoints to determine exactly what, if anything, must
be corrected before verification.

---

## 1–4. Scope
Read-only preflight. **No data edited. Nothing marked VERIFIED. The confidence endpoint was not
called.** Values were read from `GET /hotel-contracts/:id` (readiness flags) and the room-types
summary (actual per-rate meal plans).

## 5. The earlier "missing meal plan / missing child policy" finding was a fetch artifact
The previous Batch 2B preflight read meal plans and child policy from `GET /hotel-contracts/:id`, but
that endpoint returns **`has*` readiness flags**, not embedded `rates` / `mealPlans` / `childPolicy`
arrays — so those fields came back undefined and were wrongly reported as "no meal-plan code" and "no
child policy." That was a **fetch artifact, not a real data gap.**

## 6. Actual stored data
The authoritative sources show the data is present:

| Contract | Meal plans on rates | `hasMealPlans` | `hasChildPolicy` | Rooms / rates |
|---|---|---|---|---|
| Corp Amman Hotel | BB, HB (all 4 rooms) | true | true | 4 rooms / 16 rates |
| Olive Hotel Amman | BB, FB, HB | true | true | 1 room / 6 rates |
| Petra Moon Hotel | BB, HB | true | true | 1 room / 28 rates |

- **Meal plans are present** — rates carry BB/HB (Olive also FB); the `HotelMealPlan` enum is
  RO/BB/HB/FB/AI and `HotelRate.mealPlan` is a required field, so no rate can be blank.
- **Child policy is present** — `hasChildPolicy = true` on all three (content still to be confirmed
  against the signed doc).
- **BB/HB basis exists where expected.**

So two of the three HOLD premises (missing meal plan, missing child policy) do not hold up; the data
already matches the expected BB/HB basis and has a child policy attached.

## 7. Corp Amman Hotel — the real mismatch (FOC)
- **Stored FOC:** `focType = none`, `focRatio = null`, `focCount = null`, `focRoomType = null`.
- **Source-confirmed FOC:** **15:1**.
- **Proposed correction:** `focType = "ratio"`, `focRatio = 15`, `focRoomType = "double"` (mirroring
  the shape stored on the other two contracts). This is the **only genuine data correction** in the
  batch. No meal-plan, child-policy, rate-row, or supplement edit is required.

## 8. Olive Hotel Amman
- **FOC already stored:** `ratio`, `focRatio = 16`, `focRoomType = double` (**16:1**).
- **No data correction needed** before verification — pending source-doc confirmation that 16:1, the
  BB/FB/HB basis, and the child policy match. (Note: `hasSupplements = false` and
  `hasCancellationPolicy = false`; contract-detail `readinessStatus = "in_progress"`, while the
  health verification gate still allows — worth confirming whether "no supplements / no cancellation
  policy" is intended.)

## 9. Petra Moon Hotel
- **FOC already stored:** `ratio`, `focRatio = 15`, `focRoomType = double` (**15:1**).
- **No data correction needed** before verification — pending source-doc confirmation that 15:1, the
  BB/HB basis, and the child policy match. (The supplier-level `MISSING_RATES` warning is a separate
  supplier-service gap for a later batch; the contract itself is fully priced.)

## 10. The Corp Amman FOC correction is pricing-sensitive
FOC (free-of-charge) is a discount mechanism (e.g. one free room per 15) that feeds **future** quote
pricing when the quote's own FOC is unset. Changing Corp Amman from `none` to `15:1` therefore
affects future quote economics and must be approved with the pricing owner. Existing quotes are
**frozen snapshots** and are unaffected (Corp Amman has existing quote items, all frozen). The edit
mechanism (a partial `PATCH` of the FOC fields on the contract) is clean; the **value** is
pricing-sensitive and must match the signed contract.

## 11. Expected warningCounts impact
- The **FOC correction changes no Product Catalog V2 warning counts** — FOC is not a warning trigger.
  `warningCounts` stays exactly as-is after the correction.
- **`UNVERIFIED_HOTEL_CONTRACT` only drops after a separate verification step** (11 → 8 if all three
  are later verified).

## 12. Next recommended step
- **Approve the Corp Amman FOC correction only if the pricing owner accepts 15:1** (`focType=ratio`,
  `focRatio=15`, `focRoomType=double`), applied as a FOC-only field edit.
- **Then verify the three clean contracts as a separate approved step** (Corp Amman after its FOC
  correction; Olive and Petra Moon after source-doc confirmation), one at a time, re-checking
  `warningCounts` after each.

## 13–15. Safety
- **No email was sent.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change; nothing verified; the
  confidence endpoint was not called.
- Read-only inspection used a session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, session tokens, or connection details
  are recorded here.

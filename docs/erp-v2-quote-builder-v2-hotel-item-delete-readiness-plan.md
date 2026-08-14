# ERP V2 — HD-0: Hotel Item Delete — Readiness Plan

**Status: readiness plan (doc-only, read-only).** No code, schema, flags, env, or data. HD-0 opens a **new hotel-specific planning track** to determine *what must be proven* before guarded Quote Builder V2 item deletion could safely be extended to hotel rows. **It does not authorize hotel-delete implementation, staging mutations, flag changes, or production access.** Classic remains the system of record; ERP V2 remains build/test only; production item-mutation remains OFF.

**Verdict up front: CONDITIONAL GO — to a read-only HD-a *prerequisite* slice only.** Hotel delete is **not** cleared for implementation. A prerequisite investigation must first resolve a structural model ambiguity (hotel `QuoteItem` line vs `QuoteHotelOption`), a deterministic primary-reselection rule, and completeness/readiness/allotment/contract safety (see §12). If any named proof fails, the recommendation is **NO-GO**.

Facts are cited to files/lines/PRs. Recommendations are marked **[REC]**; open questions are marked **[OPEN]**.

---

## 1. Purpose and current boundary

**Documented.**
- Guarded create **and** delete are complete for the five Experiences types: `activity`, `guide`, `meal`, `entrance`, `external_package` (create M-1…M-3; delete D-0…D-b, PRs #845–#849).
- Hotel, transport, and **unclassified** deletion remain **blocked** — `classifyRemovable` applies a denylist (hotel/transport) first, then an allowlist of the five types; anything not positively classified returns `item_not_removable` (`apps/api/src/quotes/quote-experiences-v2.service.ts:904`, exclusions `:915`, reject `:949`).
- The delete sequence defined by the D-0 plan is **complete** (`docs/erp-v2-quote-builder-v2-guarded-item-delete-readiness-plan.md`, "Proposed PR sequence" lines 178–186; all six steps merged #845→#849).
- #845 permits reconsidering hotel/transport deletion **only after a prerequisite review proves it safe** (§3 line 32; §15 NO-GO line 171). HD-0 is the first artifact of that review.
- Classic remains the system of record. ERP V2 remains build/test only. Production item-mutation remains OFF (`QUOTE_ITEM_CREATE` / `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE` staging ON / prod OFF).

## 2. Why hotel is being assessed before transport (not an authorization)

**Documented — comparison only; this does not authorize hotel deletion.**
- Hotel items are on a **different Quote Builder V2 UI surface** (the **Hotels step**), not the Experiences step where the D-b Remove affordance lives (`components/quote/v2/quote-builder-v2.tsx` renders `HotelsStep` vs `ExperiencesStep`).
- Transport carries additional complexity the readiness comparison ranks higher-risk: **folded add-ons** (stationary + driver-overnight fold into a parent transport line's baseCost, PRs #453/#455, `project_transport_addon_apply_t5g1a`), **multi-leg days + per-day indicators** (PR #572), and **per-route vs package/touring regime** (`project_transport_contract_regime_plan`).
- Hotel appears **lower-risk than transport** but still has lifecycle, readiness, contract, allotment, and primary-selection dependencies (§3–§5). Lower-risk ≠ cleared.

## 3. Current hotel lifecycle (with citations)

**Confirmed behavior:**
- **Hotel item persistence.** A priced hotel line is a `QuoteItem` carrying `hotelId`, `contractId`, `roomCategoryId`, `occupancyType`, `mealPlan`, `roomCount`, `nightCount`, `optionId`, plus relations `hotel → Hotel` and `contract → HotelContract` (`apps/api/prisma/schema.prisma`, QuoteItem block ~1160–1206). The `contract` relation has **no cascade delete** — deleting the `QuoteItem` does not delete the `HotelContract` (master data).
- **Primary designation is modeled elsewhere.** `isPrimary` is a boolean on **`QuoteHotelOption`** (`schema.prisma:1433–1448`), which belongs to a `QuoteOption` (per-stop option set: `city`, `hotelId`, `roomCategoryId`, `hotelNameSnapshot`, `nights`, `isPrimary`). Its `hotel`/`roomCategory` relations are `onDelete: SetNull`. V2 "Set as primary" flips `isPrimary` via PATCH (`project_quote_builder_v2_hotels_edit`). **This is a different structure from the priced hotel `QuoteItem`.** [OPEN]
- **Many quotes have 0 `quoteOptions`.** The hotel-diagnostics work found quotes with **zero** `quoteOptions`, so contract status falls back to on-request (`project_quote_builder_v2_hotel_diagnostics`, PRs #566/#567). This means the relationship between a deletable hotel `QuoteItem` and the primary-bearing `QuoteHotelOption` is **not uniform across quotes**. [OPEN]
- **Hotel preview + apply.** Preview and apply are **live in production** for hotels (`docs/erp-v2-quote-builder-v2-capability-inventory.md:29`; `QUOTE_PRICING_HOTEL_APPLY` prod-ON, `project_quote_builder_v2_hotel_apply`). Apply re-prices a matched hotel line in place; it does not remove.
- **Read-only contract/rate detail.** HC-1 exposes `GET /quotes/:id/v2/items/:itemId/hotel-contract-summary` (finance-gated, whitelist, no writes; PR #809, `project_quote_builder_v2_hotel_contract_detail`).
- **Quote-total recalculation.** `recalculateQuoteTotals` sums line totals; the deterministic `removeItem` (`quotes.service.ts:6570`) already runs it after a delete. Removing a hotel line would reduce totals like any line. Confirmed deterministic.
- **Quote status / editability.** The delete wrapper reuses `EDITABLE_STATUSES = {DRAFT, READY, REVISION_REQUESTED}` + `acceptedVersionId == null` + latest-revision + company isolation (`quote-experiences-v2.service.ts:79`; D-a). These already exclude accepted/sent/converted quotes.
- **Audit.** The delete path writes a best-effort, sanitized `quote.item.removed` audit row (D-a; `quote-experiences-v2.service.ts`).

**Open questions (behavior to establish in the prerequisite):**
- **Overnight-stop completeness rules** — "Hotels complete = a hotel selected for each overnight stop" is surfaced in the cost summary and drives proposal-readiness "Items to review" (observed live in the deployed Hotels step). The exact computation and where it reads (QuoteItem vs QuoteHotelOption) must be traced. [OPEN]
- **Proposal-readiness / "items to review"** derivation for hotels (on-request vs confirmed) — the code path and inputs must be cited (candidates: `quotes.service.ts`, `quote-experiences-v2.service.ts`, proposal-readiness helpers). [OPEN]
- **On-request vs confirmed** hotel status effect on deletion (none expected, but must be confirmed). [OPEN]
- **Committed-allotment consumption** — see §5. [OPEN]

## 4. Primary and completeness rules — what the prerequisite must prove

The prerequisite slice must produce a **deterministic, documented rule** (not invented here) for each case below. Options + risks presented; the prerequisite decides.

| Case | Options | Risk |
|---|---|---|
| Delete a **non-primary** hotel | (a) remove the line, no primary change | Low — if the deleted line is not the stop's primary |
| Delete the **primary** hotel when alternatives remain | (a) auto-promote another option to primary; (b) leave the stop with **no** primary and mark it incomplete/needs-review | Auto-promote must be **deterministic** (which alternative?) or it is unsafe; leaving no-primary must not corrupt readiness |
| Delete the **only** hotel for an overnight stop | (a) allow → stop becomes **incomplete** (readiness lists it); (b) **block** (`item_not_removable`/`stop_would_be_incomplete`) and require Classic | Allowing must produce a **consistent** incomplete state; blocking is safest but reduces capability |
| Auto primary re-selection | (a) implement deterministic rule; (b) **do not** auto-reselect — require explicit user action | Non-deterministic reselection is a NO-GO trigger (§12) |

**[REC] for the prerequisite to evaluate (not a decision):** the safest first increment is likely **delete only a non-primary hotel line, and block deletion of a primary or only-hotel line** (`item_not_removable` with a "manage in Classic" message) — deferring primary-reselection semantics entirely. This must be confirmed against the actual completeness/readiness code and the QuoteItem↔QuoteHotelOption relationship before it can be recommended. The Hotels step and cost summary must reflect the post-delete state exactly as they do after a Classic hotel removal.

## 5. Contracts and allotments

**Assessment (confirmed + open):**
- **Deletion must only remove the quote item, never mutate supplier contract/rate master data.** The `QuoteItem.contract → HotelContract` relation has no cascade; `removeItem` deletes only the `QuoteItem` row + recalcs. **[REC] Hard invariant:** hotel delete MUST NOT write to `HotelContract`, `HotelRate`, `HotelRoomCategory`, or any supplier master. The prerequisite must prove the delete path touches none of these.
- **Committed-allotment consumption is booking-stage and derived.** Allotment consumption/oversell logic lives in `apps/api/src/bookings/bookings.service.ts` and is **DERIVED (no stored counter), computed from bookings**, with an oversell guard (PR #192, `project_hotel_allotment_integration`). A **DRAFT quote has no booking**, so a quote-stage hotel-item delete has **no allotment counter to update and no hold to release** — expected **no allotment effect**. **[OPEN]** The prerequisite must confirm there is no quote-stage allotment/hold/reservation state on a hotel `QuoteItem`.
- **Orphan risk.** `QuoteHotelOption.hotel/roomCategory` are `onDelete: SetNull`; `QuoteItineraryDayItem.quoteService → QuoteItem` is `onDelete: Cascade` (validated in D-a — day-link cascades, no orphan). The prerequisite must confirm no other model references a hotel `QuoteItem` in a way that would orphan on delete, and that deleting a hotel `QuoteItem` does **not** disturb `QuoteHotelOption`/`QuoteOption` rows (they reference options, not the item). [OPEN]
- **Cross-quote / shared data.** Contracts/rates are shared master data referenced by `contractId`; deletion removes only the per-quote line, so **no other quote is affected** — must be confirmed by the prerequisite. [OPEN]

## 6. Backend design options (no selection here)

**Option A — extend the existing guarded item-delete classifier/routes/token.**
Add `hotel` to the allowlist in `classifyRemovable`, keeping the transport/unclassified denylist; reuse `POST …/item/:itemId/remove/preview` + `DELETE …/item/:itemId`, the `v2-item-delete` token, `assertQuoteAccess`, `removeItem`, and the `quote.item.removed` audit.
- Eligibility: hotel via `hotelId`/`isHotelService`; **risk of accidentally enabling transport/unclassified is LOW** because the denylist runs first, but any allowlist edit must be tested to prove transport/unclassified still fail closed.
- Reuses the deterministic `removeItem` path unchanged.
- **Con:** overloads one route/token/classifier across two UI surfaces; primary/completeness validation for hotels would need bespoke branching inside a shared method.

**Option B — hotel-specific preview/delete routes + a hotel-specific token kind (`v2-hotel-delete`).**
Separate `POST …/hotel/:itemId/remove/preview` + `DELETE …/hotel/:itemId`; distinct token kind; hotel-only eligibility + primary/completeness validation isolated from the Experiences path.
- **Pro:** keeps the Experiences delete surface untouched (no regression risk to the five shipped types); makes hotel-specific guards (primary, completeness, stop-integrity) explicit; cross-type token replay impossible by construction.
- **Con:** more surface; some duplication.

**For each option the prerequisite/backend slice must specify:** eligibility classification; quote editability + `acceptedVersionId` gate; **primary/completeness validation** (§4); stale-preview protection (snapshot token); projected cost/selling totals (finance-redacted); permission model (§7); finance redaction; sanitized audit; typed error codes + user-safe messages (`item_not_removable`, `stop_would_be_incomplete` [proposed], `primary_reselection_required` [proposed], `quote_not_editable`, `stale_preview`, `invalid_preview_token`, `feature_disabled`); failure atomicity (delete + recalc in one path; no partial state); reuse of the deterministic `removeItem`; and an explicit test that **transport + unclassified still return `item_not_removable`**.

**[REC] lean (for the prerequisite to confirm, not a commitment):** **Option B** — a hotel-specific route/token isolates the higher-risk primary/completeness logic and guarantees zero regression to the shipped Experiences delete. Do not select without the prerequisite's justification.

## 7. Frontend design options

**Documented:** the current Remove affordance is Experiences-step-only (`components/quote/v2/steps/experiences-step.tsx`, `RemoveItemControl`); it **cannot be assumed to cover hotels**, which render in the **Hotels step**.

The prerequisite/frontend slice must decide:
- **Placement** in the Hotels step (per hotel row), reusing the D-b preview→confirm handler/proxy pattern (a new hotel remove proxy would mirror the existing thin proxies; no new product/service fetch).
- **Visibility/eligibility:** only eligible hotel rows; hidden when the flag is OFF and for non-editable quotes.
- **Primary / only / on-request / incomplete rows:** per §4 — likely **hide or disable-with-explanation** on primary/only rows in the first increment (e.g., disabled Remove with tooltip "Manage the primary/only hotel in Classic"). Prefer **disabled + explanation** over silent hiding so staff understand why.
- **Confirmation-dialog wording:** selling-total impact only (current / after / change); **no cost/margin** rendered (redaction), even for finance, matching D-b.
- **Refresh + success/error feedback:** reuse toast + `router.refresh()`; map the typed errors to safe copy.
- **Roles:** `viewer`/`agent` never see the affordance (route-blocked); `operations`/`admin`/`super_admin`/`finance` may (delete exposes no cost, per D-b's not-finance-only decision) — to be confirmed for hotels.
- **Fail-closed:** when a row cannot be confidently classified as a deletable hotel, **do not** show an enabled Remove — hide or disable with explanation; the backend independently returns `item_not_removable`.

## 8. Feature-gate analysis

- **Option 1 — reuse `QUOTE_ITEM_CREATE` / `NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE`** (the V2 item-mutation surface, as D-a/D-b did).
- **Option 2 — a hotel-delete-specific gate** (backend + `NEXT_PUBLIC_` frontend), default OFF, for independent rollout.

**The plan states (authorization boundary):**
- **No gate changes are authorized by HD-0.**
- Any future hotel-delete **production** gate must default **OFF**.
- Production item-mutation remains OFF.
- **`QUOTE_PRICING_HOTEL_APPLY` must NOT implicitly authorize hotel deletion** — it gates hotel *re-pricing*, a distinct capability.
- The documented **`QUOTE_PRICING_HOTEL_APPLY` prod-ON / staging-OFF** difference (`capability-inventory.md:54,72`) is **pre-existing, orthogonal, and must not be changed in this PR**. Any recommendation about that inconsistency belongs to a **separate, explicitly approved task**.

**[REC] for the prerequisite:** given hotels are a higher-lifecycle surface, a **dedicated OFF-by-default hotel-delete gate (Option 2)** is the more conservative choice, decoupling hotel-delete rollout from the Experiences item-mutation flag. Confirm in the prerequisite.

## 9. Security and redaction

The future slices must guarantee:
- No supplier/internal notes, raw contract rates, or supplier net details in preview or delete responses for any role; **cost/margin redacted** for non-finance (reuse `canViewQuoteCostMargin`).
- No credentials, tokens, PII, or sensitive metadata in logs; **sanitized audit** metadata only (quoteId, itemId, itemType, dayId/stop, resulting totals) — mirroring `quote.item.removed`.
- **Preview-token binding** to quote + item + action (`v2-hotel-delete` kind) + a pre-remove state snapshot; **tampered/expired/replayed/stale** tokens fail closed (`invalid_preview_token` / `stale_preview`), reusing the D-a token helpers.
- The HC-1 contract-summary surface stays finance-gated and read-only; hotel delete must not widen contract-data exposure.

## 10. Testing plan (to define later, not implement now)

- **Eligibility matrix:** hotel removable (once approved) vs transport/unclassified still `item_not_removable`; regression that the **five Experiences types remain removable**.
- **Primary/completeness:** non-primary / primary-with-alternatives / only-hotel cases produce the documented deterministic outcome; completeness + proposal-readiness change exactly as specified.
- **Contract/allotment linkage:** delete touches no `HotelContract`/rate/room-category master; no quote-stage allotment/hold remains; no orphaned linked records; no cross-quote effect.
- **Quote status/permissions:** non-editable / accepted / cross-company blocked; role matrix (viewer/agent blocked; ops/admin/super_admin/finance per decision; agent_admin explicit).
- **Preview totals:** projected selling (and finance-only cost) correct; **cost/margin redaction** asserted.
- **Tokens:** stale + tampered + wrong-kind + expired fail closed.
- **Audit:** `quote.item.removed` (or hotel-specific action) written, sanitized.
- **Atomicity:** delete + recalc succeed together or not at all; failure leaves no partial state.
- **Frontend:** visibility/eligibility, primary/only/on-request/incomplete treatment, confirmation, cancellation (no DELETE), success, error mapping.
- **Pricing-math unchanged:** assert `resolveQuoteItemValues` / `createItem` / `recalculateQuoteTotals` / `removeItem` are not modified.

## 11. Staging-validation plan (to perform later, not now)

- **Staging only**, project-ID-pinned (`dmc-platform-staging` / `26e31130…`), hard guard (marker `BK-2026-0002`, prod `cheerful-enthusiasm`/`60d81051` excluded, session secret present), STAGING-ONLY log.
- **No existing retained evidence item may be deleted** (the M-3 external item `4beecd88…` is untouched).
- **Create or identify a dedicated temporary hotel item** on a synthetic staging quote (do not reuse a production-shaped quote).
- Capture **baseline**: primary/completeness/readiness + totals.
- **Preview before delete**; delete **only** the temporary hotel item; confirm projected and final totals; confirm primary/completeness/readiness behavior; confirm **contract/allotment integrity** (no master mutation, no residual hold); confirm the audit entry; confirm **net-zero / cleanup** where possible.
- Close the deployed-frontend gap **live** through the signed-in staging admin-web (as required for D-b): API-container/localhost calls + automated tests are supporting evidence only.
- **No** Accept, invoice, booking, public link, voucher, packet, supplier-send, or email/send.

## 12. Risks, open questions, and GO / NO-GO criteria

**Key open questions the prerequisite MUST resolve:**
1. **Model ambiguity:** what is a "hotel row" in the Hotels step — the priced hotel `QuoteItem`, the `QuoteHotelOption` (which holds `isPrimary`), or both — and does `removeItem` (which deletes a `QuoteItem`) even target the right entity when `quoteOptions` may be 0? [OPEN, structural]
2. **Deterministic primary reselection** (or a decision not to auto-reselect).
3. **Completeness/readiness** derivation and post-delete consistency.
4. **Allotment/contract safety** (no master mutation; no residual quote-stage hold).
5. **Orphan/cascade** review for all models referencing a hotel `QuoteItem`.
6. **Eligibility reliability** — hotels distinguishable, transport + unclassified still fail closed.
7. **Deterministic total projection** for hotel lines.
8. **Permissions/redaction** for the Hotels-step affordance.

**NO-GO conditions (any one → do not proceed to backend):**
- Primary-reselection behavior is ambiguous or non-deterministic.
- Deleting the only hotel creates an inconsistent completeness/readiness state.
- Contract/allotment effects are not proven safe (or deletion could mutate master data).
- Linked records could be orphaned.
- Eligibility cannot reliably distinguish hotels, or the change could enable transport/unclassified deletion.
- Pricing totals cannot be projected deterministically.
- The action could affect accepted/versioned/booked quotes.
- Required UI permissions or redaction are unclear.
- A safe staging fixture cannot be established.

**Recommendation: CONDITIONAL GO** — GO **only** to a read-only **HD-a prerequisite** slice to resolve the open questions above. Escalates to **GO (implementation)** only if the prerequisite proves every NO-GO condition is cleared; otherwise **NO-GO**. **This plan does not authorize backend or frontend implementation.**

## 13. Proposed small-PR sequence

Consistent with `plan → prerequisite → backend → backend staging validation → frontend → live frontend staging validation → documentation`; each code slice requires validation before the next:
1. **HD-0** — this readiness plan (doc-only).
2. **HD-a prereq check** (read-only) — resolve §12 open questions; confirm model, primary/completeness rule, allotment/contract safety, eligibility, flag, Option A/B, error codes; produce GO / CONDITIONAL GO / NO-GO.
3. **HD-b backend** — *only if HD-a = GO*; reuse deterministic `removeItem`; no pricing math; flag OFF prod.
4. **HD-b backend staging validation** + doc.
5. **HD-c frontend** — Hotels-step Remove affordance.
6. **HD-c live frontend staging validation** + doc.

## 14. Scope boundaries (this PR)

**Explicitly out of scope:** backend or frontend implementation; transport deletion; unclassified deletion; item edit/re-price; catalog or finance write-paths; schema or migration changes; pricing-math changes; production access or rollout; staff rollout; live bookings; Accept, invoice, booking, conversion, public link, voucher, packet, supplier-send, or email/send; any Classic change; any flag/env change (including the `QUOTE_PRICING_HOTEL_APPLY` inconsistency).

**In scope:** one new Markdown readiness-plan document; read-only analysis and citations; risk/dependency mapping; option comparison; GO / CONDITIONAL GO / NO-GO recommendation and named prerequisite proofs.

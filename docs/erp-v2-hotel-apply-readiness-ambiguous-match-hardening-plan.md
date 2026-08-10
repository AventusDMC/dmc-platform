# ERP V2 — Hotel Apply Readiness + Ambiguous-Match Hardening — Plan

Planning / read-only inspection. No code, schema, flag, or env changes. Classic remains the system of record.

**Goal:** review the current Quote Builder V2 hotel preview/apply path and define the safest next hardening slice before expanding hotel apply usage — with no new pricing math and no broad write risk.

## 1. Hotel preview/apply inventory (current implementation)

**Backend** (`apps/api`) — generic engine, no hotel-specific route:
- `POST /quotes/:id/items/:itemId/preview` — `@Roles('admin','operations')` (`apps/api/src/quotes/quotes.controller.ts:1449`). Returns preview + `previewToken`.
- `POST /quotes/:id/items/:itemId/apply-preview` — `@Roles('admin','operations')` (`quotes.controller.ts:1468`). Body carries `previewToken` + `acknowledgedDelta`.
- Pure resolver `resolveQuoteItemValues` hotel branch (`quotes.service.ts:7239-7373`): reads `hotelRate.findMany({ contractId, season(date|name), roomCategoryId, occupancyType, hotelId })`, HB→BB+supplement fallback, delegates compute to `HotelPricingResolver`. Pure read — **no writes**.
- Apply re-derives the snapshot and writes via the existing Classic `updateItem` path (`recalculateQuoteTotals` is source of truth). Token = AES-256-GCM `v2s.<iv>.<tag>.<ct>`, ~15 min TTL (`quote-preview-token.ts`).
- Read-only drawer `GET /quotes/:id/v2/items/:itemId/hotel-contract-summary` — exact-role allowlist (`HOTEL_CONTRACT_SUMMARY_ROLES`), cost-gated, curated (HC-1/HC-2).

**Frontend** (`apps/admin-web`) — also generic; hotel scope = flags + `pricedQuoteItemId`:
- `app/quotes/[id]/builder-v2/page.tsx` reads flags (L106/L114) + role/status gate `canPreviewPricing = hasRequiredRole(['admin','operations']) && status ∈ {DRAFT, READY, REVISION_REQUESTED}`.
- `components/quote/v2/steps/hotels-step.tsx`: `canPreview = onPreviewItem && hotel.pricedQuoteItemId && hotelPreviewEnabled`; `canApply = canPreview && onApplyItemPricing && hotelApplyEnabled`. Uses shared `PricingPreviewModal` → `onApply(itemId, {}, previewToken, ack)`.
- Matcher `lib/quote-hotel-line-match.ts` + adapter `lib/quote-v2-adapter.ts` (build `PricedHotelLine` index; wire `pricedQuoteItemId` / `pricingMatchAmbiguous` / `diagnostics`).
- Proxies: `/api/quotes/[id]/items/[itemId]/preview` + `.../apply-preview` (generic pass-through).

## 2. Flag-state inventory (verified read-only)

| Surface | PREVIEW | APPLY | Evidence |
|---|---|---|---|
| **Staging API** (Railway `dmc-platform-staging`) | `true` | `true` | SSH env read (real values) |
| **Prod API** (Railway `cheerful-enthusiasm` / `dmc-platform`) | `true` | `true` | SSH env read (real values) |
| **Staging admin-web** (Vercel `…-staging`) | ON | ON | **Runtime-confirmed**: DRAFT quote renders "Apply enabled" header |
| **Prod admin-web** (Vercel `dmc-platform-admin-web-4gu9`, repo-linked, git-main) | ON | ON | Keys present, modified 40–43d ago (= documented 2026-06-28 / 07-01 enablement); backend ON; CLI-pull artifact confirmed non-authoritative on staging |

Backend env flags: `QUOTE_PRICING_HOTEL_PREVIEW`, `QUOTE_PRICING_HOTEL_APPLY`.
Frontend build-time flags: `NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_PREVIEW`, `NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY`.

Notes:
- `NEXT_PUBLIC_*` are build-time client gates. `vercel env pull` returns them empty while correctly decrypting `NEXT_PUBLIC_API_URL` — a CLI quirk, disproven behaviorally on staging (a DRAFT quote's hotels-step header rendered **"Apply enabled"**, which requires both flags `=== 'true'`).

## 3. No active canonical flag drift

Preview + apply are ON across the API (staging + prod) and the canonical frontend (`-4gu9` + staging), consistent for admin/operations roles on editable-status quotes. **No active drift** between backend and the canonical prod/staging frontend.

## 4. Vestigial `dmc-platform-admin-web` Vercel project risk

A second Vercel project `dmc-platform-admin-web` (aliased `dmc-platform-admin-web.vercel.app`) is **vestigial** — only 2 `NEXT_PUBLIC` keys (`APP_URL`, `API_URL`), **none** of the 23 V2 feature flags. The canonical prod frontend is `dmc-platform-admin-web-4gu9` (root `.vercel/project.json`, git-main). Config-hygiene risk: if the prod domain were ever repointed to `dmc-platform-admin-web`, hotel apply (and every V2 flag) would silently disappear. Cleanup candidate — not live drift.

## 5. Working hotel apply cases today

All must hold: admin/operations role; status DRAFT/READY/REVISION_REQUESTED; both flags ON; **and** the row resolves to a single `pricedQuoteItemId`:
- `matchPricedHotelLine` returns a **unique** match — by `hotelId` (1 priced line), or `hotelId` + `roomCategoryId` narrowed to 1, or unique `name` fallback.
- Resolver finds a `hotelRate` for `contractId` + season + `roomCategoryId` + `occupancyType` + `mealPlan`.
- Δ0 applies directly; Δ≠0 → `confirmation_required` (409) then applies with `acknowledgedDelta`.
- Token / stale-preview guards + cost redaction active throughout.

## 6. Fallback-to-Classic cases

1. **Ambiguous match** → `pricedQuoteItemId = undefined`, `pricingMatchAmbiguous = true` → "Multiple priced hotel lines match this hotel… Resolve the duplicate in Classic Builder." (no preview/apply/View).
2. **No match** (`status: 'none'`) → undefined id → read-only "Why?" diagnostics: "No priced hotel line matched in V2 — managed in Classic Builder."
3. **On-request** (contract not linked) → diagnostics steer to Classic.
4. **Unresolvable pricing** ("Matching hotel rate not found" / missing contract/season/room/occupancy/mealPlan / inactive room category) → `pricingResolvable: false` → apply disabled.
5. **Non-editable status or non-admin/operations role** → gate closed.
6. **serviceId swap** (change underlying hotel service) → rejected, Classic-only.

## 7. Ambiguous-match root cause

The matcher keys are coarse: `hotelId → roomCategoryId → name`, and the priced-line index (`PricedHotelLine`) carries only `{ quoteItemId, hotelId, roomCategoryId, name, contractLinked, roomCategory, hasRate }`. Two priced hotel `QuoteItem`s that share the same `hotelId` with **no room discriminator** on the row (or identical `roomCategoryId`), or a duplicate `hotelNameSnapshot` with no `hotelId`, collide → declared ambiguous (the staging bb07/bb08 case). The fields that would actually disambiguate — `mealPlan`, `occupancyType`, `seasonName`, and the stay's **itinerary-day / date / order** position — are neither in the match key nor carried on the index. Split stays and same-hotel/different-configuration rows therefore fall to Classic unnecessarily.

## 8. Deterministic matching recommendation (no new pricing math)

Two layers, both **frontend adapter/matcher only**, reusing the existing preview/apply engine, token/stale guards, cost redaction, and role gates:

1. **Quote-item identity first.** Where the hotel option / itinerary row already references its priced `QuoteItem` (direct FK — `QuoteHotelOption`→quoteItem, or itinerary-day→item link), set `pricedQuoteItemId` **directly** and skip the heuristic entirely. This is the deterministic path and removes a whole class of ambiguity.
2. **Extra discriminators only as fallback.** When no direct link exists and `hotelId` collides, narrow in order:
   - `roomCategoryId`
   - `mealPlan`
   - `occupancyType`
   - `seasonName`
   - itinerary day / `serviceDate` / `serviceOrder`

   Declare `ambiguous` **only** when candidates are identical on *all* keys (a genuine duplicate). A missing discriminator on the index ⇒ stay ambiguous (fail-safe).

**Correctness note:** the apply token binds `{ quoteId, itemId, companyId, payloadHash }`, preventing cross-item / cross-company replay — but it **cannot** catch a *plausible-but-wrong* item id the adapter picks (a valid sibling). Determinism must therefore be enforced at match time, which is why identity-first matching (not merely more heuristics) is the primary recommendation.

## 9. Fields needed for deterministic matching

- **Primary:** a direct `quoteItemId` on the hotel row / option (from `QuoteHotelOption` or itinerary-day linkage).
- **Secondary discriminators on `PricedHotelLine` / `HotelRowKey`:** `roomCategoryId` (present), `mealPlan`, `occupancyType`, `seasonName`, and a positional key (`bookingDay` / itinerary day / `serviceDate` / `serviceOrder`).
- These already exist on the `QuoteItem` model (the resolver reads them). **Verify the quote GET payload serializes them per item;** if not, a *minimal read-only* include is required in the quote GET — a payload addition, **not** pricing math.

## 10. What remains Classic-only

Creating hotel items; swapping the underlying hotel service; editing contracts/rates/catalog data; on-request rows with no linked contract; unresolvable-rate rows; and genuine duplicates identical on every discriminator (keep the "resolve in Classic" fallback).

## 11. Redaction / privacy rules to preserve

- Cost redaction via `canActorViewCost` (admin / super_admin / finance) on preview / apply / stale / confirmation echoes **and** audit reads.
- Contract-summary drawer stays GET-only, curated, exact-role allowlist, no raw hotel/contract/rate/PII.
- Ambiguous rows keep no preview / apply / View button.
- New match fields (`roomCategoryId`, `mealPlan`, `occupancyType`, `seasonName`, day/order) are non-cost, non-PII — confirm none are cost-sensitive before surfacing (they are not).

## 12. Affected files (future implementation)

- `apps/admin-web/lib/quote-hotel-line-match.ts` — identity-first path + extra discriminators.
- `apps/admin-web/lib/quote-v2-adapter.ts` — enrich `PricedHotelLine` index (~L977-992), prefer direct quoteItem id, ambiguity wiring (~L1004-1105, L375-402).
- `apps/admin-web/lib/quote-types.ts` — `HotelSelection` / `PricedHotelLine` / `HotelRowKey` fields.
- `apps/admin-web/components/quote/v2/steps/hotels-step.tsx` — gating unchanged; copy only if needed.
- **Backend (read-only, only if needed):** quote GET include to surface `mealPlan` / `occupancyType` / `seasonName` / day per hotel `QuoteItem`. No pricing / engine change.
- Tests: `lib/quote-hotel-line-match.test.ts`, `app/quotes/[id]/builder-v2-hotel-apply-hardening.test.ts`, adapter tests (+ new identity-match test).

## 13. Test plan

- **Matcher units:** same `hotelId` + distinct `mealPlan` → resolves; + distinct `occupancyType` → resolves; + distinct `seasonName` → resolves; + distinct day/order → resolves; identical-on-all-keys → still `ambiguous`; direct quoteItem-id link → deterministic resolve.
- **Adapter:** option row with direct quoteItem id → `pricedQuoteItemId` set without heuristic; itinerary-fallback path preserved; ambiguous still yields undefined id + flag.
- **Regression:** existing preview / apply / hardening / diagnostics / contract-status / readiness / cost-redaction suites stay green.
- **Coverage gaps to close** (from the test inventory): no backend ambiguous-match test and no hotel-specific `rate_changed` test (both currently rely on the shared meal-path guard); all hotel FE tests are source-grep / pure-fn (no DOM flow test). Add at least the matcher/adapter units above; a DOM interaction test is optional.

## 14. Risks

- A stale / mismatched direct link could apply to the wrong item — mitigate by cross-checking identity discriminators and keeping the ambiguous fallback.
- Index missing a discriminator field → mis-narrowing; fail-safe to `ambiguous`.
- FE source-grep tests are fragile to string edits.
- If the quote GET doesn't already include the discriminator fields, a small read-only backend include is needed (payload only).
- Config-hygiene: the vestigial `dmc-platform-admin-web` Vercel project remains a silent-disable risk if the prod domain is ever repointed.

## 15. GO / NO-GO

**GO**
- FE-only deterministic hotel-row → priced-line matching (identity-first + extra discriminators), reusing the existing preview/apply engine, token/stale guards, cost redaction, and role gates.
- Optional minimal read-only quote-GET include for the discriminator fields (no pricing math).

**NO-GO**
- New pricing math / new resolver logic.
- Creating hotel items; editing contracts/rates/catalog.
- Changing flags or broadening prod exposure.
- Removing the Classic fallback for true duplicates / unresolved rows.
- Weakening cost redaction or role gates.
- Changing the Classic pricing path (system of record).

## 16. Exact next implementation slice

**Slice H-A — Deterministic hotel row matching via quote-item identity.** Frontend-only:
1. In the adapter, when a hotel option / itinerary row already links to its priced `QuoteItem`, set `pricedQuoteItemId` directly and bypass the heuristic.
2. Extend `matchPricedHotelLine` discriminators (`roomCategoryId → mealPlan → occupancyType → seasonName → day/order`) for the fallback, declaring `ambiguous` only on true all-key duplicates.
3. Keep ambiguous / on-request / no-match → Classic; flags, engine, guards, redaction, and controls unchanged. Ship behind the existing hotel flags with matcher + adapter unit tests.

Pre-req check: confirm the quote GET payload carries the discriminator fields per hotel item; if not, pair with a minimal read-only include.

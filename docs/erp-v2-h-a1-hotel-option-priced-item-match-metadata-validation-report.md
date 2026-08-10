# ERP V2 — H-A1: Hotel Option Priced-Item Match Metadata — Staging Fixture + Validation Report

**Status: PASS** · Controlled synthetic staging validation · No production access, no code, no PR implementation, no email/send. Classic remains the system of record.

## 1. Result

- A controlled **synthetic staging fixture** was created to provide a real `hotelOptions[]` payload (staging previously had 0 `QuoteHotelOption` records).
- H-A1 backend-computed metadata validated **live** for all three cases:
  - **matched**
  - **ambiguous**
  - **no-contract**
- No production access. No code changes during validation. No PR implementation during validation. No email/send.

## 2. Context

- PR #824 backend metadata is on `main` (merge commit `72e78514b2b5a19bbc1403adf4ae32afa1ab4ea6`).
- H-A1 adds backend-computed metadata to each `hotelOptions[]` entry in `loadQuoteState` / the quote GET.
- The frontend does **not** consume the fields yet.
- Preview/apply behavior is unchanged.
- Classic remains the system of record.

## 3. Staging targeting

- Project-ID-pinned Railway staging: `railway ssh -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -s dmc-platform -e production`.
- Production project `cheerful-enthusiasm` / `60d81051…` **not** targeted.
- Hard guard **passed** before any write:
  - `RAILWAY_PROJECT_NAME = dmc-platform-staging`
  - staging-only marker booking `BK-2026-0002` present
  - script ran in explicit **STAGING ONLY** mode
- All created records labeled: `UAT-STAGING-HA1-HOTEL-OPTION-MATCH — DO NOT SEND`.

## 4. Existing QA catalog reused (no catalog/hotel data created)

- `QA Test Hotel Amman` (`…bb03`)
- `QA Hotel Contract 2026` (`…bb04`)
- `Standard Room` (`…bb05`)

## 5. Records created

- **Quote:** `9c450350-1e6a-48d7-8ce1-ffb2b9703aca` — title `UAT-STAGING-HA1-HOTEL-OPTION-MATCH — DO NOT SEND`, status DRAFT, quoteNumber `null`.
- **Option A — matched:**
  - option `0c43875a-f6eb-47d7-9850-baf9a8b67521`
  - hotelOption `1e160323-7051-4dca-ac84-ec91d8209cd0`
  - item `3d2f2144-a64f-4699-a86c-b4363e10e12e`
- **Option B — ambiguous:**
  - option `917389b7-d435-43e8-8a84-ffa2bb61f6e4`
  - hotelOption `4b221bff-8cd6-4c3d-b268-5ede4644d958`
  - items `0eefbe74-de1e-4cd1-a1ef-dd8e0011179e`, `264527da-d783-4c6c-ac54-11785c20aa06`
- **Option C — no-contract:**
  - option `b3f34c05-a38d-4bfd-9ea1-8c6c92c230ca`
  - hotelOption `a367ab7e-9a8f-401d-ad07-383ea96ce121`
  - item `38bc79fb-5a81-4c18-801d-7c9305ba6a3f`

## 6. Matched case result (A)

- `pricingMatchStatus = matched`
- `pricingMatchReason = direct_option_item_match`
- `matchedPricedQuoteItemId = 3d2f2144-a64f-4699-a86c-b4363e10e12e`
- Matched item belongs to the **same quote**.
- Matched item belongs to the **same option set**.
- Matched item is a **hotel QuoteItem**.
- `matchedDiscriminators` present with safe keys only: `roomCategoryId`, `mealPlan`, `mealPlanCode`, `occupancyType`, `seasonName`, `serviceDate`, `optionId` (values: room `…bb05`, meal `HB`/`HB`, occupancy `DBL`, season `High`, serviceDate `2026-06-01`, optionId `0c43875a…`).

## 7. Ambiguous case result (B)

- Two identical hotel items in the same option set.
- `pricingMatchStatus = ambiguous`
- `pricingMatchReason = ambiguous_duplicate_candidates`
- `matchedPricedQuoteItemId = null`
- No `matchedDiscriminators`.
- Classic fallback preserved.

## 8. No-contract case result (C)

- Single matching item with `contractId = null`.
- `pricingMatchStatus = none`
- `pricingMatchReason = no_contract_linked`
- `matchedPricedQuoteItemId = null`
- No `matchedDiscriminators`.
- Classic fallback preserved.

## 9. Payload shape

- GET returned **HTTP 200**.
- Every `hotelOptions[]` entry includes `matchedPricedQuoteItemId`, `pricingMatchStatus`, `pricingMatchReason`.
- `matchedDiscriminators` appears **only when matched**.
- `pricingMatchStatus` values are only: `matched`, `ambiguous`, `none`.
- `pricingMatchReason` values are only sanctioned reason codes.
- `matchedPricedQuoteItemId` is a string only when matched, otherwise `null`.

## 10. Redaction / privacy

- `redactionLeaks = []`.
- Computed fields expose only safe match metadata.
- No cost. No margin. No supplier rates. No raw `HotelRate`. No raw `HotelContract`. No raw `Hotel` object. No PII. No internal notes.
- `matchedDiscriminators` contains only safe, non-cost / non-PII keys.
- Pre-existing hotel / roomCategory relations on the hotel option are unchanged and out of H-A1 scope.

## 11. No behavior change

- H-A1 only enriches the backend payload.
- Frontend does not consume the fields yet.
- Preview/apply buttons unchanged.
- Preview/apply routes unchanged.
- Resolver unchanged.
- `updateItem` / `recalculateQuoteTotals` unchanged.
- Classic pricing path unchanged.
- No hotel pricing/apply action performed.

## 12. Side-effect check

- Synthetic quote remains **DRAFT**.
- `acceptedVersionId = null`.
- versions `0`.
- bookings `0`.
- invoice `0`.
- No voucher. No voucher packet. No public link.
- No Accept. No invoice. No booking conversion. No hotel pricing/apply action. No email/send.

## 13. Cleanup / retention

- Fixture **retained** for future frontend Slice H-A validation.
- Clearly labeled `UAT-STAGING-HA1-HOTEL-OPTION-MATCH — DO NOT SEND`.
- No cleanup performed.
- IDs recorded in this doc for later cleanup.
- Future cleanup order: **items → hotelOptions → options → quote**.

## 14. Confirmations

- No production access.
- No email/send.
- No Accept.
- No invoice.
- No booking.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending disabled.
- Frontend H-A not started.
- No flags changed.
- No production touched.

## 15. GO / NO-GO

**GO**
- H-A1 backend metadata validated live on staging.
- Proceed to frontend H-A after this validation doc is merged.
- Reuse the retained fixture for frontend H-A validation.

**NO-GO**
- Deleting the fixture before frontend H-A validation.
- New pricing math.
- Hotel create/edit.
- Contract/rate/catalog edit.
- Removing the Classic fallback.
- Weakening cost redaction or role gates.
- Accept/invoice/booking.
- Staff rollout / live bookings.
- Supplier send / voucher-send.
- Full no-Classic launch.

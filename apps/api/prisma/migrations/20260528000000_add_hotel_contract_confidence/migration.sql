-- Hotel Contract Stabilization & Trustworthiness v2 — operator-driven
-- confidence rating. IMPORTED_UNVERIFIED is the default for new rows
-- and the seed for every existing row at migration time. Operators
-- progress contracts up through NEEDS_REVIEW / PRICING_INCOMPLETE /
-- SUPPLEMENT_REVIEW_REQUIRED / SEASON_CONFLICT and ultimately VERIFIED
-- as they correct mappings + supplements + seasons.

CREATE TYPE "HotelContractConfidence" AS ENUM (
  'IMPORTED_UNVERIFIED',
  'NEEDS_REVIEW',
  'PRICING_INCOMPLETE',
  'SUPPLEMENT_REVIEW_REQUIRED',
  'SEASON_CONFLICT',
  'VERIFIED'
);

ALTER TABLE "hotel_contracts"
  ADD COLUMN "confidence" "HotelContractConfidence" NOT NULL DEFAULT 'IMPORTED_UNVERIFIED',
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedBy" TEXT,
  ADD COLUMN "verificationNotes" TEXT;

-- Index supports the Correction Queue + Health Dashboard listings,
-- which filter by confidence aggressively.
CREATE INDEX "hotel_contracts_confidence_idx"
  ON "hotel_contracts"("confidence");

-- Preferred Hotel Ranking — operators flag preferred hotels so the
-- Guided Quote Builder surfaces them first within each commercial tier.
-- Lower value = more preferred (1 wins). NULL = unranked, falls back to
-- the existing VERIFIED → active-contract → alphabetical sort.

ALTER TABLE "hotels" ADD COLUMN "preferenceRank" INTEGER;

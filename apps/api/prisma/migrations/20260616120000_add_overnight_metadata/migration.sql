-- PR12B-2 — additive, nullable, metadata-only columns for driver-overnight / base-city support.
-- No backfill, no defaults, no NOT NULL, no FK. Nothing reads these until PR 12C (shadow).

-- AlterTable
ALTER TABLE "quote_itinerary_days" ADD COLUMN     "overnightCity" TEXT,
ADD COLUMN     "vehicleReturnsToBase" BOOLEAN;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "baseCity" TEXT;

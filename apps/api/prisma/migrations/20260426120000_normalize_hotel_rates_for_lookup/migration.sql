CREATE TYPE "HotelRatePricingBasis" AS ENUM ('PER_PERSON', 'PER_ROOM');

ALTER TABLE "hotel_rates"
ADD COLUMN "hotelId" UUID,
ADD COLUMN "seasonFrom" TIMESTAMP(3),
ADD COLUMN "seasonTo" TIMESTAMP(3),
ADD COLUMN "pricingBasis" "HotelRatePricingBasis" NOT NULL DEFAULT 'PER_ROOM';

UPDATE "hotel_rates" AS hr
SET
  "hotelId" = hc."hotelId",
  "seasonFrom" = COALESCE(hc."validFrom", CURRENT_TIMESTAMP),
  "seasonTo" = COALESCE(hc."validTo", CURRENT_TIMESTAMP)
FROM "hotel_contracts" AS hc
WHERE hr."contractId" = hc."id";

ALTER TABLE "hotel_rates"
ALTER COLUMN "hotelId" SET NOT NULL,
ALTER COLUMN "seasonFrom" SET NOT NULL,
ALTER COLUMN "seasonTo" SET NOT NULL;

ALTER TABLE "hotel_rates"
ADD CONSTRAINT "hotel_rates_hotelId_fkey"
FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "hotel_rates_hotelId_seasonFrom_seasonTo_occupancyType_mealPlan_idx"
ON "hotel_rates"("hotelId", "seasonFrom", "seasonTo", "occupancyType", "mealPlan");

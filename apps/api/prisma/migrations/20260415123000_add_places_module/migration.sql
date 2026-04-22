CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "places_isActive_name_idx" ON "places"("isActive", "name");

ALTER TABLE "vehicle_rates"
ADD COLUMN "fromPlaceId" UUID,
ADD COLUMN "toPlaceId" UUID;

CREATE INDEX "vehicle_rates_fromPlaceId_idx" ON "vehicle_rates"("fromPlaceId");
CREATE INDEX "vehicle_rates_toPlaceId_idx" ON "vehicle_rates"("toPlaceId");
CREATE INDEX "vehicle_rates_serviceTypeId_fromPlaceId_toPlaceId_minPax_maxPax_idx"
ON "vehicle_rates"("serviceTypeId", "fromPlaceId", "toPlaceId", "minPax", "maxPax");

ALTER TABLE "vehicle_rates"
ADD CONSTRAINT "vehicle_rates_fromPlaceId_fkey"
FOREIGN KEY ("fromPlaceId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicle_rates"
ADD CONSTRAINT "vehicle_rates_toPlaceId_fkey"
FOREIGN KEY ("toPlaceId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

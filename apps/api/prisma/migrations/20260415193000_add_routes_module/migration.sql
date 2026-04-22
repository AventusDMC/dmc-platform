CREATE TABLE "routes" (
  "id" UUID NOT NULL,
  "fromPlaceId" UUID NOT NULL,
  "toPlaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "routeType" TEXT,
  "durationMinutes" INTEGER,
  "distanceKm" DOUBLE PRECISION,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vehicle_rates"
ADD COLUMN "routeId" UUID;

CREATE INDEX "routes_fromPlaceId_idx" ON "routes"("fromPlaceId");
CREATE INDEX "routes_toPlaceId_idx" ON "routes"("toPlaceId");
CREATE INDEX "routes_isActive_name_idx" ON "routes"("isActive", "name");
CREATE INDEX "vehicle_rates_routeId_idx" ON "vehicle_rates"("routeId");
CREATE INDEX "vehicle_rates_serviceTypeId_routeId_minPax_maxPax_idx"
ON "vehicle_rates"("serviceTypeId", "routeId", "minPax", "maxPax");

ALTER TABLE "routes"
ADD CONSTRAINT "routes_fromPlaceId_fkey"
FOREIGN KEY ("fromPlaceId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "routes"
ADD CONSTRAINT "routes_toPlaceId_fkey"
FOREIGN KEY ("toPlaceId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_rates"
ADD CONSTRAINT "vehicle_rates_routeId_fkey"
FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

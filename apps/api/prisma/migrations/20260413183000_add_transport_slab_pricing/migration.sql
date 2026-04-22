ALTER TABLE "quote_items"
ADD COLUMN "appliedVehicleRateId" UUID,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "pricingDescription" TEXT;

UPDATE "quote_items" qi
SET "currency" = ss."currency"
FROM "supplier_services" ss
WHERE qi."serviceId" = ss."id";

ALTER TABLE "quote_items"
ALTER COLUMN "currency" DROP DEFAULT;

CREATE TABLE "vehicles" (
  "id" UUID NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "maxPax" INTEGER NOT NULL,
  "luggageCapacity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transport_service_types" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transport_service_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transport_service_types_code_key" ON "transport_service_types"("code");

CREATE TABLE "vehicle_rates" (
  "id" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "serviceTypeId" UUID NOT NULL,
  "routeName" TEXT NOT NULL,
  "minPax" INTEGER NOT NULL,
  "maxPax" INTEGER NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vehicle_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_rates_serviceTypeId_routeName_minPax_maxPax_idx"
ON "vehicle_rates"("serviceTypeId", "routeName", "minPax", "maxPax");

CREATE INDEX "vehicle_rates_vehicleId_idx" ON "vehicle_rates"("vehicleId");

ALTER TABLE "vehicle_rates"
ADD CONSTRAINT "vehicle_rates_vehicleId_fkey"
FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_rates"
ADD CONSTRAINT "vehicle_rates_serviceTypeId_fkey"
FOREIGN KEY ("serviceTypeId") REFERENCES "transport_service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quote_items"
ADD CONSTRAINT "quote_items_appliedVehicleRateId_fkey"
FOREIGN KEY ("appliedVehicleRateId") REFERENCES "vehicle_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

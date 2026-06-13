-- PR2 of the transport contract-regime refactor.
-- ADDITIVE and INERT: introduces the TransportContract grouping layer + nullable
-- contract links on the three rate tables. No existing column is altered; no data is
-- changed by this migration (backfill is run separately, idempotently, by id).
-- Fully reversible:
--   ALTER TABLE "vehicle_rates"            DROP COLUMN "transportContractId";
--   ALTER TABLE "transport_pricing_rules"  DROP COLUMN "transportContractId";
--   ALTER TABLE "touring_route_pricings"   DROP COLUMN "transportContractId";
--   DROP TABLE "transport_contracts";
--   DROP TYPE "TransportRateRegime"; DROP TYPE "MinimumDayPolicy"; DROP TYPE "DriverOvernightPolicy";

-- CreateEnum
CREATE TYPE "TransportRateRegime" AS ENUM ('ROUTE_TRANSFER', 'PACKAGE_MIN_FULL_DAY');

-- CreateEnum
CREATE TYPE "MinimumDayPolicy" AS ENUM ('INELIGIBLE_UNDER_MIN', 'CHARGE_MINIMUM_DAYS');

-- CreateEnum
CREATE TYPE "DriverOvernightPolicy" AS ENUM ('INCLUDED', 'SEPARATE', 'WAIVED', 'NONE');

-- AlterTable
ALTER TABLE "transport_pricing_rules" ADD COLUMN     "transportContractId" UUID;

-- AlterTable
ALTER TABLE "touring_route_pricings" ADD COLUMN     "transportContractId" UUID;

-- AlterTable
ALTER TABLE "vehicle_rates" ADD COLUMN     "transportContractId" UUID;

-- CreateTable
CREATE TABLE "transport_contracts" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "vehicle_class" TEXT NOT NULL,
    "regime" "TransportRateRegime" NOT NULL DEFAULT 'ROUTE_TRANSFER',
    "currency" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "minimumFullDays" INTEGER,
    "minimumDayPolicy" "MinimumDayPolicy" NOT NULL DEFAULT 'INELIGIBLE_UNDER_MIN',
    "fullDayRate" DOUBLE PRECISION,
    "halfDayRate" DOUBLE PRECISION,
    "airportTransferIncluded" BOOLEAN NOT NULL DEFAULT false,
    "pointToPointIncluded" BOOLEAN NOT NULL DEFAULT false,
    "baseCityOverride" TEXT,
    "halfDayCountsTowardMin" BOOLEAN NOT NULL DEFAULT false,
    "packageDayWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "twoHalfDaysEqualFullDay" BOOLEAN NOT NULL DEFAULT false,
    "halfDayChargedAsFullDay" BOOLEAN NOT NULL DEFAULT false,
    "halfDayIncludedInPackage" BOOLEAN NOT NULL DEFAULT false,
    "driverOvernightPolicy" "DriverOvernightPolicy" NOT NULL DEFAULT 'SEPARATE',
    "driverOvernightAmount" DOUBLE PRECISION,
    "stationaryChargedSeparately" BOOLEAN NOT NULL DEFAULT true,
    "stationaryIncludedInPackage" BOOLEAN NOT NULL DEFAULT false,
    "stationaryCountsTowardMinDays" BOOLEAN NOT NULL DEFAULT false,
    "driverOvernightOnStationary" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "transport_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transport_contracts_supplierId_idx" ON "transport_contracts"("supplierId");

-- CreateIndex
CREATE INDEX "transport_contracts_lookup_idx" ON "transport_contracts"("supplierId", "vehicle_class", "regime", "currency");

-- CreateIndex
CREATE INDEX "transport_pricing_rules_transportContractId_idx" ON "transport_pricing_rules"("transportContractId");

-- CreateIndex
CREATE INDEX "touring_route_pricings_transportContractId_idx" ON "touring_route_pricings"("transportContractId");

-- CreateIndex
CREATE INDEX "vehicle_rates_transportContractId_idx" ON "vehicle_rates"("transportContractId");

-- AddForeignKey
ALTER TABLE "transport_contracts" ADD CONSTRAINT "transport_contracts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_pricing_rules" ADD CONSTRAINT "transport_pricing_rules_transportContractId_fkey" FOREIGN KEY ("transportContractId") REFERENCES "transport_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "touring_route_pricings" ADD CONSTRAINT "touring_route_pricings_transportContractId_fkey" FOREIGN KEY ("transportContractId") REFERENCES "transport_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_rates" ADD CONSTRAINT "vehicle_rates_transportContractId_fkey" FOREIGN KEY ("transportContractId") REFERENCES "transport_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

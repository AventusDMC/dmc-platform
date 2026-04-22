-- CreateEnum
CREATE TYPE "BookingServiceStatus" AS ENUM ('pending', 'requested', 'confirmed');

-- CreateEnum
CREATE TYPE "TransportPricingMode" AS ENUM ('per_vehicle', 'capacity_unit');

-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "hotel_rates" ADD COLUMN     "seasonId" UUID;

-- AlterTable
ALTER TABLE "support_text_templates" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_pricing_rules" (
    "id" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "transportServiceTypeId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "pricingMode" "TransportPricingMode" NOT NULL,
    "minPax" INTEGER NOT NULL,
    "maxPax" INTEGER NOT NULL,
    "unitCapacity" INTEGER,
    "baseCost" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_services" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "sourceQuoteItemId" UUID,
    "serviceOrder" INTEGER NOT NULL DEFAULT 0,
    "serviceType" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "unitSell" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "totalSell" DOUBLE PRECISION NOT NULL,
    "supplierId" UUID,
    "supplierName" TEXT,
    "confirmationStatus" "BookingServiceStatus" NOT NULL DEFAULT 'pending',
    "confirmationNumber" TEXT,
    "confirmationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seasons_name_key" ON "seasons"("name");

-- CreateIndex
CREATE INDEX "transport_pricing_rules_routeId_idx" ON "transport_pricing_rules"("routeId");

-- CreateIndex
CREATE INDEX "transport_pricing_rules_transportServiceTypeId_idx" ON "transport_pricing_rules"("transportServiceTypeId");

-- CreateIndex
CREATE INDEX "transport_pricing_rules_vehicleId_idx" ON "transport_pricing_rules"("vehicleId");

-- CreateIndex
CREATE INDEX "transport_pricing_rules_isActive_routeId_transportServiceTy_idx" ON "transport_pricing_rules"("isActive", "routeId", "transportServiceTypeId", "minPax", "maxPax");

-- CreateIndex
CREATE INDEX "booking_services_bookingId_serviceOrder_idx" ON "booking_services"("bookingId", "serviceOrder");

-- CreateIndex
CREATE INDEX "booking_services_sourceQuoteItemId_idx" ON "booking_services"("sourceQuoteItemId");

-- CreateIndex
CREATE INDEX "booking_services_supplierId_idx" ON "booking_services"("supplierId");

-- CreateIndex
CREATE INDEX "hotel_rates_seasonId_idx" ON "hotel_rates"("seasonId");

-- AddForeignKey
ALTER TABLE "hotel_rates" ADD CONSTRAINT "hotel_rates_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_pricing_rules" ADD CONSTRAINT "transport_pricing_rules_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_pricing_rules" ADD CONSTRAINT "transport_pricing_rules_transportServiceTypeId_fkey" FOREIGN KEY ("transportServiceTypeId") REFERENCES "transport_service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_pricing_rules" ADD CONSTRAINT "transport_pricing_rules_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

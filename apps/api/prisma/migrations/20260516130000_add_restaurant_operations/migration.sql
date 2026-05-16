-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "cuisineType" TEXT,
    "capacity" INTEGER,
    "email" TEXT,
    "phone" TEXT,
    "mealTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "indoor" BOOLEAN NOT NULL DEFAULT true,
    "outdoor" BOOLEAN NOT NULL DEFAULT false,
    "halalSupport" BOOLEAN NOT NULL DEFAULT false,
    "vegetarianSupport" BOOLEAN NOT NULL DEFAULT false,
    "veganSupport" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "booking_services" ADD COLUMN "restaurantId" UUID,
ADD COLUMN "mealConfirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "mealTiming" TEXT,
ADD COLUMN "mealSeatingNotes" TEXT,
ADD COLUMN "mealDietaryRequirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "mealOperationalNotes" TEXT;

-- CreateIndex
CREATE INDEX "restaurants_active_name_idx" ON "restaurants"("active", "name");

-- CreateIndex
CREATE INDEX "restaurants_city_region_idx" ON "restaurants"("city", "region");

-- CreateIndex
CREATE INDEX "booking_services_restaurantId_idx" ON "booking_services"("restaurantId");

-- CreateIndex
CREATE INDEX "booking_services_operationType_mealConfirmationStatus_idx" ON "booking_services"("operationType", "mealConfirmationStatus");

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

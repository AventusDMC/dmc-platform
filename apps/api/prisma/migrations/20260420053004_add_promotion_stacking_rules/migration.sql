-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENTAGE_DISCOUNT', 'FIXED_DISCOUNT', 'STAY_PAY', 'FREE_NIGHT');

-- CreateEnum
CREATE TYPE "PromotionCombinabilityMode" AS ENUM ('EXCLUSIVE', 'COMBINABLE', 'BEST_OF_GROUP');

-- AlterTable
ALTER TABLE "booking_passengers" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "booking_rooming_entries" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "hotel_allotments" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" DOUBLE PRECISION,
    "stayPayNights" INTEGER,
    "payNights" INTEGER,
    "freeNightCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "combinabilityMode" "PromotionCombinabilityMode" NOT NULL DEFAULT 'EXCLUSIVE',
    "promotionGroup" TEXT,
    "combinable" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_rules" (
    "id" UUID NOT NULL,
    "promotionId" UUID NOT NULL,
    "roomCategoryId" UUID,
    "travelDateFrom" TIMESTAMP(3),
    "travelDateTo" TIMESTAMP(3),
    "bookingDateFrom" TIMESTAMP(3),
    "bookingDateTo" TIMESTAMP(3),
    "boardBasis" "HotelMealPlan",
    "minStay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotions_hotelContractId_isActive_priority_idx" ON "promotions"("hotelContractId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "promotion_rules_promotionId_isActive_idx" ON "promotion_rules"("promotionId", "isActive");

-- CreateIndex
CREATE INDEX "promotion_rules_roomCategoryId_idx" ON "promotion_rules"("roomCategoryId");

-- CreateIndex
CREATE INDEX "promotion_rules_travelDateFrom_travelDateTo_idx" ON "promotion_rules"("travelDateFrom", "travelDateTo");

-- CreateIndex
CREATE INDEX "promotion_rules_bookingDateFrom_bookingDateTo_idx" ON "promotion_rules"("bookingDateFrom", "bookingDateTo");

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_rules" ADD CONSTRAINT "promotion_rules_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_rules" ADD CONSTRAINT "promotion_rules_roomCategoryId_fkey" FOREIGN KEY ("roomCategoryId") REFERENCES "hotel_room_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "booking_rooming_assignments_bookingRoomingEntryId_bookingPassen" RENAME TO "booking_rooming_assignments_bookingRoomingEntryId_bookingPa_key";

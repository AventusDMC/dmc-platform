-- CreateEnum
CREATE TYPE "HotelOccupancyType" AS ENUM ('SGL', 'DBL', 'TPL');

-- CreateTable
CREATE TABLE "hotel_room_categories" (
    "id" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_room_categories_pkey" PRIMARY KEY ("id")
);

-- Seed one default room category per hotel so existing rates and quote items can be migrated.
INSERT INTO "hotel_room_categories" ("id", "hotelId", "name", "code", "description", "isActive", "createdAt", "updatedAt")
SELECT
    (
      substr(md5("id"::text || '-standard-room-category'), 1, 8) || '-' ||
      substr(md5("id"::text || '-standard-room-category'), 9, 4) || '-' ||
      substr(md5("id"::text || '-standard-room-category'), 13, 4) || '-' ||
      substr(md5("id"::text || '-standard-room-category'), 17, 4) || '-' ||
      substr(md5("id"::text || '-standard-room-category'), 21, 12)
    )::uuid,
    "id",
    'Standard',
    'STD',
    'Migrated default room category',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "hotels";

-- AlterTable
ALTER TABLE "hotel_rates"
ADD COLUMN "roomCategoryId" UUID,
ADD COLUMN "occupancyType" "HotelOccupancyType",
ADD COLUMN "currency" TEXT,
ADD COLUMN "cost" DOUBLE PRECISION;

UPDATE "hotel_rates" hr
SET
  "roomCategoryId" = hrc."id",
  "occupancyType" = hr."roomType"::text::"HotelOccupancyType",
  "currency" = hc."currency",
  "cost" = hr."rate"
FROM "hotel_contracts" hc
JOIN "hotel_room_categories" hrc ON hrc."hotelId" = hc."hotelId" AND hrc."code" = 'STD'
WHERE hc."id" = hr."contractId";

ALTER TABLE "hotel_rates"
ALTER COLUMN "roomCategoryId" SET NOT NULL,
ALTER COLUMN "occupancyType" SET NOT NULL,
ALTER COLUMN "currency" SET NOT NULL,
ALTER COLUMN "cost" SET NOT NULL;

ALTER TABLE "hotel_rates" DROP COLUMN "roomType";
ALTER TABLE "hotel_rates" DROP COLUMN "rate";

-- AlterTable
ALTER TABLE "quote_items"
ADD COLUMN "roomCategoryId" UUID,
ADD COLUMN "occupancyType" "HotelOccupancyType";

UPDATE "quote_items" qi
SET
  "roomCategoryId" = hrc."id",
  "occupancyType" = qi."roomType"::text::"HotelOccupancyType"
FROM "hotel_contracts" hc
JOIN "hotel_room_categories" hrc ON hrc."hotelId" = hc."hotelId" AND hrc."code" = 'STD'
WHERE hc."id" = qi."contractId"
  AND qi."contractId" IS NOT NULL
  AND qi."roomType" IS NOT NULL;

ALTER TABLE "quote_items" DROP COLUMN "roomType";

-- CreateIndex
CREATE INDEX "hotel_room_categories_hotelId_idx" ON "hotel_room_categories"("hotelId");

-- CreateIndex
CREATE INDEX "hotel_rates_roomCategoryId_idx" ON "hotel_rates"("roomCategoryId");

-- CreateIndex
CREATE INDEX "quote_items_roomCategoryId_idx" ON "quote_items"("roomCategoryId");

-- AddForeignKey
ALTER TABLE "hotel_room_categories" ADD CONSTRAINT "hotel_room_categories_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_rates" ADD CONSTRAINT "hotel_rates_roomCategoryId_fkey" FOREIGN KEY ("roomCategoryId") REFERENCES "hotel_room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_roomCategoryId_fkey" FOREIGN KEY ("roomCategoryId") REFERENCES "hotel_room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropEnum
DROP TYPE "HotelRoomType";

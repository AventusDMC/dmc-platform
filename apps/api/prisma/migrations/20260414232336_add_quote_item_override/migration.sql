-- DropForeignKey
ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_roomCategoryId_fkey";

-- DropIndex
DROP INDEX "itineraries_quoteId_dayNumber_idx";

-- DropIndex
DROP INDEX "quote_items_itineraryId_idx";

-- DropIndex
DROP INDEX "quotes_acceptedVersionId_idx";

-- AlterTable
ALTER TABLE "itineraries" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_roomCategoryId_fkey" FOREIGN KEY ("roomCategoryId") REFERENCES "hotel_room_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

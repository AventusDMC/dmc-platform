ALTER TABLE "quote_items"
ADD COLUMN "hotelId" UUID,
ADD COLUMN "contractId" UUID,
ADD COLUMN "seasonName" TEXT,
ADD COLUMN "roomType" "HotelRoomType",
ADD COLUMN "mealPlan" "HotelMealPlan";

CREATE INDEX "quote_items_hotelId_idx" ON "quote_items"("hotelId");
CREATE INDEX "quote_items_contractId_idx" ON "quote_items"("contractId");

ALTER TABLE "quote_items"
ADD CONSTRAINT "quote_items_hotelId_fkey"
FOREIGN KEY ("hotelId") REFERENCES "hotels"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "quote_items"
ADD CONSTRAINT "quote_items_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "hotel_contracts"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

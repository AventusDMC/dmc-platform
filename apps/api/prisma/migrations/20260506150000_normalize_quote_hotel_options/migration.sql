ALTER TABLE "quote_hotel_options"
ADD COLUMN "roomCategoryId" UUID,
ADD COLUMN "mealPlanCode" "HotelMealPlan";

CREATE INDEX "quote_hotel_options_roomCategoryId_idx"
ON "quote_hotel_options"("roomCategoryId");

ALTER TABLE "quote_hotel_options"
ADD CONSTRAINT "quote_hotel_options_roomCategoryId_fkey"
FOREIGN KEY ("roomCategoryId")
REFERENCES "hotel_room_categories"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE TABLE "quote_hotel_options" (
    "id" UUID NOT NULL,
    "quoteOptionId" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "hotelId" UUID,
    "hotelNameSnapshot" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "nights" INTEGER NOT NULL DEFAULT 1,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_hotel_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_hotel_options_hotelId_idx" ON "quote_hotel_options"("hotelId");
CREATE INDEX "quote_hotel_options_quoteOptionId_city_idx" ON "quote_hotel_options"("quoteOptionId", "city");

ALTER TABLE "quote_hotel_options"
  ADD CONSTRAINT "quote_hotel_options_hotelId_fkey"
  FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_hotel_options"
  ADD CONSTRAINT "quote_hotel_options_quoteOptionId_fkey"
  FOREIGN KEY ("quoteOptionId") REFERENCES "quote_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

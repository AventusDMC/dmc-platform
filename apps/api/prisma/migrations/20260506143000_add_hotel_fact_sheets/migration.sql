CREATE TABLE "hotel_fact_sheets" (
    "id" UUID NOT NULL,
    "hotelId" UUID NOT NULL,
    "shortDescription" TEXT,
    "highlightsJson" JSONB,
    "amenitiesJson" JSONB,
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "imageGalleryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_fact_sheets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hotel_fact_sheets_hotelId_key" ON "hotel_fact_sheets"("hotelId");
CREATE INDEX "hotel_fact_sheets_hotelId_idx" ON "hotel_fact_sheets"("hotelId");

ALTER TABLE "hotel_fact_sheets"
  ADD CONSTRAINT "hotel_fact_sheets_hotelId_fkey"
  FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

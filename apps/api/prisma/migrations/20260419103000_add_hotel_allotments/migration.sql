CREATE TABLE "hotel_allotments" (
  "id" UUID NOT NULL,
  "hotelContractId" UUID NOT NULL,
  "roomCategoryId" UUID NOT NULL,
  "dateFrom" TIMESTAMP(3) NOT NULL,
  "dateTo" TIMESTAMP(3) NOT NULL,
  "allotment" INTEGER NOT NULL,
  "releaseDays" INTEGER NOT NULL DEFAULT 0,
  "stopSale" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hotel_allotments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hotel_allotments_hotelContractId_dateFrom_dateTo_idx"
ON "hotel_allotments"("hotelContractId", "dateFrom", "dateTo");

CREATE INDEX "hotel_allotments_roomCategoryId_dateFrom_dateTo_idx"
ON "hotel_allotments"("roomCategoryId", "dateFrom", "dateTo");

CREATE INDEX "hotel_allotments_isActive_dateFrom_dateTo_idx"
ON "hotel_allotments"("isActive", "dateFrom", "dateTo");

ALTER TABLE "hotel_allotments"
ADD CONSTRAINT "hotel_allotments_hotelContractId_fkey"
FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hotel_allotments"
ADD CONSTRAINT "hotel_allotments_roomCategoryId_fkey"
FOREIGN KEY ("roomCategoryId") REFERENCES "hotel_room_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

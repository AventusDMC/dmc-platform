CREATE TABLE "rooming_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "quoteId" UUID NOT NULL,
  "itineraryDayId" UUID NOT NULL,
  "hotelQuoteItemId" UUID NOT NULL,
  "roomType" TEXT,
  "occupancyType" "BookingRoomOccupancy" NOT NULL DEFAULT 'unknown',
  "notes" TEXT,
  "temporaryRoomLabel" TEXT,
  "guideRoom" BOOLEAN NOT NULL DEFAULT false,
  "leaderRoom" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rooming_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rooming_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "roomingGroupId" UUID NOT NULL,
  "quotePassengerId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rooming_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rooming_groups_quoteId_itineraryDayId_hotelQuoteItemId_sortOrder_idx"
ON "rooming_groups"("quoteId", "itineraryDayId", "hotelQuoteItemId", "sortOrder");

CREATE INDEX "rooming_groups_hotelQuoteItemId_idx"
ON "rooming_groups"("hotelQuoteItemId");

CREATE UNIQUE INDEX "rooming_assignments_roomingGroupId_quotePassengerId_key"
ON "rooming_assignments"("roomingGroupId", "quotePassengerId");

CREATE INDEX "rooming_assignments_quotePassengerId_idx"
ON "rooming_assignments"("quotePassengerId");

ALTER TABLE "rooming_groups"
ADD CONSTRAINT "rooming_groups_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rooming_groups"
ADD CONSTRAINT "rooming_groups_itineraryDayId_fkey"
FOREIGN KEY ("itineraryDayId") REFERENCES "quote_itinerary_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rooming_groups"
ADD CONSTRAINT "rooming_groups_hotelQuoteItemId_fkey"
FOREIGN KEY ("hotelQuoteItemId") REFERENCES "quote_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rooming_assignments"
ADD CONSTRAINT "rooming_assignments_roomingGroupId_fkey"
FOREIGN KEY ("roomingGroupId") REFERENCES "rooming_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rooming_assignments"
ADD CONSTRAINT "rooming_assignments_quotePassengerId_fkey"
FOREIGN KEY ("quotePassengerId") REFERENCES "quote_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

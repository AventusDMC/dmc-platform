-- Phase 3B.1 — ordered Point-of-Interest assignments per quote itinerary day.
-- Additive only: one new table + its indexes + foreign keys. No changes to
-- existing tables, no data backfill. Proposal rendering does not read these
-- rows yet (the per-locale composer arrives in Phase 3B.2).

-- CreateTable
CREATE TABLE "quote_itinerary_day_pois" (
    "id" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "poiId" UUID,
    "sourceTouringRouteStopId" UUID,
    "fallbackTitle" TEXT,
    "fallbackCity" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_itinerary_day_pois_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_itinerary_day_pois_dayId_sortOrder_idx" ON "quote_itinerary_day_pois"("dayId", "sortOrder");

-- CreateIndex
CREATE INDEX "quote_itinerary_day_pois_poiId_idx" ON "quote_itinerary_day_pois"("poiId");

-- CreateIndex
CREATE INDEX "quote_itinerary_day_pois_sourceTouringRouteStopId_idx" ON "quote_itinerary_day_pois"("sourceTouringRouteStopId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_itinerary_day_pois_dayId_sortOrder_key" ON "quote_itinerary_day_pois"("dayId", "sortOrder");

-- AddForeignKey
ALTER TABLE "quote_itinerary_day_pois" ADD CONSTRAINT "quote_itinerary_day_pois_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "quote_itinerary_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_itinerary_day_pois" ADD CONSTRAINT "quote_itinerary_day_pois_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "points_of_interest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_itinerary_day_pois" ADD CONSTRAINT "quote_itinerary_day_pois_sourceTouringRouteStopId_fkey" FOREIGN KEY ("sourceTouringRouteStopId") REFERENCES "touring_route_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

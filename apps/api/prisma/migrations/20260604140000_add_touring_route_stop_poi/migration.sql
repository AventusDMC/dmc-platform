-- AlterTable
ALTER TABLE "touring_route_stops" ADD COLUMN     "poiId" UUID;

-- CreateIndex
CREATE INDEX "touring_route_stops_poiId_idx" ON "touring_route_stops"("poiId");

-- AddForeignKey
ALTER TABLE "touring_route_stops" ADD CONSTRAINT "touring_route_stops_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "points_of_interest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

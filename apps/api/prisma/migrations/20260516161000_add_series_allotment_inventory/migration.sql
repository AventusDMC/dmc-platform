ALTER TABLE "series_departures" ADD COLUMN "reservedSeats" INTEGER;
ALTER TABLE "series_departures" ADD COLUMN "stopSaleThreshold" INTEGER;
ALTER TABLE "series_departures" ADD COLUMN "hotelAllotmentsJson" JSONB;
ALTER TABLE "series_departures" ADD COLUMN "sharedInventoryJson" JSONB;

CREATE INDEX "series_departures_stopSaleThreshold_idx" ON "series_departures"("stopSaleThreshold");

ALTER TABLE "series_departures" ADD COLUMN "totalCapacity" INTEGER;
ALTER TABLE "series_departures" ADD COLUMN "guaranteedMinimumPax" INTEGER;
ALTER TABLE "series_departures" ADD COLUMN "sharedCoachCapacity" INTEGER;

CREATE INDEX "series_departures_totalCapacity_idx" ON "series_departures"("totalCapacity");
CREATE INDEX "series_departures_guaranteedMinimumPax_idx" ON "series_departures"("guaranteedMinimumPax");

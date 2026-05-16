CREATE TABLE "series" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "seriesCode" TEXT NOT NULL,
  "seriesName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "recurringSchedule" TEXT,
  "destinationCountry" TEXT,
  "operationalNotes" TEXT,
  "packageTemplateId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "series_departures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "seriesId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "departureCode" TEXT,
  "departureDate" TIMESTAMP(3),
  "paxCount" INTEGER NOT NULL DEFAULT 0,
  "lowOccupancyThreshold" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "operationalNotes" TEXT,
  "templateSnapshotJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "series_departures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "series_seriesCode_key" ON "series"("seriesCode");
CREATE INDEX "series_active_seriesName_idx" ON "series"("active", "seriesName");
CREATE INDEX "series_destinationCountry_idx" ON "series"("destinationCountry");
CREATE INDEX "series_packageTemplateId_idx" ON "series"("packageTemplateId");
CREATE UNIQUE INDEX "series_departures_bookingId_key" ON "series_departures"("bookingId");
CREATE INDEX "series_departures_seriesId_departureDate_idx" ON "series_departures"("seriesId", "departureDate");
CREATE INDEX "series_departures_departureDate_idx" ON "series_departures"("departureDate");
CREATE INDEX "series_departures_status_idx" ON "series_departures"("status");

ALTER TABLE "series"
  ADD CONSTRAINT "series_packageTemplateId_fkey"
  FOREIGN KEY ("packageTemplateId") REFERENCES "package_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "series_departures"
  ADD CONSTRAINT "series_departures_seriesId_fkey"
  FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "series_departures"
  ADD CONSTRAINT "series_departures_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

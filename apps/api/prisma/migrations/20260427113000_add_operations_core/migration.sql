ALTER TABLE "bookings"
  ADD COLUMN "clientCompanyId" UUID,
  ADD COLUMN "pax" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "endDate" TIMESTAMP(3);

UPDATE "bookings" b
SET
  "clientCompanyId" = q."clientCompanyId",
  "pax" = COALESCE(b."adults", 0) + COALESCE(b."children", 0),
  "startDate" = NULLIF(b."snapshotJson"->>'travelStartDate', '')::timestamp,
  "endDate" = CASE
    WHEN NULLIF(b."snapshotJson"->>'travelStartDate', '') IS NULL THEN NULL
    ELSE (NULLIF(b."snapshotJson"->>'travelStartDate', '')::timestamp + (COALESCE(b."nightCount", 0) || ' days')::interval)
  END
FROM "quotes" q
WHERE b."quoteId" = q."id";

CREATE TYPE "BookingDayStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DONE');

CREATE TABLE "booking_days" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "dayNumber" INTEGER NOT NULL,
  "date" TIMESTAMP(3),
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "status" "BookingDayStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "booking_days_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "booking_days"
  ADD CONSTRAINT "booking_days_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "booking_days_bookingId_dayNumber_key" ON "booking_days"("bookingId", "dayNumber");
CREATE INDEX "booking_days_bookingId_date_idx" ON "booking_days"("bookingId", "date");
CREATE INDEX "booking_days_status_idx" ON "booking_days"("status");

ALTER TABLE "booking_passengers"
  ADD COLUMN "fullName" TEXT,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "passportNumber" TEXT,
  ADD COLUMN "passportIssueDate" TIMESTAMP(3),
  ADD COLUMN "passportExpiryDate" TIMESTAMP(3),
  ADD COLUMN "arrivalFlight" TEXT,
  ADD COLUMN "departureFlight" TEXT,
  ADD COLUMN "entryPoint" TEXT,
  ADD COLUMN "visaStatus" TEXT,
  ADD COLUMN "roomingNotes" TEXT;

UPDATE "booking_passengers"
SET "fullName" = trim(concat_ws(' ', NULLIF("firstName", ''), NULLIF("lastName", '')))
WHERE "fullName" IS NULL;

CREATE INDEX "bookings_clientCompanyId_idx" ON "bookings"("clientCompanyId");
CREATE INDEX "bookings_startDate_idx" ON "bookings"("startDate");

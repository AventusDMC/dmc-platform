-- Railway production recovery for:
--   20260427113000_add_operations_core
--   20260427121000_add_booking_service_assignment_layer
--
-- This script is intentionally idempotent:
-- - creates missing enums/tables only when absent
-- - adds missing columns only when absent
-- - adds missing constraints/indexes only when absent
-- - backfills data without deleting rows
--
-- Run against the Railway PostgreSQL database before resolving/deploying Prisma
-- migrations. Do not run prisma migrate reset in production.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public."bookings"') IS NULL THEN
    RAISE EXCEPTION 'Required table public.bookings is missing. Stop and restore/apply the earlier booking migrations before continuing.';
  END IF;

  IF to_regclass('public."booking_services"') IS NULL THEN
    RAISE EXCEPTION 'Required table public.booking_services is missing. Stop and restore/apply the earlier booking service migrations before continuing.';
  END IF;

  IF to_regclass('public."quotes"') IS NULL THEN
    RAISE EXCEPTION 'Required table public.quotes is missing. Stop and restore/apply the earlier quote migrations before continuing.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingDayStatus') THEN
    CREATE TYPE "BookingDayStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DONE');
  END IF;
END $$;

ALTER TYPE "BookingDayStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "BookingDayStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "BookingDayStatus" ADD VALUE IF NOT EXISTS 'DONE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingOperationServiceType') THEN
    CREATE TYPE "BookingOperationServiceType" AS ENUM ('TRANSPORT', 'GUIDE', 'HOTEL', 'ACTIVITY', 'EXTERNAL_PACKAGE');
  END IF;
END $$;

ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'TRANSPORT';
ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'GUIDE';
ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'HOTEL';
ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'ACTIVITY';
ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'EXTERNAL_PACKAGE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingOperationServiceStatus') THEN
    CREATE TYPE "BookingOperationServiceStatus" AS ENUM ('PENDING', 'REQUESTED', 'CONFIRMED', 'DONE');
  END IF;
END $$;

ALTER TYPE "BookingOperationServiceStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "BookingOperationServiceStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE "BookingOperationServiceStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "BookingOperationServiceStatus" ADD VALUE IF NOT EXISTS 'DONE';

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "clientCompanyId" UUID,
  ADD COLUMN IF NOT EXISTS "pax" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);

UPDATE "bookings" b
SET
  "clientCompanyId" = COALESCE(b."clientCompanyId", q."clientCompanyId"),
  "pax" = CASE
    WHEN COALESCE(b."pax", 0) = 0 THEN COALESCE(b."adults", 0) + COALESCE(b."children", 0)
    ELSE b."pax"
  END,
  "startDate" = COALESCE(
    b."startDate",
    CASE
      WHEN NULLIF(b."snapshotJson"->>'travelStartDate', '') IS NULL THEN NULL
      ELSE NULLIF(b."snapshotJson"->>'travelStartDate', '')::timestamp
    END
  ),
  "endDate" = COALESCE(
    b."endDate",
    CASE
      WHEN NULLIF(b."snapshotJson"->>'travelStartDate', '') IS NULL THEN NULL
      ELSE (NULLIF(b."snapshotJson"->>'travelStartDate', '')::timestamp + (COALESCE(b."nightCount", 0) || ' days')::interval)
    END
  )
FROM "quotes" q
WHERE b."quoteId" = q."id";

CREATE TABLE IF NOT EXISTS "booking_days" (
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_days_bookingId_fkey'
  ) THEN
    ALTER TABLE "booking_days"
      ADD CONSTRAINT "booking_days_bookingId_fkey"
      FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "booking_days_bookingId_dayNumber_key" ON "booking_days"("bookingId", "dayNumber");
CREATE INDEX IF NOT EXISTS "booking_days_bookingId_date_idx" ON "booking_days"("bookingId", "date");
CREATE INDEX IF NOT EXISTS "booking_days_status_idx" ON "booking_days"("status");
CREATE INDEX IF NOT EXISTS "bookings_clientCompanyId_idx" ON "bookings"("clientCompanyId");
CREATE INDEX IF NOT EXISTS "bookings_startDate_idx" ON "bookings"("startDate");

CREATE TABLE IF NOT EXISTS "booking_passengers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "fullName" TEXT,
  "firstName" TEXT NOT NULL DEFAULT '',
  "lastName" TEXT NOT NULL DEFAULT '',
  "title" TEXT,
  "gender" TEXT,
  "dateOfBirth" TIMESTAMP(3),
  "nationality" TEXT,
  "passportNumber" TEXT,
  "passportIssueDate" TIMESTAMP(3),
  "passportExpiryDate" TIMESTAMP(3),
  "arrivalFlight" TEXT,
  "departureFlight" TEXT,
  "entryPoint" TEXT,
  "visaStatus" TEXT,
  "roomingNotes" TEXT,
  "isLead" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "booking_passengers_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_passengers_bookingId_fkey'
  ) THEN
    ALTER TABLE "booking_passengers"
      ADD CONSTRAINT "booking_passengers_bookingId_fkey"
      FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "booking_passengers"
  ADD COLUMN IF NOT EXISTS "fullName" TEXT,
  ADD COLUMN IF NOT EXISTS "gender" TEXT,
  ADD COLUMN IF NOT EXISTS "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nationality" TEXT,
  ADD COLUMN IF NOT EXISTS "passportNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "passportIssueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passportExpiryDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "arrivalFlight" TEXT,
  ADD COLUMN IF NOT EXISTS "departureFlight" TEXT,
  ADD COLUMN IF NOT EXISTS "entryPoint" TEXT,
  ADD COLUMN IF NOT EXISTS "visaStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "roomingNotes" TEXT;

UPDATE "booking_passengers"
SET "fullName" = trim(concat_ws(' ', NULLIF("firstName", ''), NULLIF("lastName", '')))
WHERE "fullName" IS NULL;

CREATE INDEX IF NOT EXISTS "booking_passengers_bookingId_isLead_idx" ON "booking_passengers"("bookingId", "isLead");

ALTER TABLE "booking_services"
  ADD COLUMN IF NOT EXISTS "bookingDayId" UUID,
  ADD COLUMN IF NOT EXISTS "operationType" "BookingOperationServiceType",
  ADD COLUMN IF NOT EXISTS "operationStatus" "BookingOperationServiceStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "referenceId" UUID,
  ADD COLUMN IF NOT EXISTS "assignedTo" TEXT,
  ADD COLUMN IF NOT EXISTS "guidePhone" TEXT,
  ADD COLUMN IF NOT EXISTS "vehicleId" UUID;

ALTER TABLE "booking_services"
  ALTER COLUMN "operationStatus" SET DEFAULT 'PENDING';

UPDATE "booking_services"
SET "operationStatus" = 'PENDING'::"BookingOperationServiceStatus"
WHERE "operationStatus" IS NULL;

ALTER TABLE "booking_services"
  ALTER COLUMN "operationStatus" SET NOT NULL;

UPDATE "booking_services"
SET
  "operationType" = CASE
    WHEN lower(COALESCE("serviceType", '')) LIKE '%transport%' OR lower(COALESCE("serviceType", '')) LIKE '%transfer%' OR lower(COALESCE("serviceType", '')) LIKE '%vehicle%' THEN 'TRANSPORT'::"BookingOperationServiceType"
    WHEN lower(COALESCE("serviceType", '')) LIKE '%guide%' OR lower(COALESCE("serviceType", '')) LIKE '%escort%' THEN 'GUIDE'::"BookingOperationServiceType"
    WHEN lower(COALESCE("serviceType", '')) LIKE '%hotel%' OR lower(COALESCE("serviceType", '')) LIKE '%accommodation%' THEN 'HOTEL'::"BookingOperationServiceType"
    WHEN lower(COALESCE("serviceType", '')) LIKE '%external%' OR lower(COALESCE("serviceType", '')) LIKE '%package%' THEN 'EXTERNAL_PACKAGE'::"BookingOperationServiceType"
    ELSE 'ACTIVITY'::"BookingOperationServiceType"
  END
WHERE "operationType" IS NULL;

UPDATE "booking_services"
SET "operationStatus" = CASE
    WHEN "status" = 'confirmed' THEN 'CONFIRMED'::"BookingOperationServiceStatus"
    WHEN "status" = 'in_progress' THEN 'REQUESTED'::"BookingOperationServiceStatus"
    WHEN "status" = 'ready' THEN 'PENDING'::"BookingOperationServiceStatus"
    ELSE "operationStatus"
  END
WHERE "operationStatus" = 'PENDING'::"BookingOperationServiceStatus";

UPDATE "booking_services" service
SET "bookingDayId" = day.id
FROM "booking_days" day
WHERE service."bookingDayId" IS NULL
  AND day."bookingId" = service."bookingId"
  AND service."serviceDate" IS NOT NULL
  AND day.date IS NOT NULL
  AND day.date::date = service."serviceDate"::date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_services_bookingDayId_fkey'
  ) THEN
    ALTER TABLE "booking_services"
      ADD CONSTRAINT "booking_services_bookingDayId_fkey"
      FOREIGN KEY ("bookingDayId") REFERENCES "booking_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."vehicles"') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'booking_services_vehicleId_fkey'
    ) THEN
    ALTER TABLE "booking_services"
      ADD CONSTRAINT "booking_services_vehicleId_fkey"
      FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "booking_services_bookingDayId_idx" ON "booking_services"("bookingDayId");
CREATE INDEX IF NOT EXISTS "booking_services_vehicleId_idx" ON "booking_services"("vehicleId");
CREATE INDEX IF NOT EXISTS "booking_services_operationType_operationStatus_idx" ON "booking_services"("operationType", "operationStatus");

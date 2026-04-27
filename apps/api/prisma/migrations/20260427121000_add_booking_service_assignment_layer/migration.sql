CREATE TYPE "BookingOperationServiceType" AS ENUM ('TRANSPORT', 'GUIDE', 'HOTEL', 'ACTIVITY', 'EXTERNAL_PACKAGE');
CREATE TYPE "BookingOperationServiceStatus" AS ENUM ('PENDING', 'REQUESTED', 'CONFIRMED', 'DONE');

ALTER TABLE "booking_services"
  ADD COLUMN "bookingDayId" UUID,
  ADD COLUMN "operationType" "BookingOperationServiceType",
  ADD COLUMN "operationStatus" "BookingOperationServiceStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "referenceId" UUID,
  ADD COLUMN "assignedTo" TEXT,
  ADD COLUMN "guidePhone" TEXT,
  ADD COLUMN "vehicleId" UUID;

UPDATE "booking_services"
SET
  "operationType" = CASE
    WHEN lower("serviceType") LIKE '%transport%' OR lower("serviceType") LIKE '%transfer%' OR lower("serviceType") LIKE '%vehicle%' THEN 'TRANSPORT'::"BookingOperationServiceType"
    WHEN lower("serviceType") LIKE '%guide%' OR lower("serviceType") LIKE '%escort%' THEN 'GUIDE'::"BookingOperationServiceType"
    WHEN lower("serviceType") LIKE '%hotel%' OR lower("serviceType") LIKE '%accommodation%' THEN 'HOTEL'::"BookingOperationServiceType"
    WHEN lower("serviceType") LIKE '%external%' OR lower("serviceType") LIKE '%package%' THEN 'EXTERNAL_PACKAGE'::"BookingOperationServiceType"
    ELSE 'ACTIVITY'::"BookingOperationServiceType"
  END,
  "operationStatus" = CASE
    WHEN "status" = 'confirmed' THEN 'CONFIRMED'::"BookingOperationServiceStatus"
    WHEN "status" = 'in_progress' THEN 'REQUESTED'::"BookingOperationServiceStatus"
    WHEN "status" = 'ready' THEN 'PENDING'::"BookingOperationServiceStatus"
    ELSE 'PENDING'::"BookingOperationServiceStatus"
  END;

UPDATE "booking_services" service
SET "bookingDayId" = day.id
FROM "booking_days" day
WHERE day."bookingId" = service."bookingId"
  AND service."serviceDate" IS NOT NULL
  AND day.date IS NOT NULL
  AND day.date::date = service."serviceDate"::date;

ALTER TABLE "booking_services"
  ADD CONSTRAINT "booking_services_bookingDayId_fkey"
  FOREIGN KEY ("bookingDayId") REFERENCES "booking_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_services"
  ADD CONSTRAINT "booking_services_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "booking_services_bookingDayId_idx" ON "booking_services"("bookingDayId");
CREATE INDEX "booking_services_vehicleId_idx" ON "booking_services"("vehicleId");
CREATE INDEX "booking_services_operationType_operationStatus_idx" ON "booking_services"("operationType", "operationStatus");

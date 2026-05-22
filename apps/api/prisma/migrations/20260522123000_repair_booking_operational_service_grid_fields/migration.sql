-- Repair for 20260522120000_add_booking_operational_service_grid_fields.
-- Production-safe and idempotent: create enum types before adding values or
-- columns that depend on operational booking metadata.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingOperationServiceType') THEN
    CREATE TYPE "BookingOperationServiceType" AS ENUM (
      'TRANSPORT',
      'GUIDE',
      'HOTEL',
      'ACTIVITY',
      'SERVICE',
      'TICKET',
      'DINING',
      'EXTERNAL_PACKAGE'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingOperationServiceStatus') THEN
    CREATE TYPE "BookingOperationServiceStatus" AS ENUM (
      'PENDING',
      'REQUESTED',
      'CONFIRMED',
      'REJECTED',
      'VOUCHER_SENT',
      'OPERATIONAL_READY',
      'COMPLETED',
      'DONE'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupplierConfirmationStatus') THEN
    CREATE TYPE "SupplierConfirmationStatus" AS ENUM (
      'NOT_SENT',
      'REQUESTED',
      'SENT',
      'ACKNOWLEDGED',
      'CONFIRMED',
      'REJECTED',
      'CANCELLED'
    );
  END IF;
END $$;

ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'SERVICE';
ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'TICKET';
ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'DINING';

ALTER TYPE "BookingOperationServiceStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "BookingOperationServiceStatus" ADD VALUE IF NOT EXISTS 'VOUCHER_SENT';
ALTER TYPE "BookingOperationServiceStatus" ADD VALUE IF NOT EXISTS 'OPERATIONAL_READY';
ALTER TYPE "BookingOperationServiceStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

ALTER TYPE "SupplierConfirmationStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';

ALTER TABLE "booking_services"
ADD COLUMN IF NOT EXISTS "operationalDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "operationalTime" TEXT,
ADD COLUMN IF NOT EXISTS "operationalNotes" TEXT,
ADD COLUMN IF NOT EXISTS "dropoffLocation" TEXT,
ADD COLUMN IF NOT EXISTS "assignedVehicleId" UUID,
ADD COLUMN IF NOT EXISTS "assignedGuideId" UUID,
ADD COLUMN IF NOT EXISTS "supplierConfirmationCode" TEXT,
ADD COLUMN IF NOT EXISTS "voucherStatus" TEXT NOT NULL DEFAULT 'NOT_GENERATED',
ADD COLUMN IF NOT EXISTS "voucherGeneratedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "booking_services_assignedVehicleId_idx" ON "booking_services"("assignedVehicleId");
CREATE INDEX IF NOT EXISTS "booking_services_assignedGuideId_idx" ON "booking_services"("assignedGuideId");

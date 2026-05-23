-- Booking Operational Service Grid foundation.
ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'SERVICE';
ALTER TYPE "BookingOperationServiceType" ADD VALUE IF NOT EXISTS 'TICKET';

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

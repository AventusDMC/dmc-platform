ALTER TABLE "booking_services"
ADD COLUMN IF NOT EXISTS "confirmationReference" TEXT,
ADD COLUMN IF NOT EXISTS "confirmationReceivedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "confirmedBy" UUID;

CREATE INDEX IF NOT EXISTS "booking_services_supplierConfirmationStatus_idx"
  ON "booking_services"("supplierConfirmationStatus");

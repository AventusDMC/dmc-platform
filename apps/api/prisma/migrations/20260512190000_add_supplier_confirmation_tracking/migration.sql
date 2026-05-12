CREATE TYPE "SupplierConfirmationStatus" AS ENUM (
  'NOT_SENT',
  'SENT',
  'ACKNOWLEDGED',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED'
);

ALTER TABLE "booking_services"
  ADD COLUMN "supplierConfirmationStatus" "SupplierConfirmationStatus" NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN "confirmationSentAt" TIMESTAMP(3),
  ADD COLUMN "supplierConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "supplierRemarks" TEXT,
  ADD COLUMN "confirmationDeadline" TIMESTAMP(3),
  ADD COLUMN "lastSupplierContactAt" TIMESTAMP(3);

CREATE INDEX "booking_services_supplierConfirmationStatus_idx"
  ON "booking_services"("supplierConfirmationStatus");

CREATE INDEX "booking_services_confirmationDeadline_idx"
  ON "booking_services"("confirmationDeadline");

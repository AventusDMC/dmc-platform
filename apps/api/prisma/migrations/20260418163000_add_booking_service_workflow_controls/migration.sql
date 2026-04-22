CREATE TYPE "BookingServiceLifecycleStatus" AS ENUM ('pending', 'ready', 'in_progress', 'confirmed', 'cancelled');

ALTER TABLE "booking_services"
ADD COLUMN "status" "BookingServiceLifecycleStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "confirmationRequestedAt" TIMESTAMP(3),
ADD COLUMN "confirmationConfirmedAt" TIMESTAMP(3);

UPDATE "booking_services"
SET
  "status" = CASE
    WHEN "confirmationStatus" = 'confirmed' THEN 'confirmed'::"BookingServiceLifecycleStatus"
    WHEN "confirmationStatus" = 'requested' THEN 'in_progress'::"BookingServiceLifecycleStatus"
    WHEN ("supplierId" IS NOT NULL OR COALESCE("supplierName", '') <> '') AND ("totalCost" > 0 OR "totalSell" > 0)
      THEN 'ready'::"BookingServiceLifecycleStatus"
    ELSE 'pending'::"BookingServiceLifecycleStatus"
  END,
  "confirmationRequestedAt" = CASE
    WHEN "confirmationStatus" IN ('requested', 'confirmed') THEN "updatedAt"
    ELSE NULL
  END,
  "confirmationConfirmedAt" = CASE
    WHEN "confirmationStatus" = 'confirmed' THEN "updatedAt"
    ELSE NULL
  END;

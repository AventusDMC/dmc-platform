-- Driver entity + Vehicle plate number + BookingService.driverId FK.
-- Drivers formalise the per-service driver assignment that previously lived
-- only as a free-text `assigned_to` string on BookingService.

CREATE TABLE "drivers" (
  "id" UUID NOT NULL,
  "fullName" TEXT NOT NULL,
  "phone" TEXT,
  "license_number" TEXT,
  "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "supplierId" UUID,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "drivers_active_fullName_idx" ON "drivers" ("active", "fullName");
CREATE INDEX "drivers_supplierId_idx" ON "drivers" ("supplierId");

ALTER TABLE "vehicles" ADD COLUMN "plate_number" TEXT;

ALTER TABLE "booking_services" ADD COLUMN "driverId" UUID;
CREATE INDEX "booking_services_driverId_idx" ON "booking_services" ("driverId");
ALTER TABLE "booking_services"
  ADD CONSTRAINT "booking_services_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

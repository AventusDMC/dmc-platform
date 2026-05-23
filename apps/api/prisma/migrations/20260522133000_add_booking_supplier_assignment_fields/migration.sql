DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupplierAssignmentStatus') THEN
    CREATE TYPE "SupplierAssignmentStatus" AS ENUM (
      'UNASSIGNED',
      'ASSIGNED',
      'REQUESTED',
      'CONFIRMED',
      'REJECTED'
    );
  END IF;
END $$;

ALTER TABLE "booking_services"
ADD COLUMN IF NOT EXISTS "assignedSupplierId" UUID,
ADD COLUMN IF NOT EXISTS "assignmentStatus" "SupplierAssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED',
ADD COLUMN IF NOT EXISTS "assignmentNotes" TEXT,
ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "assignedBy" UUID;

CREATE INDEX IF NOT EXISTS "booking_services_assignedSupplierId_idx" ON "booking_services"("assignedSupplierId");
CREATE INDEX IF NOT EXISTS "booking_services_assignmentStatus_idx" ON "booking_services"("assignmentStatus");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_services_assignedSupplierId_fkey'
  ) THEN
    ALTER TABLE "booking_services"
    ADD CONSTRAINT "booking_services_assignedSupplierId_fkey"
    FOREIGN KEY ("assignedSupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

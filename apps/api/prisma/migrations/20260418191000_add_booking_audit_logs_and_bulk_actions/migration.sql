CREATE TYPE "BookingAuditEntityType" AS ENUM ('booking', 'booking_service');

CREATE TABLE "booking_audit_logs" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "bookingServiceId" UUID,
    "entityType" "BookingAuditEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_audit_logs_bookingId_createdAt_idx" ON "booking_audit_logs"("bookingId", "createdAt");
CREATE INDEX "booking_audit_logs_bookingServiceId_createdAt_idx" ON "booking_audit_logs"("bookingServiceId", "createdAt");
CREATE INDEX "booking_audit_logs_entityType_entityId_createdAt_idx" ON "booking_audit_logs"("entityType", "entityId", "createdAt");

ALTER TABLE "booking_audit_logs"
ADD CONSTRAINT "booking_audit_logs_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_audit_logs"
ADD CONSTRAINT "booking_audit_logs_bookingServiceId_fkey"
FOREIGN KEY ("bookingServiceId") REFERENCES "booking_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

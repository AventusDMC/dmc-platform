CREATE TYPE "VoucherType" AS ENUM ('TRANSPORT', 'HOTEL', 'GUIDE', 'EXTERNAL_PACKAGE');
CREATE TYPE "VoucherStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

CREATE TABLE "vouchers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "bookingServiceId" UUID NOT NULL,
  "type" "VoucherType" NOT NULL,
  "supplierId" UUID NOT NULL,
  "status" "VoucherStatus" NOT NULL DEFAULT 'DRAFT',
  "issuedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vouchers"
  ADD CONSTRAINT "vouchers_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vouchers"
  ADD CONSTRAINT "vouchers_bookingServiceId_fkey"
  FOREIGN KEY ("bookingServiceId") REFERENCES "booking_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vouchers"
  ADD CONSTRAINT "vouchers_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "vouchers_bookingServiceId_key" ON "vouchers"("bookingServiceId");
CREATE INDEX "vouchers_bookingId_status_idx" ON "vouchers"("bookingId", "status");
CREATE INDEX "vouchers_supplierId_idx" ON "vouchers"("supplierId");

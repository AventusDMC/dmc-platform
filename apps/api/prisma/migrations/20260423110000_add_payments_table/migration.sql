CREATE TYPE "PaymentType" AS ENUM ('CLIENT', 'SUPPLIER');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');
CREATE TYPE "PaymentMethod" AS ENUM ('bank', 'cash', 'card');

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "type" "PaymentType" NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "method" "PaymentMethod" NOT NULL,
  "reference" TEXT,
  "dueDate" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payments_bookingId_type_status_idx" ON "payments"("bookingId", "type", "status");
CREATE INDEX "payments_bookingId_dueDate_idx" ON "payments"("bookingId", "dueDate");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_services"
  ADD COLUMN IF NOT EXISTS "supplierPayableAmount" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "supplierPayableStatus" TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS "supplierPaymentNotes" TEXT;

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'bank_transfer';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'cliq';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'mb_way';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'credit_card';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'custom_manual';

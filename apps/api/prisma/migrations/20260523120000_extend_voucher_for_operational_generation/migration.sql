-- Voucher type / status enums: add operational rows the existing flow didn't cover
ALTER TYPE "VoucherType" ADD VALUE IF NOT EXISTS 'TICKET';
ALTER TYPE "VoucherType" ADD VALUE IF NOT EXISTS 'SERVICE';

ALTER TYPE "VoucherStatus" ADD VALUE IF NOT EXISTS 'GENERATED';

-- Voucher record: timestamps + actor + snapshot for operational generation
ALTER TABLE "vouchers"
ADD COLUMN IF NOT EXISTS "generatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "generatedBy" UUID,
ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "snapshotJson" JSONB;

CREATE INDEX IF NOT EXISTS "vouchers_generatedAt_idx" ON "vouchers"("generatedAt");

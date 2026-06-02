-- AlterTable
-- Applied to the shared Railway DB out-of-band before deploy (additive); guarded
-- so a migrate-deploy re-run is a no-op.
ALTER TABLE "vehicle_rates" ADD COLUMN IF NOT EXISTS "standaloneDeductionAmount" DOUBLE PRECISION;
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "standaloneTransfer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
-- Idempotent: the column is applied to the shared Railway DB out-of-band before
-- deploy (additive + nullable, safe for the running app), so guard against a
-- migrate-deploy re-run finding it already present.
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "transportLabel" TEXT;

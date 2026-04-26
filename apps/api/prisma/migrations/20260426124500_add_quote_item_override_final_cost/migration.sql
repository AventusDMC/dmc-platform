ALTER TABLE "quote_items" ADD COLUMN "finalCost" DOUBLE PRECISION;
ALTER TABLE "quote_items" ADD COLUMN "overrideReason" TEXT;

UPDATE "quote_items"
SET "finalCost" = "totalCost"
WHERE "finalCost" IS NULL;

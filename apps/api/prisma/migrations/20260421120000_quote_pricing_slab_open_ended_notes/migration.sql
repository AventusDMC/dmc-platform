ALTER TABLE "quote_pricing_slabs"
ALTER COLUMN "maxPax" DROP NOT NULL,
ADD COLUMN "notes" TEXT;

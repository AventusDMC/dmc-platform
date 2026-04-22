ALTER TABLE "quotes"
ADD COLUMN "pricingType" TEXT NOT NULL DEFAULT 'simple';

CREATE TABLE "quote_pricing_slabs" (
  "id" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "minPax" INTEGER NOT NULL,
  "maxPax" INTEGER NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "quote_pricing_slabs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_pricing_slabs_quoteId_minPax_maxPax_idx"
ON "quote_pricing_slabs"("quoteId", "minPax", "maxPax");

ALTER TABLE "quote_pricing_slabs"
ADD CONSTRAINT "quote_pricing_slabs_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

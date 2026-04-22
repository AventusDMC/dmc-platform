ALTER TABLE "quotes"
ADD COLUMN "pricingMode" TEXT NOT NULL DEFAULT 'FIXED',
ADD COLUMN "fixedPricePerPerson" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "quotes"
SET
  "pricingMode" = CASE
    WHEN "pricingType" = 'group' THEN 'SLAB'
    ELSE 'FIXED'
  END,
  "fixedPricePerPerson" = COALESCE("pricePerPax", 0);

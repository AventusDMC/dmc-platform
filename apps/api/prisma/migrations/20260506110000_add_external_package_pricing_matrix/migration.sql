ALTER TABLE "quote_items"
  ADD COLUMN "externalPackagePricingMatrixJson" JSONB,
  ADD COLUMN "externalPackageSingleSupplement" DOUBLE PRECISION;

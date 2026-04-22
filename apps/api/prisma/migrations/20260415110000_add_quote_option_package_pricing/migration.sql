CREATE TYPE "QuoteOptionPricingMode" AS ENUM (
  'itemized',
  'package'
);

ALTER TABLE "quote_options"
ADD COLUMN "pricingMode" "QuoteOptionPricingMode" NOT NULL DEFAULT 'itemized',
ADD COLUMN "packageMarginPercent" DOUBLE PRECISION;

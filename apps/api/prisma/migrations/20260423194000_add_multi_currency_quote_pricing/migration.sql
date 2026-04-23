DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TourismFeeMode') THEN
    CREATE TYPE "TourismFeeMode" AS ENUM ('PER_NIGHT_PER_PERSON', 'PER_NIGHT_PER_ROOM');
  END IF;
END $$;

ALTER TABLE "hotel_rates"
  ADD COLUMN "costBaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "costCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "salesTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "salesTaxIncluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serviceChargePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "serviceChargeIncluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tourismFeeAmount" DOUBLE PRECISION,
  ADD COLUMN "tourismFeeCurrency" TEXT,
  ADD COLUMN "tourismFeeMode" "TourismFeeMode";

UPDATE "hotel_rates"
SET
  "costBaseAmount" = COALESCE("cost", 0),
  "costCurrency" = COALESCE(NULLIF(TRIM("currency"), ''), 'USD');

ALTER TABLE "supplier_services"
  ADD COLUMN "costBaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "costCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "salesTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "salesTaxIncluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serviceChargePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "serviceChargeIncluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tourismFeeAmount" DOUBLE PRECISION,
  ADD COLUMN "tourismFeeCurrency" TEXT,
  ADD COLUMN "tourismFeeMode" "TourismFeeMode";

UPDATE "supplier_services"
SET
  "costBaseAmount" = COALESCE("baseCost", 0),
  "costCurrency" = COALESCE(NULLIF(TRIM("currency"), ''), 'USD');

ALTER TABLE "quotes"
  ADD COLUMN "quoteCurrency" TEXT NOT NULL DEFAULT 'USD';

UPDATE "quotes"
SET "quoteCurrency" = 'USD'
WHERE "quoteCurrency" IS NULL OR TRIM("quoteCurrency") = '';

ALTER TABLE "quote_items"
  ADD COLUMN "quoteCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "costBaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "costCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "salesTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "salesTaxIncluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serviceChargePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "serviceChargeIncluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tourismFeeAmount" DOUBLE PRECISION,
  ADD COLUMN "tourismFeeCurrency" TEXT,
  ADD COLUMN "tourismFeeMode" "TourismFeeMode",
  ADD COLUMN "fxRate" DOUBLE PRECISION,
  ADD COLUMN "fxFromCurrency" TEXT,
  ADD COLUMN "fxToCurrency" TEXT,
  ADD COLUMN "fxRateDate" TIMESTAMP(3);

UPDATE "quote_items" qi
SET
  "quoteCurrency" = COALESCE(NULLIF(TRIM(q."quoteCurrency"), ''), 'USD'),
  "costBaseAmount" = COALESCE(qi."baseCost", 0),
  "costCurrency" = COALESCE(NULLIF(TRIM(qi."currency"), ''), 'USD')
FROM "quotes" q
WHERE q."id" = qi."quoteId";

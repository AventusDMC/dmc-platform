DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceRatePricingMode') THEN
    CREATE TYPE "ServiceRatePricingMode" AS ENUM ('PER_PERSON', 'PER_GROUP', 'PER_DAY');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "service_rates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "serviceId" UUID NOT NULL,
  "supplierId" TEXT,
  "costBaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costCurrency" TEXT NOT NULL DEFAULT 'USD',
  "pricingMode" "ServiceRatePricingMode" NOT NULL,
  "salesTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "salesTaxIncluded" BOOLEAN NOT NULL DEFAULT false,
  "serviceChargePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "serviceChargeIncluded" BOOLEAN NOT NULL DEFAULT false,
  "tourismFeeAmount" DOUBLE PRECISION,
  "tourismFeeCurrency" TEXT,
  "tourismFeeMode" "TourismFeeMode",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "service_rates_serviceId_createdAt_idx" ON "service_rates"("serviceId", "createdAt");
CREATE INDEX IF NOT EXISTS "service_rates_supplierId_idx" ON "service_rates"("supplierId");

ALTER TABLE "service_rates"
  ADD CONSTRAINT "service_rates_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "supplier_services"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

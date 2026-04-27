ALTER TABLE "quote_items"
  ADD COLUMN "externalPackageCountry" TEXT,
  ADD COLUMN "externalSupplierName" TEXT,
  ADD COLUMN "externalStartDay" INTEGER,
  ADD COLUMN "externalEndDay" INTEGER,
  ADD COLUMN "externalStartDate" TIMESTAMP(3),
  ADD COLUMN "externalEndDate" TIMESTAMP(3),
  ADD COLUMN "externalPricingBasis" TEXT,
  ADD COLUMN "externalNetCost" DOUBLE PRECISION,
  ADD COLUMN "externalIncludes" TEXT,
  ADD COLUMN "externalExcludes" TEXT,
  ADD COLUMN "externalInternalNotes" TEXT,
  ADD COLUMN "externalClientDescription" TEXT;

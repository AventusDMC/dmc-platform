ALTER TABLE "activity_rate_variants"
  ADD COLUMN "supplierCompanyId" UUID,
  ADD COLUMN "minPax" INTEGER,
  ADD COLUMN "maxPax" INTEGER,
  ADD COLUMN "capacityPricing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "meetingPoint" TEXT,
  ADD COLUMN "operationalNotes" TEXT;

CREATE INDEX "activity_rate_variants_supplierCompanyId_idx" ON "activity_rate_variants"("supplierCompanyId");

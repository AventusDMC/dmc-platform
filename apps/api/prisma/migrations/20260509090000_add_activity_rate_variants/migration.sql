CREATE TABLE "activity_rate_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "activityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "pricingBasis" "ActivityPricingBasis" NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL,
    "sellPrice" DOUBLE PRECISION NOT NULL,
    "maxPaxPerUnit" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_rate_variants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quote_items" ADD COLUMN "activityRateVariantId" UUID;

CREATE INDEX "activity_rate_variants_activityId_active_sortOrder_idx" ON "activity_rate_variants"("activityId", "active", "sortOrder");
CREATE INDEX "quote_items_activityRateVariantId_idx" ON "quote_items"("activityRateVariantId");

ALTER TABLE "activity_rate_variants" ADD CONSTRAINT "activity_rate_variants_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_activityRateVariantId_fkey" FOREIGN KEY ("activityRateVariantId") REFERENCES "activity_rate_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

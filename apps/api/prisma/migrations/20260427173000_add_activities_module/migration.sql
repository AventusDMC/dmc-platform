DO $$ BEGIN
  CREATE TYPE "ActivityPricingBasis" AS ENUM ('PER_PERSON', 'PER_GROUP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "supplierCompanyId" UUID NOT NULL,
  "pricingBasis" "ActivityPricingBasis" NOT NULL,
  "costPrice" DOUBLE PRECISION NOT NULL,
  "sellPrice" DOUBLE PRECISION NOT NULL,
  "durationMinutes" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "activities"
    ADD CONSTRAINT "activities_supplierCompanyId_fkey"
    FOREIGN KEY ("supplierCompanyId") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "activities_active_name_idx" ON "activities"("active", "name");
CREATE INDEX IF NOT EXISTS "activities_supplierCompanyId_idx" ON "activities"("supplierCompanyId");

ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "activityId" UUID;
ALTER TABLE "booking_services" ADD COLUMN IF NOT EXISTS "activityId" UUID;

DO $$ BEGIN
  ALTER TABLE "quote_items"
    ADD CONSTRAINT "quote_items_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "activities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "booking_services"
    ADD CONSTRAINT "booking_services_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "activities"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "quote_items_activityId_idx" ON "quote_items"("activityId");
CREATE INDEX IF NOT EXISTS "booking_services_activityId_idx" ON "booking_services"("activityId");

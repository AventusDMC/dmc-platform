-- Phase I.1: link a PackageTemplate ACTIVITY component to a specific
-- ActivityRateVariant so apply can price it deterministically.
-- Additive, nullable, forward-only. No data backfill.

ALTER TABLE "package_template_components" ADD COLUMN "activityRateVariantId" UUID;

CREATE INDEX "package_template_components_activityRateVariantId_idx" ON "package_template_components"("activityRateVariantId");

ALTER TABLE "package_template_components"
  ADD CONSTRAINT "package_template_components_activityRateVariantId_fkey"
  FOREIGN KEY ("activityRateVariantId") REFERENCES "activity_rate_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

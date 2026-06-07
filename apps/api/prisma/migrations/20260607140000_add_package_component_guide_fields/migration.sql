-- Phase K.1: pax-banded, explicit guide policy on PackageTemplate components.
-- Additive, nullable, forward-only. No backfill. Existing rows get NULL for all
-- new columns, so behaviour is unchanged until K.2 sets values.
--   guideType / guideDuration       -> guide pricing inputs (local|escort, half_day|full_day)
--   guideOvernight / overnightCity  -> escort overnight supplement (off unless escort + true)
--   minPax / maxPax                 -> pax-band applicability (NULL = unbounded)
--   requiresOperatorConfirmation    -> "included but confirm" soft-gate

ALTER TABLE "package_template_components" ADD COLUMN "guideType" TEXT;
ALTER TABLE "package_template_components" ADD COLUMN "guideDuration" TEXT;
ALTER TABLE "package_template_components" ADD COLUMN "guideOvernight" BOOLEAN;
ALTER TABLE "package_template_components" ADD COLUMN "overnightCity" TEXT;
ALTER TABLE "package_template_components" ADD COLUMN "minPax" INTEGER;
ALTER TABLE "package_template_components" ADD COLUMN "maxPax" INTEGER;
ALTER TABLE "package_template_components" ADD COLUMN "requiresOperatorConfirmation" BOOLEAN;

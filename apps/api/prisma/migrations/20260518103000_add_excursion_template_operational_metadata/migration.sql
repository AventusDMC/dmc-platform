ALTER TABLE "excursion_templates"
  ADD COLUMN IF NOT EXISTS "region" TEXT,
  ADD COLUMN IF NOT EXISTS "categoryTags" JSONB,
  ADD COLUMN IF NOT EXISTS "sicPossible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "familyFriendly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fitnessLevel" TEXT,
  ADD COLUMN IF NOT EXISTS "recommendedPaxRange" TEXT,
  ADD COLUMN IF NOT EXISTS "inclusions" TEXT,
  ADD COLUMN IF NOT EXISTS "exclusions" TEXT;

CREATE INDEX IF NOT EXISTS "excursion_templates_region_idx" ON "excursion_templates"("region");
CREATE INDEX IF NOT EXISTS "excursion_templates_sicPossible_idx" ON "excursion_templates"("sicPossible");
CREATE INDEX IF NOT EXISTS "excursion_templates_categoryTags_idx" ON "excursion_templates" USING GIN ("categoryTags");

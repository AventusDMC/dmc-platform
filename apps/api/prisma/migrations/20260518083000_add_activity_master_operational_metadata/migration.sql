ALTER TABLE "activities"
  ADD COLUMN IF NOT EXISTS "durationHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "difficulty" TEXT,
  ADD COLUMN IF NOT EXISTS "guideRequired" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "sicPossible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fitnessLevel" TEXT,
  ADD COLUMN IF NOT EXISTS "familyFriendly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "seasonalRisk" TEXT,
  ADD COLUMN IF NOT EXISTS "terrainType" TEXT,
  ADD COLUMN IF NOT EXISTS "recommendedPaxRange" TEXT,
  ADD COLUMN IF NOT EXISTS "startPoint" TEXT,
  ADD COLUMN IF NOT EXISTS "endPoint" TEXT,
  ADD COLUMN IF NOT EXISTS "inclusions" TEXT,
  ADD COLUMN IF NOT EXISTS "exclusions" TEXT,
  ADD COLUMN IF NOT EXISTS "operationalNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "categoryTags" JSONB,
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

ALTER TABLE "activity_rate_variants"
  ADD COLUMN IF NOT EXISTS "durationHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "sicPossible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fitnessLevel" TEXT,
  ADD COLUMN IF NOT EXISTS "familyFriendly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "seasonalRisk" TEXT,
  ADD COLUMN IF NOT EXISTS "terrainType" TEXT,
  ADD COLUMN IF NOT EXISTS "recommendedPaxRange" TEXT;

CREATE INDEX IF NOT EXISTS "activities_categoryTags_idx" ON "activities" USING GIN ("categoryTags");
CREATE INDEX IF NOT EXISTS "activities_sicPossible_idx" ON "activities"("sicPossible");
CREATE INDEX IF NOT EXISTS "activity_rate_variants_sicPossible_idx" ON "activity_rate_variants"("sicPossible");

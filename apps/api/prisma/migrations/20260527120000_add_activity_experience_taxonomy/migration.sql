-- Guided Quote Builder v2B — Experience taxonomy on Activity.
-- All columns nullable / default false so existing activities stay valid
-- and admin populates incrementally. No backfill — operator decides which
-- activities are CULTURE / ADVENTURE / etc. through the activity editor.

ALTER TABLE "activities" ADD COLUMN "moodCategory" TEXT;
ALTER TABLE "activities" ADD COLUMN "experienceType" TEXT;
ALTER TABLE "activities" ADD COLUMN "operationalIntensity" TEXT;
ALTER TABLE "activities" ADD COLUMN "religiousSignificance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "activities" ADD COLUMN "premiumExperienceFlag" BOOLEAN NOT NULL DEFAULT false;

-- Index backs the per-destination + mood lookup the Guided Journey
-- Composer issues for each destination in the journey.
CREATE INDEX "activities_moodCategory_city_active_idx"
  ON "activities" ("moodCategory", "city", "active");

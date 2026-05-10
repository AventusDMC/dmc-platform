CREATE TYPE "ActivityGuideRequirement" AS ENUM (
    'LOCAL_GUIDE_REQUIRED',
    'OFFICIAL_ACCOMPANYING_GUIDE_ALLOWED',
    'BOTH_ACCEPTED',
    'LOCAL_GUIDE_PLUS_ACCOMPANYING_GUIDE'
);

ALTER TABLE "activities"
    ADD COLUMN "code" TEXT,
    ADD COLUMN "category" TEXT,
    ADD COLUMN "city" TEXT,
    ADD COLUMN "region" TEXT;

ALTER TABLE "activity_rate_variants"
    ADD COLUMN "difficulty" TEXT,
    ADD COLUMN "guideRequired" BOOLEAN,
    ADD COLUMN "guideRequirement" "ActivityGuideRequirement",
    ADD COLUMN "startPoint" TEXT,
    ADD COLUMN "endPoint" TEXT,
    ADD COLUMN "suitability" TEXT,
    ADD COLUMN "fitnessNotes" TEXT,
    ADD COLUMN "waterNotes" TEXT,
    ADD COLUMN "seasonalNotes" TEXT,
    ADD COLUMN "inclusions" TEXT,
    ADD COLUMN "exclusions" TEXT;

CREATE UNIQUE INDEX "activities_code_key" ON "activities"("code");
CREATE INDEX "activities_code_idx" ON "activities"("code");
CREATE INDEX "activities_city_active_idx" ON "activities"("city", "active");

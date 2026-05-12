-- Package Day Planner Phase 1: persisted reusable package itinerary days.

CREATE TABLE "package_template_days" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "packageTemplateId" UUID NOT NULL,
  "dayNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "package_template_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "package_template_days_packageTemplateId_dayNumber_key" ON "package_template_days"("packageTemplateId", "dayNumber");
CREATE INDEX "package_template_days_packageTemplateId_active_dayNumber_idx" ON "package_template_days"("packageTemplateId", "active", "dayNumber");

ALTER TABLE "package_template_components"
  ADD COLUMN "packageTemplateDayId" UUID;

CREATE INDEX "package_template_components_packageTemplateDayId_idx" ON "package_template_components"("packageTemplateDayId");

ALTER TABLE "package_template_days"
  ADD CONSTRAINT "package_template_days_packageTemplateId_fkey"
  FOREIGN KEY ("packageTemplateId") REFERENCES "package_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "package_template_components"
  ADD CONSTRAINT "package_template_components_packageTemplateDayId_fkey"
  FOREIGN KEY ("packageTemplateDayId") REFERENCES "package_template_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "package_template_days" ("packageTemplateId", "dayNumber", "title", "updatedAt")
SELECT
  package_template."id",
  day_series."dayNumber",
  CONCAT('Day ', day_series."dayNumber"),
  CURRENT_TIMESTAMP
FROM "package_templates" package_template
CROSS JOIN LATERAL generate_series(1, package_template."durationDays") AS day_series("dayNumber")
ON CONFLICT ("packageTemplateId", "dayNumber") DO NOTHING;

UPDATE "package_template_components" component
SET "packageTemplateDayId" = package_day."id"
FROM "package_template_days" package_day
WHERE package_day."packageTemplateId" = component."packageTemplateId"
  AND package_day."dayNumber" = component."dayNumber";

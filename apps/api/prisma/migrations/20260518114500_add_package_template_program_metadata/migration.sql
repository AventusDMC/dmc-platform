ALTER TABLE "package_templates"
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "destination" TEXT,
  ADD COLUMN IF NOT EXISTS "inclusions" TEXT,
  ADD COLUMN IF NOT EXISTS "exclusions" TEXT,
  ADD COLUMN IF NOT EXISTS "hotelCategoryNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "guideRules" TEXT,
  ADD COLUMN IF NOT EXISTS "categoryTags" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "package_templates_code_key" ON "package_templates"("code");
CREATE INDEX IF NOT EXISTS "package_templates_code_idx" ON "package_templates"("code");
CREATE INDEX IF NOT EXISTS "package_templates_categoryTags_idx" ON "package_templates" USING GIN ("categoryTags");

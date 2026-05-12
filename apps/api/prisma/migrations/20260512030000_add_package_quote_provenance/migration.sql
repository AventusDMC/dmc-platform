-- Package Template -> Quote Assembly Phase 1 provenance.

ALTER TABLE "quote_itinerary_days"
  ADD COLUMN "packageTemplateId" UUID,
  ADD COLUMN "packageTemplateDayId" UUID;

ALTER TABLE "quote_items"
  ADD COLUMN "packageTemplateId" UUID,
  ADD COLUMN "packageTemplateDayId" UUID,
  ADD COLUMN "packageTemplateComponentId" UUID;

CREATE INDEX "quote_itinerary_days_packageTemplateId_idx" ON "quote_itinerary_days"("packageTemplateId");
CREATE INDEX "quote_itinerary_days_packageTemplateDayId_idx" ON "quote_itinerary_days"("packageTemplateDayId");

CREATE INDEX "quote_items_packageTemplateId_idx" ON "quote_items"("packageTemplateId");
CREATE INDEX "quote_items_packageTemplateDayId_idx" ON "quote_items"("packageTemplateDayId");
CREATE INDEX "quote_items_packageTemplateComponentId_idx" ON "quote_items"("packageTemplateComponentId");

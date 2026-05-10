ALTER TABLE "quote_items"
  ADD COLUMN "excursionTemplateId" UUID,
  ADD COLUMN "excursionTemplateComponentId" UUID,
  ADD COLUMN "excursionTemplateComponentOptional" BOOLEAN;

CREATE INDEX "quote_items_excursionTemplateId_idx" ON "quote_items"("excursionTemplateId");
CREATE INDEX "quote_items_excursionTemplateComponentId_idx" ON "quote_items"("excursionTemplateComponentId");

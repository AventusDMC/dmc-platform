ALTER TABLE "excursion_template_components" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "excursion_template_components_templateId_active_sortOrder_idx" ON "excursion_template_components"("templateId", "active", "sortOrder");

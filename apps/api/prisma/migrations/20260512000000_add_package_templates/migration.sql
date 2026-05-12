-- Package productization Phase 1: reusable commercial package templates
-- linked to existing operational inventory instead of duplicating rows.

CREATE TYPE "PackageTemplateComponentType" AS ENUM (
  'EXCURSION_TEMPLATE',
  'ACTIVITY',
  'HOTEL',
  'TRANSPORT',
  'TICKET'
);

CREATE TABLE "package_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "targetMarket" TEXT,
  "season" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "operationalNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "package_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "package_template_components" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "packageTemplateId" UUID NOT NULL,
  "componentType" "PackageTemplateComponentType" NOT NULL,
  "dayNumber" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isOptional" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "operationalNotes" TEXT,
  "excursionTemplateId" UUID,
  "activityId" UUID,
  "hotelContractId" UUID,
  "routeId" UUID,
  "transportServiceTypeId" UUID,
  "pricingMode" TEXT,
  "supplierServiceId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "package_template_components_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "package_templates_active_name_idx" ON "package_templates"("active", "name");
CREATE INDEX "package_templates_targetMarket_season_idx" ON "package_templates"("targetMarket", "season");
CREATE INDEX "package_template_components_packageTemplateId_dayNumber_sortOrder_idx" ON "package_template_components"("packageTemplateId", "dayNumber", "sortOrder");
CREATE INDEX "package_template_components_componentType_idx" ON "package_template_components"("componentType");
CREATE INDEX "package_template_components_excursionTemplateId_idx" ON "package_template_components"("excursionTemplateId");
CREATE INDEX "package_template_components_activityId_idx" ON "package_template_components"("activityId");
CREATE INDEX "package_template_components_hotelContractId_idx" ON "package_template_components"("hotelContractId");
CREATE INDEX "package_template_components_routeId_idx" ON "package_template_components"("routeId");
CREATE INDEX "package_template_components_transportServiceTypeId_idx" ON "package_template_components"("transportServiceTypeId");
CREATE INDEX "package_template_components_supplierServiceId_idx" ON "package_template_components"("supplierServiceId");

ALTER TABLE "package_template_components"
  ADD CONSTRAINT "package_template_components_packageTemplateId_fkey"
  FOREIGN KEY ("packageTemplateId") REFERENCES "package_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "package_template_components"
  ADD CONSTRAINT "package_template_components_excursionTemplateId_fkey"
  FOREIGN KEY ("excursionTemplateId") REFERENCES "excursion_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "package_template_components"
  ADD CONSTRAINT "package_template_components_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "package_template_components"
  ADD CONSTRAINT "package_template_components_hotelContractId_fkey"
  FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "package_template_components"
  ADD CONSTRAINT "package_template_components_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "package_template_components"
  ADD CONSTRAINT "package_template_components_transportServiceTypeId_fkey"
  FOREIGN KEY ("transportServiceTypeId") REFERENCES "transport_service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "package_template_components"
  ADD CONSTRAINT "package_template_components_supplierServiceId_fkey"
  FOREIGN KEY ("supplierServiceId") REFERENCES "supplier_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

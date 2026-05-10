-- CreateEnum
CREATE TYPE "ExcursionComponentType" AS ENUM ('TRANSPORT', 'TICKET', 'ACTIVITY', 'GUIDE', 'DINING');

-- CreateTable
CREATE TABLE "excursion_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "defaultDepartureCity" TEXT,
    "durationMinutes" INTEGER,
    "operationalNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excursion_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_template_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "templateId" UUID NOT NULL,
    "componentType" "ExcursionComponentType" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "operationalNotes" TEXT,
    "supplierServiceId" UUID,
    "activityId" UUID,
    "routeId" UUID,
    "transportServiceTypeId" UUID,
    "suggestedDepartureCity" TEXT,
    "suggestedArrivalCity" TEXT,
    "durationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excursion_template_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "excursion_templates_code_key" ON "excursion_templates"("code");

-- CreateIndex
CREATE INDEX "excursion_templates_active_name_idx" ON "excursion_templates"("active", "name");

-- CreateIndex
CREATE INDEX "excursion_template_components_templateId_sortOrder_idx" ON "excursion_template_components"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "excursion_template_components_componentType_idx" ON "excursion_template_components"("componentType");

-- CreateIndex
CREATE INDEX "excursion_template_components_supplierServiceId_idx" ON "excursion_template_components"("supplierServiceId");

-- CreateIndex
CREATE INDEX "excursion_template_components_activityId_idx" ON "excursion_template_components"("activityId");

-- CreateIndex
CREATE INDEX "excursion_template_components_routeId_idx" ON "excursion_template_components"("routeId");

-- CreateIndex
CREATE INDEX "excursion_template_components_transportServiceTypeId_idx" ON "excursion_template_components"("transportServiceTypeId");

-- AddForeignKey
ALTER TABLE "excursion_template_components" ADD CONSTRAINT "excursion_template_components_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "excursion_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_template_components" ADD CONSTRAINT "excursion_template_components_supplierServiceId_fkey" FOREIGN KEY ("supplierServiceId") REFERENCES "supplier_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_template_components" ADD CONSTRAINT "excursion_template_components_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_template_components" ADD CONSTRAINT "excursion_template_components_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_template_components" ADD CONSTRAINT "excursion_template_components_transportServiceTypeId_fkey" FOREIGN KEY ("transportServiceTypeId") REFERENCES "transport_service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

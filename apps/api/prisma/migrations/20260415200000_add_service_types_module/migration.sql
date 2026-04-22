CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "supplier_services"
ADD COLUMN "serviceTypeId" UUID;

CREATE INDEX "service_types_isActive_name_idx" ON "service_types"("isActive", "name");

CREATE INDEX "supplier_services_serviceTypeId_idx" ON "supplier_services"("serviceTypeId");

ALTER TABLE "supplier_services"
ADD CONSTRAINT "supplier_services_serviceTypeId_fkey"
FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

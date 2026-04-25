CREATE TYPE "ContractImportType" AS ENUM ('HOTEL', 'TRANSPORT', 'ACTIVITY');
CREATE TYPE "ContractImportStatus" AS ENUM ('DRAFT', 'ANALYZED', 'APPROVED', 'IMPORTED', 'FAILED');

CREATE TABLE "contract_imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contractType" "ContractImportType" NOT NULL,
    "supplierId" UUID,
    "supplierName" TEXT,
    "sourceFileName" TEXT NOT NULL,
    "sourceFilePath" TEXT NOT NULL,
    "sourceContentType" TEXT,
    "contractYear" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" "ContractImportStatus" NOT NULL DEFAULT 'DRAFT',
    "extractedJson" JSONB,
    "approvedJson" JSONB,
    "warnings" JSONB,
    "errors" JSONB,
    "importedEntityId" UUID,
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contract_imports_contractType_status_createdAt_idx" ON "contract_imports"("contractType", "status", "createdAt");
CREATE INDEX "contract_imports_supplierId_idx" ON "contract_imports"("supplierId");

CREATE TABLE "contract_import_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contractImportId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "status" "ContractImportStatus" NOT NULL,
    "actorUserId" UUID,
    "actor" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_import_audit_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contract_import_audit_logs"
ADD CONSTRAINT "contract_import_audit_logs_contractImportId_fkey"
FOREIGN KEY ("contractImportId") REFERENCES "contract_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "contract_import_audit_logs_contractImportId_createdAt_idx" ON "contract_import_audit_logs"("contractImportId", "createdAt");
CREATE INDEX "contract_import_audit_logs_actorUserId_createdAt_idx" ON "contract_import_audit_logs"("actorUserId", "createdAt");

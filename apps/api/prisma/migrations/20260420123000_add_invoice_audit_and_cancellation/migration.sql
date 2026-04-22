ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TABLE "invoice_audit_logs" (
  "id" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "oldValue" TEXT,
  "newValue" TEXT,
  "note" TEXT,
  "actorUserId" UUID,
  "actor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invoice_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_audit_logs_invoiceId_createdAt_idx" ON "invoice_audit_logs"("invoiceId", "createdAt");
CREATE INDEX "invoice_audit_logs_actorUserId_createdAt_idx" ON "invoice_audit_logs"("actorUserId", "createdAt");
CREATE INDEX "invoice_audit_logs_quoteId_createdAt_idx" ON "invoice_audit_logs"("quoteId", "createdAt");

ALTER TABLE "invoice_audit_logs"
ADD CONSTRAINT "invoice_audit_logs_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_audit_logs"
ADD CONSTRAINT "invoice_audit_logs_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

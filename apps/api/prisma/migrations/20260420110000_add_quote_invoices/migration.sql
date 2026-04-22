CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID');

CREATE TABLE "invoices" (
  "id" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "dueDate" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_quoteId_key" ON "invoices"("quoteId");
CREATE INDEX "invoices_status_dueDate_idx" ON "invoices"("status", "dueDate");

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

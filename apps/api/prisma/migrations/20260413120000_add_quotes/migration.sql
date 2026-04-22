CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'sent', 'accepted');

CREATE TABLE "quotes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "totalPrice" DOUBLE PRECISION NOT NULL,
  "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

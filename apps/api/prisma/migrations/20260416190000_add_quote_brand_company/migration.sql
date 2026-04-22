ALTER TABLE "quotes"
ADD COLUMN "brandCompanyId" UUID;

CREATE INDEX "quotes_brandCompanyId_idx" ON "quotes"("brandCompanyId");

ALTER TABLE "quotes"
ADD CONSTRAINT "quotes_brandCompanyId_fkey"
FOREIGN KEY ("brandCompanyId") REFERENCES "companies"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

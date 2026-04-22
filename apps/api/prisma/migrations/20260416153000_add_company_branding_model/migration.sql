CREATE TABLE "company_branding" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "displayName" TEXT,
  "logoUrl" TEXT,
  "headerTitle" TEXT,
  "headerSubtitle" TEXT,
  "footerText" TEXT,
  "website" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "primaryColor" TEXT,
  "secondaryColor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "company_branding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_branding_companyId_key" ON "company_branding"("companyId");

ALTER TABLE "company_branding"
ADD CONSTRAINT "company_branding_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

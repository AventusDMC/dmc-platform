CREATE TYPE "JordanPassType" AS ENUM ('NONE', 'WANDERER', 'EXPLORER', 'EXPERT');

ALTER TABLE "quotes" ADD COLUMN "jordanPassType" "JordanPassType" NOT NULL DEFAULT 'NONE';

CREATE TABLE "entrance_fees" (
  "id" UUID NOT NULL,
  "siteName" TEXT NOT NULL,
  "category" TEXT,
  "foreignerFeeJod" DOUBLE PRECISION NOT NULL,
  "includedInJordanPass" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "source" TEXT,
  "serviceId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "entrance_fees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jordan_pass_products" (
  "id" UUID NOT NULL,
  "code" "JordanPassType" NOT NULL,
  "name" TEXT NOT NULL,
  "priceJod" DOUBLE PRECISION NOT NULL,
  "petraDayCount" INTEGER NOT NULL,
  "visaWaiverNote" TEXT,
  "optionalUpgrade" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "jordan_pass_products_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quote_items" ADD COLUMN "entranceFeeId" UUID;
ALTER TABLE "quote_items" ADD COLUMN "jordanPassCovered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quote_items" ADD COLUMN "jordanPassSavingsJod" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "entrance_fees_serviceId_key" ON "entrance_fees"("serviceId");
CREATE INDEX "entrance_fees_includedInJordanPass_siteName_idx" ON "entrance_fees"("includedInJordanPass", "siteName");
CREATE UNIQUE INDEX "jordan_pass_products_code_key" ON "jordan_pass_products"("code");
CREATE INDEX "jordan_pass_products_isActive_priceJod_idx" ON "jordan_pass_products"("isActive", "priceJod");
CREATE INDEX "quote_items_entranceFeeId_idx" ON "quote_items"("entranceFeeId");

ALTER TABLE "entrance_fees" ADD CONSTRAINT "entrance_fees_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "supplier_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_entranceFeeId_fkey" FOREIGN KEY ("entranceFeeId") REFERENCES "entrance_fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "jordan_pass_products" ("id", "code", "name", "priceJod", "petraDayCount", "visaWaiverNote", "optionalUpgrade", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'WANDERER', 'Jordan Pass Wanderer', 70, 1, 'Includes visa waiver when eligibility conditions are met.', true, true, now(), now()),
  (gen_random_uuid(), 'EXPLORER', 'Jordan Pass Explorer', 75, 2, 'Includes visa waiver when eligibility conditions are met.', true, true, now(), now()),
  (gen_random_uuid(), 'EXPERT', 'Jordan Pass Expert', 80, 3, 'Includes visa waiver when eligibility conditions are met.', true, true, now(), now());

CREATE TYPE "ServiceUnitType" AS ENUM (
  'per_person',
  'per_room',
  'per_vehicle',
  'per_group',
  'per_night',
  'per_day'
);

ALTER TABLE "quotes"
ADD COLUMN "adults" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "children" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "roomCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "nightCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "totalSell" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "pricePerPax" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "quotes"
ALTER COLUMN "totalPrice" SET DEFAULT 0;

UPDATE "quotes"
SET "totalSell" = "totalPrice",
    "pricePerPax" = CASE
      WHEN ("adults" + "children") > 0 THEN "totalPrice" / ("adults" + "children")
      ELSE 0
    END;

CREATE TABLE "supplier_services" (
  "id" UUID NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "unitType" "ServiceUnitType" NOT NULL,
  "baseCost" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_items" (
  "id" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "paxCount" INTEGER,
  "roomCount" INTEGER,
  "nightCount" INTEGER,
  "dayCount" INTEGER,
  "unitCost" DOUBLE PRECISION NOT NULL,
  "markupPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalCost" DOUBLE PRECISION NOT NULL,
  "totalSell" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quote_items"
ADD CONSTRAINT "quote_items_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_items"
ADD CONSTRAINT "quote_items_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "supplier_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

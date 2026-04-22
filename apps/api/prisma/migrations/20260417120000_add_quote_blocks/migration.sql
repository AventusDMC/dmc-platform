CREATE TYPE "QuoteBlockType" AS ENUM ('ITINERARY_DAY', 'SERVICE_BLOCK');

CREATE TABLE "quote_blocks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "QuoteBlockType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "defaultServiceId" UUID,
    "defaultServiceTypeId" UUID,
    "defaultCategory" TEXT,
    "defaultCost" DOUBLE PRECISION,
    "defaultSell" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_blocks_type_name_idx" ON "quote_blocks"("type", "name");
CREATE INDEX "quote_blocks_defaultServiceId_idx" ON "quote_blocks"("defaultServiceId");
CREATE INDEX "quote_blocks_defaultServiceTypeId_idx" ON "quote_blocks"("defaultServiceTypeId");

ALTER TABLE "quote_blocks"
ADD CONSTRAINT "quote_blocks_defaultServiceId_fkey"
FOREIGN KEY ("defaultServiceId") REFERENCES "supplier_services"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_blocks"
ADD CONSTRAINT "quote_blocks_defaultServiceTypeId_fkey"
FOREIGN KEY ("defaultServiceTypeId") REFERENCES "service_types"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

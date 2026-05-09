-- CreateTable
CREATE TABLE "ticket_rate_variants" (
    "id" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL,
    "sellPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'JOD',
    "pricingBasis" "ServiceRatePricingMode" NOT NULL DEFAULT 'PER_PERSON',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_rate_variants_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN "ticketRateVariantId" UUID;

-- CreateIndex
CREATE INDEX "ticket_rate_variants_serviceId_active_sortOrder_idx" ON "ticket_rate_variants"("serviceId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "quote_items_ticketRateVariantId_idx" ON "quote_items"("ticketRateVariantId");

-- AddForeignKey
ALTER TABLE "ticket_rate_variants" ADD CONSTRAINT "ticket_rate_variants_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "supplier_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_ticketRateVariantId_fkey" FOREIGN KEY ("ticketRateVariantId") REFERENCES "ticket_rate_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

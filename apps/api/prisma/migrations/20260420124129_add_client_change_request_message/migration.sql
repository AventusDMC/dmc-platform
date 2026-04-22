/*
  Warnings:

  - A unique constraint covering the columns `[publicToken]` on the table `quotes` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'REVISION_REQUESTED';

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "clientChangeRequestMessage" TEXT,
ADD COLUMN     "publicEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicToken" TEXT;

-- CreateTable
CREATE TABLE "quote_itinerary_days" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_itinerary_day_items" (
    "id" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "quoteServiceId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_itinerary_day_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_itinerary_audit_logs" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "dayId" UUID,
    "itemId" UUID,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "actorUserId" UUID NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_itinerary_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_itinerary_days_quoteId_isActive_sortOrder_idx" ON "quote_itinerary_days"("quoteId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "quote_itinerary_days_quoteId_dayNumber_key" ON "quote_itinerary_days"("quoteId", "dayNumber");

-- CreateIndex
CREATE INDEX "quote_itinerary_day_items_dayId_sortOrder_idx" ON "quote_itinerary_day_items"("dayId", "sortOrder");

-- CreateIndex
CREATE INDEX "quote_itinerary_day_items_quoteServiceId_idx" ON "quote_itinerary_day_items"("quoteServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_itinerary_day_items_dayId_sortOrder_key" ON "quote_itinerary_day_items"("dayId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "quote_itinerary_day_items_dayId_quoteServiceId_key" ON "quote_itinerary_day_items"("dayId", "quoteServiceId");

-- CreateIndex
CREATE INDEX "quote_itinerary_audit_logs_quoteId_createdAt_idx" ON "quote_itinerary_audit_logs"("quoteId", "createdAt");

-- CreateIndex
CREATE INDEX "quote_itinerary_audit_logs_actorUserId_createdAt_idx" ON "quote_itinerary_audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_publicToken_key" ON "quotes"("publicToken");

-- AddForeignKey
ALTER TABLE "quote_itinerary_days" ADD CONSTRAINT "quote_itinerary_days_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_itinerary_day_items" ADD CONSTRAINT "quote_itinerary_day_items_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "quote_itinerary_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_itinerary_day_items" ADD CONSTRAINT "quote_itinerary_day_items_quoteServiceId_fkey" FOREIGN KEY ("quoteServiceId") REFERENCES "quote_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_itinerary_audit_logs" ADD CONSTRAINT "quote_itinerary_audit_logs_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "quote_itinerary_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_itinerary_audit_logs" ADD CONSTRAINT "quote_itinerary_audit_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "quote_itinerary_day_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_itinerary_audit_logs" ADD CONSTRAINT "quote_itinerary_audit_logs_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

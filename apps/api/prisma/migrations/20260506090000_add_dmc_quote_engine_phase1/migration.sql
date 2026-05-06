-- CreateEnum
CREATE TYPE "DmcQuoteSegmentType" AS ENUM ('INTERNAL_JORDAN', 'EXTERNAL_PACKAGE');

-- CreateEnum
CREATE TYPE "DmcQuoteConnectionType" AS ENUM ('FLIGHT', 'BORDER', 'TRANSFER', 'NONE');

-- CreateEnum
CREATE TYPE "DmcQuotePricingBasis" AS ENUM ('PER_PERSON', 'PER_GROUP');

-- CreateEnum
CREATE TYPE "DmcQuoteDayServiceType" AS ENUM ('TRANSPORT', 'HOTEL', 'MEAL', 'GUIDE', 'ENTRANCE', 'ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "DmcExternalPackageRequestStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "DmcQuotePricingMatrixScope" AS ENUM ('TOTAL_QUOTE', 'SEGMENT');

-- CreateTable
CREATE TABLE "dmc_quotes" (
    "id" UUID NOT NULL,
    "clientName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dmc_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmc_quote_segments" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "type" "DmcQuoteSegmentType" NOT NULL,
    "country" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "dmc_quote_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmc_quote_connections" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "fromSegmentId" UUID NOT NULL,
    "toSegmentId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "type" "DmcQuoteConnectionType" NOT NULL DEFAULT 'NONE',
    "description" TEXT,
    "costAmount" DOUBLE PRECISION,
    "costCurrency" TEXT,
    "pricingBasis" "DmcQuotePricingBasis",

    CONSTRAINT "dmc_quote_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmc_quote_days" (
    "id" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mealsIncludedText" TEXT,

    CONSTRAINT "dmc_quote_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmc_quote_day_services" (
    "id" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "type" "DmcQuoteDayServiceType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "supplierId" UUID,
    "costAmount" DOUBLE PRECISION,
    "costCurrency" TEXT,
    "pricingBasis" "DmcQuotePricingBasis",

    CONSTRAINT "dmc_quote_day_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmc_quote_hotel_option_sets" (
    "id" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dmc_quote_hotel_option_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmc_quote_hotel_options" (
    "id" UUID NOT NULL,
    "optionSetId" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "hotelId" UUID,
    "hotelNameSnapshot" TEXT NOT NULL,
    "nights" INTEGER NOT NULL DEFAULT 1,
    "roomType" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,

    CONSTRAINT "dmc_quote_hotel_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmc_external_package_requests" (
    "id" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "supplierName" TEXT NOT NULL,
    "paxRange" TEXT NOT NULL,
    "hotelCategory" TEXT,
    "boardBasis" TEXT,
    "itineraryText" TEXT,
    "notes" TEXT,
    "status" "DmcExternalPackageRequestStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "dmc_external_package_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmc_external_package_quotes" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "supplierName" TEXT NOT NULL,
    "pricingMatrixJson" JSONB NOT NULL,
    "singleSupplement" DOUBLE PRECISION,
    "includesText" TEXT,
    "excludesText" TEXT,
    "notes" TEXT,

    CONSTRAINT "dmc_external_package_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dmc_quote_pricing_matrices" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "scope" "DmcQuotePricingMatrixScope" NOT NULL,
    "segmentId" UUID,
    "rowsJson" JSONB NOT NULL,

    CONSTRAINT "dmc_quote_pricing_matrices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dmc_quotes_startDate_endDate_idx" ON "dmc_quotes"("startDate", "endDate");
CREATE INDEX "dmc_quotes_status_idx" ON "dmc_quotes"("status");
CREATE INDEX "dmc_quote_segments_quoteId_orderIndex_idx" ON "dmc_quote_segments"("quoteId", "orderIndex");
CREATE INDEX "dmc_quote_connections_quoteId_orderIndex_idx" ON "dmc_quote_connections"("quoteId", "orderIndex");
CREATE INDEX "dmc_quote_connections_fromSegmentId_idx" ON "dmc_quote_connections"("fromSegmentId");
CREATE INDEX "dmc_quote_connections_toSegmentId_idx" ON "dmc_quote_connections"("toSegmentId");
CREATE UNIQUE INDEX "dmc_quote_days_segmentId_dayNumber_key" ON "dmc_quote_days"("segmentId", "dayNumber");
CREATE INDEX "dmc_quote_days_segmentId_idx" ON "dmc_quote_days"("segmentId");
CREATE INDEX "dmc_quote_day_services_dayId_idx" ON "dmc_quote_day_services"("dayId");
CREATE INDEX "dmc_quote_day_services_supplierId_idx" ON "dmc_quote_day_services"("supplierId");
CREATE INDEX "dmc_quote_hotel_option_sets_segmentId_sortOrder_idx" ON "dmc_quote_hotel_option_sets"("segmentId", "sortOrder");
CREATE INDEX "dmc_quote_hotel_options_optionSetId_idx" ON "dmc_quote_hotel_options"("optionSetId");
CREATE INDEX "dmc_quote_hotel_options_hotelId_idx" ON "dmc_quote_hotel_options"("hotelId");
CREATE INDEX "dmc_external_package_requests_segmentId_idx" ON "dmc_external_package_requests"("segmentId");
CREATE INDEX "dmc_external_package_requests_status_idx" ON "dmc_external_package_requests"("status");
CREATE INDEX "dmc_external_package_quotes_requestId_idx" ON "dmc_external_package_quotes"("requestId");
CREATE INDEX "dmc_quote_pricing_matrices_quoteId_scope_idx" ON "dmc_quote_pricing_matrices"("quoteId", "scope");
CREATE INDEX "dmc_quote_pricing_matrices_segmentId_idx" ON "dmc_quote_pricing_matrices"("segmentId");

-- AddForeignKey
ALTER TABLE "dmc_quote_segments" ADD CONSTRAINT "dmc_quote_segments_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "dmc_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_connections" ADD CONSTRAINT "dmc_quote_connections_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "dmc_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_connections" ADD CONSTRAINT "dmc_quote_connections_fromSegmentId_fkey" FOREIGN KEY ("fromSegmentId") REFERENCES "dmc_quote_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_connections" ADD CONSTRAINT "dmc_quote_connections_toSegmentId_fkey" FOREIGN KEY ("toSegmentId") REFERENCES "dmc_quote_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_days" ADD CONSTRAINT "dmc_quote_days_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "dmc_quote_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_day_services" ADD CONSTRAINT "dmc_quote_day_services_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "dmc_quote_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_day_services" ADD CONSTRAINT "dmc_quote_day_services_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_hotel_option_sets" ADD CONSTRAINT "dmc_quote_hotel_option_sets_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "dmc_quote_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_hotel_options" ADD CONSTRAINT "dmc_quote_hotel_options_optionSetId_fkey" FOREIGN KEY ("optionSetId") REFERENCES "dmc_quote_hotel_option_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_hotel_options" ADD CONSTRAINT "dmc_quote_hotel_options_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dmc_external_package_requests" ADD CONSTRAINT "dmc_external_package_requests_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "dmc_quote_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_external_package_quotes" ADD CONSTRAINT "dmc_external_package_quotes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dmc_external_package_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_pricing_matrices" ADD CONSTRAINT "dmc_quote_pricing_matrices_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "dmc_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dmc_quote_pricing_matrices" ADD CONSTRAINT "dmc_quote_pricing_matrices_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "dmc_quote_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

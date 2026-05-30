warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- DropForeignKey
ALTER TABLE "dmc_quote_segments" DROP CONSTRAINT "dmc_quote_segments_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_connections" DROP CONSTRAINT "dmc_quote_connections_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_connections" DROP CONSTRAINT "dmc_quote_connections_fromSegmentId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_connections" DROP CONSTRAINT "dmc_quote_connections_toSegmentId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_days" DROP CONSTRAINT "dmc_quote_days_segmentId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_day_services" DROP CONSTRAINT "dmc_quote_day_services_dayId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_day_services" DROP CONSTRAINT "dmc_quote_day_services_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_hotel_option_sets" DROP CONSTRAINT "dmc_quote_hotel_option_sets_segmentId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_hotel_options" DROP CONSTRAINT "dmc_quote_hotel_options_optionSetId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_hotel_options" DROP CONSTRAINT "dmc_quote_hotel_options_hotelId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_external_package_requests" DROP CONSTRAINT "dmc_external_package_requests_segmentId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_external_package_quotes" DROP CONSTRAINT "dmc_external_package_quotes_requestId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_pricing_matrices" DROP CONSTRAINT "dmc_quote_pricing_matrices_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "dmc_quote_pricing_matrices" DROP CONSTRAINT "dmc_quote_pricing_matrices_segmentId_fkey";

-- DropTable
DROP TABLE "dmc_quotes";

-- DropTable
DROP TABLE "dmc_quote_segments";

-- DropTable
DROP TABLE "dmc_quote_connections";

-- DropTable
DROP TABLE "dmc_quote_days";

-- DropTable
DROP TABLE "dmc_quote_day_services";

-- DropTable
DROP TABLE "dmc_quote_hotel_option_sets";

-- DropTable
DROP TABLE "dmc_quote_hotel_options";

-- DropTable
DROP TABLE "dmc_external_package_requests";

-- DropTable
DROP TABLE "dmc_external_package_quotes";

-- DropTable
DROP TABLE "dmc_quote_pricing_matrices";

-- DropEnum
DROP TYPE "DmcQuoteSegmentType";

-- DropEnum
DROP TYPE "DmcQuoteConnectionType";

-- DropEnum
DROP TYPE "DmcQuotePricingBasis";

-- DropEnum
DROP TYPE "DmcQuoteDayServiceType";

-- DropEnum
DROP TYPE "DmcExternalPackageRequestStatus";

-- DropEnum
DROP TYPE "DmcQuotePricingMatrixScope";


CREATE TYPE "TransportServiceClassification" AS ENUM ('ROUTE_TRANSFER', 'FULL_DAY', 'HALF_DAY', 'DAILY_PACKAGE', 'ADD_ON');

ALTER TABLE "transport_service_types"
ADD COLUMN "classification" "TransportServiceClassification" NOT NULL DEFAULT 'ROUTE_TRANSFER';

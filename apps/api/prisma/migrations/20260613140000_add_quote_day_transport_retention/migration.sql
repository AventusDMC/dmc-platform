-- PR6 of the transport contract-regime refactor.
-- ADDITIVE, nullable, METADATA ONLY — transport day-classification fields on
-- quote_itinerary_days. NULL everywhere on deploy = identical to current behavior; read
-- only by the package-eligibility SHADOW path. No DB enum (transportDayType validated in
-- TS against the OperationalTransportType const). No backfill. Fully reversible:
--   ALTER TABLE "quote_itinerary_days"
--     DROP COLUMN "transportDayType", DROP COLUMN "vehicleRetained",
--     DROP COLUMN "vehicleReleased", DROP COLUMN "inRetainedBlock";

-- AlterTable
ALTER TABLE "quote_itinerary_days" ADD COLUMN     "inRetainedBlock" BOOLEAN,
ADD COLUMN     "transportDayType" TEXT,
ADD COLUMN     "vehicleReleased" BOOLEAN,
ADD COLUMN     "vehicleRetained" BOOLEAN;

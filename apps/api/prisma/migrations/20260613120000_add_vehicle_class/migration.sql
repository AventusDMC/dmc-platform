-- PR1 of the transport contract-regime refactor.
-- Additive, nullable column. Legacy "vehicle_type" is preserved untouched.
-- No DB enum yet (validation lives in the VehicleClass TS const); no backfill here
-- (backfill is run idempotently by vehicle id after deploy). Fully reversible:
--   ALTER TABLE "vehicles" DROP COLUMN "vehicle_class";

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN "vehicle_class" TEXT;

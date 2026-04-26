-- AlterTable
ALTER TABLE "contract_import_audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "contract_imports" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "hotel_rates_hotelId_seasonFrom_seasonTo_occupancyType_mealPlan_" RENAME TO "hotel_rates_hotelId_seasonFrom_seasonTo_occupancyType_mealP_idx";

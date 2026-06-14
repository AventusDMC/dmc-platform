-- PR10B-1 of the transport contract-regime refactor.
-- ADDITIVE, nullable, METADATA ONLY — manual transport pricing-option selection on quotes.
-- NEVER applied to live totals/items (apply is a later, explicit PR). NULL everywhere on
-- deploy = identical to current behavior. No backfill. Fully reversible:
--   ALTER TABLE "quotes"
--     DROP COLUMN "selectedTransportPricingOption", DROP COLUMN "selectedTransportContractId",
--     DROP COLUMN "transportSelectionIsManual", DROP COLUMN "transportSelectionAt",
--     DROP COLUMN "transportSelectionByUserId";

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "selectedTransportContractId" UUID,
ADD COLUMN     "selectedTransportPricingOption" TEXT,
ADD COLUMN     "transportSelectionAt" TIMESTAMP(3),
ADD COLUMN     "transportSelectionByUserId" UUID,
ADD COLUMN     "transportSelectionIsManual" BOOLEAN;

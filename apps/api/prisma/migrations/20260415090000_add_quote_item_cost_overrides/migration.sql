ALTER TABLE "quote_items"
ADD COLUMN "baseCost" DOUBLE PRECISION,
ADD COLUMN "overrideCost" DOUBLE PRECISION,
ADD COLUMN "useOverride" BOOLEAN NOT NULL DEFAULT false;

UPDATE "quote_items"
SET "baseCost" = "unitCost";

ALTER TABLE "quote_items"
ALTER COLUMN "baseCost" SET NOT NULL;

ALTER TABLE "quote_items"
DROP COLUMN "unitCost";

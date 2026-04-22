ALTER TABLE "quote_pricing_slabs"
ADD COLUMN "actualPax" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "focPax" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "payingPax" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "totalSell" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "pricePerPayingPax" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "pricePerActualPax" DOUBLE PRECISION;

UPDATE "quote_pricing_slabs"
SET
  "actualPax" = GREATEST("minPax", 1),
  "focPax" = 0,
  "payingPax" = GREATEST("minPax", 1),
  "totalCost" = 0,
  "totalSell" = ROUND(("price" * GREATEST("minPax", 1))::numeric, 2)::double precision,
  "pricePerPayingPax" = "price",
  "pricePerActualPax" = "price";

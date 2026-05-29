-- Contract-level group FOC (free-of-charge) policy, mirroring the Quote FOC fields.
ALTER TABLE "hotel_contracts" ADD COLUMN "focType" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "hotel_contracts" ADD COLUMN "focRatio" DOUBLE PRECISION;
ALTER TABLE "hotel_contracts" ADD COLUMN "focCount" INTEGER;
ALTER TABLE "hotel_contracts" ADD COLUMN "focRoomType" TEXT;

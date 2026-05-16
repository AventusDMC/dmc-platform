ALTER TABLE "series" ADD COLUMN "programVariantsJson" JSONB;
ALTER TABLE "series" ADD COLUMN "branchExtensionsJson" JSONB;
ALTER TABLE "series" ADD COLUMN "sharedCoreServicesJson" JSONB;

ALTER TABLE "series_departures" ADD COLUMN "splitServicesJson" JSONB;

ALTER TABLE "booking_passengers" ADD COLUMN "hotelCategoryVariant" TEXT;
ALTER TABLE "booking_passengers" ADD COLUMN "branchExtension" TEXT;

CREATE INDEX "booking_passengers_hotelCategoryVariant_idx" ON "booking_passengers"("hotelCategoryVariant");
CREATE INDEX "booking_passengers_branchExtension_idx" ON "booking_passengers"("branchExtension");

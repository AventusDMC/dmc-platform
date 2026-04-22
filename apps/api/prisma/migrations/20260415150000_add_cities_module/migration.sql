CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "hotels" ADD COLUMN "cityId" UUID;
ALTER TABLE "places" ADD COLUMN "cityId" UUID;

CREATE INDEX "cities_isActive_name_idx" ON "cities"("isActive", "name");
CREATE INDEX "hotels_cityId_idx" ON "hotels"("cityId");
CREATE INDEX "places_cityId_idx" ON "places"("cityId");

ALTER TABLE "hotels"
ADD CONSTRAINT "hotels_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "places"
ADD CONSTRAINT "places_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

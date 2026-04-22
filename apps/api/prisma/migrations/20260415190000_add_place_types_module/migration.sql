CREATE TABLE "place_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_types_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "place_types_isActive_name_idx" ON "place_types"("isActive", "name");

ALTER TABLE "places"
ADD COLUMN "placeTypeId" UUID;

CREATE INDEX "places_placeTypeId_idx" ON "places"("placeTypeId");

ALTER TABLE "places"
ADD CONSTRAINT "places_placeTypeId_fkey"
FOREIGN KEY ("placeTypeId") REFERENCES "place_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "hotel_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "hotels" ADD COLUMN "hotelCategoryId" UUID;
ALTER TABLE "quote_options" ADD COLUMN "hotelCategoryId" UUID;

CREATE INDEX "hotel_categories_isActive_name_idx" ON "hotel_categories"("isActive", "name");
CREATE INDEX "hotels_hotelCategoryId_idx" ON "hotels"("hotelCategoryId");
CREATE INDEX "quote_options_hotelCategoryId_idx" ON "quote_options"("hotelCategoryId");

ALTER TABLE "hotels"
ADD CONSTRAINT "hotels_hotelCategoryId_fkey" FOREIGN KEY ("hotelCategoryId") REFERENCES "hotel_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quote_options"
ADD CONSTRAINT "quote_options_hotelCategoryId_fkey" FOREIGN KEY ("hotelCategoryId") REFERENCES "hotel_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "hotel_categories" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT
  (
    substr(md5("category"), 1, 8) || '-' ||
    substr(md5("category"), 9, 4) || '-' ||
    substr(md5("category"), 13, 4) || '-' ||
    substr(md5("category"), 17, 4) || '-' ||
    substr(md5("category"), 21, 12)
  )::uuid,
  "category",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "hotels"
WHERE trim("category") <> ''
GROUP BY "category";

UPDATE "hotels" AS h
SET "hotelCategoryId" = hc."id"
FROM "hotel_categories" AS hc
WHERE h."category" = hc."name";

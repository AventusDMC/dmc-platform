-- Hotels Engine v2 — RateHawk hotel candidates staging table.
--
-- Holds the raw hotel records pulled from the RateHawk Hotel Content
-- API (hotel/info/dump/ or hotel/info/) before an operator promotes
-- them into the live `hotels` catalog. Keeping the raw JSON lets us
-- re-import or re-map without re-fetching from RateHawk.

CREATE TABLE "ratehawk_hotel_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ratehawk_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "city_name" TEXT,
    "address_line" TEXT,
    "star_rating" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "chain_name" TEXT,
    "kind" TEXT,
    "photo_count" INTEGER NOT NULL DEFAULT 0,
    "raw_json" JSONB NOT NULL,
    "imported_hotel_id" UUID,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ratehawk_hotel_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ratehawk_hotel_candidates_ratehawk_id_key" ON "ratehawk_hotel_candidates"("ratehawk_id");
CREATE INDEX "ratehawk_hotel_candidates_country_code_city_name_idx" ON "ratehawk_hotel_candidates"("country_code", "city_name");
CREATE INDEX "ratehawk_hotel_candidates_imported_hotel_id_idx" ON "ratehawk_hotel_candidates"("imported_hotel_id");
CREATE INDEX "ratehawk_hotel_candidates_star_rating_idx" ON "ratehawk_hotel_candidates"("star_rating");

ALTER TABLE "ratehawk_hotel_candidates"
    ADD CONSTRAINT "ratehawk_hotel_candidates_imported_hotel_id_fkey"
    FOREIGN KEY ("imported_hotel_id") REFERENCES "hotels"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

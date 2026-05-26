-- Preferred Operational Area Logic (v2C addendum) — operationally
-- primary areas win when multiple areas share a city + type. Example:
-- QAIA=1, Marka=2 within AIRPORT for Amman. NULL = lowest priority,
-- falls back to PREFERRED_TYPE_ORDER + alphabetical sort.

ALTER TABLE "operational_areas" ADD COLUMN "priority" INTEGER;

-- Seed the known Jordan primary areas. Operator can refine via the
-- /operational-areas admin form. We only set explicit priorities on
-- rows whose code matches the seed migration's identifiers — anything
-- else stays NULL.
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'AMM';
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'QAIA';
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'PET';
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'WR';
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'AQJ';
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'DS';
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'JER';
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'MAD';
UPDATE "operational_areas" SET "priority" = 2 WHERE "code" = 'NEB';
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'AJL';
UPDATE "operational_areas" SET "priority" = 2 WHERE "code" = 'KRK';
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'IRB';
-- Borders: Allenby is the busiest crossing → priority 1; Sheikh Hussein 2; Wadi Araba 3
UPDATE "operational_areas" SET "priority" = 1 WHERE "code" = 'ALLENBY';
UPDATE "operational_areas" SET "priority" = 2 WHERE "code" = 'SHB';
UPDATE "operational_areas" SET "priority" = 3 WHERE "code" = 'WAB';

-- Index supports sorting by city + priority during area lookup.
CREATE INDEX "operational_areas_city_priority_idx"
  ON "operational_areas"("city", "priority");

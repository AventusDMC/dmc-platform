ALTER TABLE "cities" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "cities" ADD COLUMN "longitude" DOUBLE PRECISION;

UPDATE "cities"
SET
  "latitude" = CASE lower("name")
    WHEN 'amman' THEN 31.9539
    WHEN 'petra' THEN 30.3285
    WHEN 'wadi rum' THEN 29.5321
    WHEN 'dead sea' THEN 31.5590
    WHEN 'aqaba' THEN 29.5321
    WHEN 'jerash' THEN 32.2808
    WHEN 'madaba' THEN 31.7167
    ELSE 0
  END,
  "longitude" = CASE lower("name")
    WHEN 'amman' THEN 35.9106
    WHEN 'petra' THEN 35.4444
    WHEN 'wadi rum' THEN 35.4210
    WHEN 'dead sea' THEN 35.4732
    WHEN 'aqaba' THEN 35.0063
    WHEN 'jerash' THEN 35.8997
    WHEN 'madaba' THEN 35.7939
    ELSE 0
  END;

ALTER TABLE "cities" ALTER COLUMN "latitude" SET NOT NULL;
ALTER TABLE "cities" ALTER COLUMN "longitude" SET NOT NULL;

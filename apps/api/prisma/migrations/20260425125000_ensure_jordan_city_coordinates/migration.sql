WITH jordan_cities("name", "country", "latitude", "longitude") AS (
  VALUES
    ('Amman', 'Jordan', 31.9539, 35.9106),
    ('Petra', 'Jordan', 30.3285, 35.4444),
    ('Wadi Rum', 'Jordan', 29.5321, 35.4210),
    ('Dead Sea', 'Jordan', 31.5590, 35.4732),
    ('Aqaba', 'Jordan', 29.5321, 35.0063),
    ('Jerash', 'Jordan', 32.2808, 35.8997),
    ('Madaba', 'Jordan', 31.7167, 35.7939)
)
UPDATE "cities"
SET
  "country" = jordan_cities."country",
  "latitude" = jordan_cities."latitude",
  "longitude" = jordan_cities."longitude",
  "isActive" = true
FROM jordan_cities
WHERE lower("cities"."name") = lower(jordan_cities."name");

WITH jordan_cities("name", "country", "latitude", "longitude") AS (
  VALUES
    ('Amman', 'Jordan', 31.9539, 35.9106),
    ('Petra', 'Jordan', 30.3285, 35.4444),
    ('Wadi Rum', 'Jordan', 29.5321, 35.4210),
    ('Dead Sea', 'Jordan', 31.5590, 35.4732),
    ('Aqaba', 'Jordan', 29.5321, 35.0063),
    ('Jerash', 'Jordan', 32.2808, 35.8997),
    ('Madaba', 'Jordan', 31.7167, 35.7939)
)
INSERT INTO "cities" ("id", "name", "country", "latitude", "longitude", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), jordan_cities."name", jordan_cities."country", jordan_cities."latitude", jordan_cities."longitude", true, now(), now()
FROM jordan_cities
WHERE NOT EXISTS (
  SELECT 1 FROM "cities" WHERE lower("cities"."name") = lower(jordan_cities."name")
);

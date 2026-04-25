ALTER TABLE "routes" ADD COLUMN "normalizedKey" TEXT;

UPDATE "routes"
SET
  "name" = trim("fromPlace"."name") || ' → ' || trim("toPlace"."name"),
  "normalizedKey" = regexp_replace(
    regexp_replace(
      lower(trim("fromPlace"."name") || '_' || trim("toPlace"."name")),
      '[^a-z0-9]+',
      '_',
      'g'
    ),
    '^_+|_+$',
    '',
    'g'
  )
FROM "places" AS "fromPlace", "places" AS "toPlace"
WHERE "routes"."fromPlaceId" = "fromPlace"."id"
  AND "routes"."toPlaceId" = "toPlace"."id";

ALTER TABLE "routes" ALTER COLUMN "normalizedKey" SET NOT NULL;

CREATE UNIQUE INDEX "routes_normalizedKey_key" ON "routes"("normalizedKey");

ALTER TABLE "bookings"
ADD COLUMN "accessToken" TEXT;

UPDATE "bookings"
SET "accessToken" = md5("id" || clock_timestamp()::text || random()::text) || md5(random()::text || "bookingRef" || clock_timestamp()::text)
WHERE "accessToken" IS NULL;

ALTER TABLE "bookings"
ALTER COLUMN "accessToken" SET NOT NULL;

CREATE UNIQUE INDEX "bookings_accessToken_key" ON "bookings"("accessToken");

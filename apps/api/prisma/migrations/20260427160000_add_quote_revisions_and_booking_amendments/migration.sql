ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_quoteId_key";
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_acceptedVersionId_key";

ALTER TABLE "quotes" ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "quotes" ADD COLUMN "revisedFromId" UUID;
ALTER TABLE "bookings" ADD COLUMN "amendmentNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bookings" ADD COLUMN "amendedFromId" UUID;

CREATE INDEX "quotes_revisedFromId_idx" ON "quotes"("revisedFromId");
CREATE INDEX "bookings_amendedFromId_idx" ON "bookings"("amendedFromId");

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_revisedFromId_fkey" FOREIGN KEY ("revisedFromId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_amendedFromId_fkey" FOREIGN KEY ("amendedFromId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

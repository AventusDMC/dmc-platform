CREATE TYPE "BookingStatus" AS ENUM ('draft', 'confirmed', 'in_progress', 'completed', 'cancelled');

CREATE TABLE "bookings" (
  "id" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "acceptedVersionId" UUID NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bookings_quoteId_key" ON "bookings"("quoteId");
CREATE UNIQUE INDEX "bookings_acceptedVersionId_key" ON "bookings"("acceptedVersionId");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "quotes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_acceptedVersionId_fkey"
  FOREIGN KEY ("acceptedVersionId") REFERENCES "quote_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

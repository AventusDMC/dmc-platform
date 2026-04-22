CREATE TYPE "BookingType" AS ENUM ('FIT', 'GROUP', 'SERIES');

CREATE TYPE "BookingRoomOccupancy" AS ENUM ('single', 'double', 'triple', 'quad', 'unknown');

ALTER TABLE "quotes"
ADD COLUMN "bookingType" "BookingType" NOT NULL DEFAULT 'FIT';

ALTER TABLE "bookings"
ADD COLUMN "bookingType" "BookingType" NOT NULL DEFAULT 'FIT';

CREATE INDEX "quotes_bookingType_idx" ON "quotes"("bookingType");
CREATE INDEX "bookings_bookingType_idx" ON "bookings"("bookingType");

CREATE TABLE "booking_passengers" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "title" TEXT,
  "isLead" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_passengers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_rooming_entries" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "roomType" TEXT,
  "occupancy" "BookingRoomOccupancy" NOT NULL DEFAULT 'unknown',
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_rooming_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_rooming_assignments" (
  "id" UUID NOT NULL,
  "bookingRoomingEntryId" UUID NOT NULL,
  "bookingPassengerId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_rooming_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_passengers_bookingId_isLead_idx" ON "booking_passengers"("bookingId", "isLead");
CREATE INDEX "booking_rooming_entries_bookingId_sortOrder_idx" ON "booking_rooming_entries"("bookingId", "sortOrder");
CREATE UNIQUE INDEX "booking_rooming_assignments_bookingRoomingEntryId_bookingPassengerId_key" ON "booking_rooming_assignments"("bookingRoomingEntryId", "bookingPassengerId");
CREATE INDEX "booking_rooming_assignments_bookingPassengerId_idx" ON "booking_rooming_assignments"("bookingPassengerId");

ALTER TABLE "booking_passengers"
ADD CONSTRAINT "booking_passengers_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_rooming_entries"
ADD CONSTRAINT "booking_rooming_entries_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_rooming_assignments"
ADD CONSTRAINT "booking_rooming_assignments_bookingRoomingEntryId_fkey"
FOREIGN KEY ("bookingRoomingEntryId") REFERENCES "booking_rooming_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_rooming_assignments"
ADD CONSTRAINT "booking_rooming_assignments_bookingPassengerId_fkey"
FOREIGN KEY ("bookingPassengerId") REFERENCES "booking_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

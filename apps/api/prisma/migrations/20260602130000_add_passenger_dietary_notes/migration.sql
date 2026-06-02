-- Per-passenger dietary requirements — previously dietary data lived only at
-- the service/meal level, not against each traveler. Nullable; backward-compatible.

ALTER TABLE "booking_passengers" ADD COLUMN "dietaryNotes" TEXT;

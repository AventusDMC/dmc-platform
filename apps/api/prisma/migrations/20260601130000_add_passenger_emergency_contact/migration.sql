-- Per-passenger emergency contacts — next-of-kin name + phone captured
-- against each booking passenger (distinct from the DMC's own 24/7
-- emergency line printed on vouchers). Both nullable; backward-compatible.

ALTER TABLE "booking_passengers" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "booking_passengers" ADD COLUMN "emergencyContactPhone" TEXT;
